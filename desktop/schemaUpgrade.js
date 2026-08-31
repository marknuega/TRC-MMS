/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Bringing an already-installed desktop database up to the current schema.
 *
 * This build had no way to do that. ensureDatabase() copies template.db when
 * there is no database and never touches one that already exists — which was
 * fine while the schema never changed, and became a bug the moment it did: a
 * new column ships in the app, the app queries it, and Prisma fails against
 * every database already out there. Reinstalling would not fix it either; the
 * data folder deliberately survives an install, which is the whole reason
 * upgrading has never cost anybody their reports.
 *
 * Run through the PRISMA client rather than a SQLite driver of its own. There
 * is exactly one SQLite engine known to load inside this packaged app — the
 * query engine shipped unpacked beside the asar, because Windows cannot load a
 * .node binary from inside an archive — and this is it. node:sqlite would be
 * simpler and is a second engine to be right about, on a platform where it is
 * still experimental and may be compiled out.
 *
 * Checked against the database's own catalogue rather than a version stamp. A
 * stamp can be wrong — restored from a backup, copied from another machine,
 * edited by hand — and being wrong looks exactly like being right. PRAGMA
 * table_info cannot be: it is what the database actually has.
 *
 * RESUMABLE, which is the part worth reading twice. SQLite runs each DDL
 * statement in its own implicit transaction and will not roll an ALTER back
 * into one we opened, so a step CAN die half-applied — the machine loses power
 * between two ALTERs. Every statement is therefore either guarded by its own
 * existence check or written to be harmless twice, and a step counts as done
 * only when EVERY artefact it creates is present. Marking it done off the first
 * column would skip the rest forever, and the app would fail on a table the
 * upgrade believed it had made.
 *
 * ADDITIVE ONLY, and by design. New columns and new tables, with defaults, so
 * an upgrade cannot lose a row. A rename, a narrowing or a drop is a data
 * migration and does not belong in something that runs unattended before the
 * window is on screen, on a machine whose only copy is the file being changed.
 */

/**
 * Steps, oldest first.
 *
 *   columns  added one at a time, each skipped if already there (SQLite's ADD
 *            COLUMN has no IF NOT EXISTS and errors on a duplicate)
 *   sql      statements that are safe to run twice — IF NOT EXISTS, or an
 *            UPDATE whose WHERE stops matching once it has run
 *   done     every artefact present; the step is skipped entirely only then
 */
const STEPS = [
  {
    name: 'entry sync (sync_id, sync_rev, entry_tombstones)',
    // Two-way entry sync needs an identity two machines can agree on and a
    // revision to compare. See server/src/entrySync.js.
    columns: [
      ['report_entries', 'sync_id', 'TEXT'],
      ['report_entries', 'sync_rev', 'DATETIME'],
    ],
    sql: [
      // A distinct id per row. SQLite has no uuid(); 128 random bits in hex do
      // not collide with each other or with the server's, which is all these
      // have to manage. The WHERE is what makes it safe to run again.
      `UPDATE "report_entries"
          SET "sync_id" = lower(hex(randomblob(16))),
              "sync_rev" = COALESCE("updated_at", "created_at", CURRENT_TIMESTAMP)
        WHERE "sync_id" IS NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "report_entries_sync_id_key" ON "report_entries"("sync_id")`,
      `CREATE TABLE IF NOT EXISTS "entry_tombstones" (
         "sync_id" TEXT NOT NULL PRIMARY KEY,
         "branch" TEXT NOT NULL DEFAULT '',
         "mode" TEXT NOT NULL DEFAULT 'report',
         "deleted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE INDEX IF NOT EXISTS "entry_tombstones_deleted_at_idx" ON "entry_tombstones"("deleted_at")`,
    ],
    done: async (prisma) =>
      (await hasColumn(prisma, 'report_entries', 'sync_id')) &&
      (await hasColumn(prisma, 'report_entries', 'sync_rev')) &&
      (await hasTable(prisma, 'entry_tombstones')),
  },
  {
    name: 'entry sync counter (sync_origin, change_seq, sync_rev as a number)',
    // sync_rev stops being a moment and becomes a count of edits, so that no
    // clock decides which of two versions wins. See server/src/syncClock.js.
    columns: [
      ['report_entries', 'sync_origin', `TEXT NOT NULL DEFAULT ''`],
      ['report_entries', 'change_seq', 'INTEGER NOT NULL DEFAULT 0'],
      ['entry_tombstones', 'sync_origin', `TEXT NOT NULL DEFAULT ''`],
      ['entry_tombstones', 'change_seq', 'INTEGER NOT NULL DEFAULT 0'],
      ['entry_tombstones', 'sync_rev', 'INTEGER NOT NULL DEFAULT 1'],
    ],
    sql: [
      /*
       * The conversion, and the reason it is a CASE rather than one expression.
       *
       * The values in sync_rev were not written by one hand. The step above
       * filled them from updated_at/created_at — which Prisma stores as INTEGER
       * milliseconds — or from CURRENT_TIMESTAMP, which SQLite writes as TEXT.
       * A column can therefore hold both, because SQLite types values and not
       * columns, and a single strftime() would silently mangle the integers
       * while looking perfectly correct on the text.
       *
       * Seconds since 2023-11-14 (epoch 1700000000), matching the server's
       * migration exactly. That correspondence is the point: both ends convert
       * the same underlying instants the same way, so the first sync after the
       * cutover still orders shared entries as it would have before. Resetting
       * everything to 1 instead would tie the entire working set at once.
       *
       * The WHERE is what makes it safe to run twice — a converted value is
       * around 77 million and matches neither branch again.
       */
      `UPDATE "report_entries"
          SET "sync_rev" = MAX(1, COALESCE(
                CASE
                  WHEN typeof("sync_rev") IN ('integer', 'real') AND "sync_rev" > 100000000000
                    THEN CAST("sync_rev" / 1000 AS INTEGER) - 1700000000
                  WHEN typeof("sync_rev") = 'text'
                    THEN CAST(strftime('%s', "sync_rev") AS INTEGER) - 1700000000
                END, 1))
        WHERE typeof("sync_rev") = 'text'
           OR (typeof("sync_rev") IN ('integer', 'real') AND "sync_rev" > 100000000000)`,
      `UPDATE "entry_tombstones"
          SET "sync_rev" = MAX(1, COALESCE(
                CASE
                  WHEN typeof("deleted_at") IN ('integer', 'real') AND "deleted_at" > 100000000000
                    THEN CAST("deleted_at" / 1000 AS INTEGER) - 1700000000
                  WHEN typeof("deleted_at") = 'text'
                    THEN CAST(strftime('%s', "deleted_at") AS INTEGER) - 1700000000
                END, 1))
        WHERE "sync_rev" = 1`,
      /*
       * Whose edits these are.
       *
       * A function rather than a string because STEPS is built when this module
       * is imported and SYNC_ORIGIN is not set until the server starts — a
       * literal here would bake in an empty origin every time.
       *
       * It matters that this is not left blank: an empty origin sorts below
       * every other, so this machine would quietly lose every tie for work it
       * did before the upgrade.
       */
      () => `UPDATE "report_entries" SET "sync_origin" = '${originLiteral()}' WHERE "sync_origin" = ''`,
      () => `UPDATE "entry_tombstones" SET "sync_origin" = '${originLiteral()}' WHERE "sync_origin" = ''`,
      // One sequence shared by both tables, so a puller carries a single mark.
      // Entries take their existing revision order, tombstones continue past
      // them, and every later write takes MAX+1 across the two.
      `UPDATE "report_entries"
          SET "change_seq" = (SELECT COUNT(*) FROM "report_entries" AS r
                               WHERE r."sync_rev" < "report_entries"."sync_rev"
                                  OR (r."sync_rev" = "report_entries"."sync_rev" AND r."id" <= "report_entries"."id"))
        WHERE "change_seq" = 0`,
      `UPDATE "entry_tombstones"
          SET "change_seq" = (SELECT COALESCE(MAX("change_seq"), 0) FROM "report_entries")
                           + (SELECT COUNT(*) FROM "entry_tombstones" AS t
                               WHERE t."deleted_at" < "entry_tombstones"."deleted_at"
                                  OR (t."deleted_at" = "entry_tombstones"."deleted_at"
                                      AND t."sync_id" <= "entry_tombstones"."sync_id"))
        WHERE "change_seq" = 0`,
      `CREATE INDEX IF NOT EXISTS "report_entries_change_seq_idx" ON "report_entries"("change_seq")`,
      `CREATE INDEX IF NOT EXISTS "entry_tombstones_change_seq_idx" ON "entry_tombstones"("change_seq")`,
    ],
    /*
     * Done means CONVERTED, not merely "the columns are there".
     *
     * Checking the catalogue alone would mark this finished after a crash
     * between the ALTERs and the UPDATEs, leaving millisecond timestamps in a
     * column the app now reads as a count of edits — every one of them an
     * astronomically high revision that would beat the live server at
     * everything, forever, and look like an ordinary number while doing it.
     */
    done: async (prisma) =>
      (await hasColumn(prisma, 'report_entries', 'sync_origin')) &&
      (await hasColumn(prisma, 'report_entries', 'change_seq')) &&
      (await hasColumn(prisma, 'entry_tombstones', 'sync_origin')) &&
      (await hasColumn(prisma, 'entry_tombstones', 'change_seq')) &&
      (await hasColumn(prisma, 'entry_tombstones', 'sync_rev')) &&
      (await isConverted(prisma)),
  },
  {
    name: 'sync_rev declared as a number, not a moment',
    /*
     * The step above turned sync_rev's VALUES from timestamps into counters. It
     * could not turn the COLUMN from a DATETIME into an INTEGER, because SQLite
     * has no ALTER COLUMN — so on every database that was upgraded rather than
     * created fresh, sync_rev is still DECLARED a DATETIME while holding a
     * count. A fresh install got INTEGER from template.db and was never wrong.
     *
     * That declaration is not cosmetic. Prisma's SQLite connector decodes a
     * column by its declared type, so it reads the number 86282456 back as
     * 1970-01-01 23:58:02.456 and then refuses to convert that to the Int the
     * schema says syncRev is. The failure lands on the first sync that writes
     * an entry — "Error converting field sync_rev of expected non-nullable type
     * Int" — and nothing before that moment gives any sign of it.
     *
     * Nor did the previous step's `done` check catch it: isConverted counts bad
     * VALUES, and on a table with no rows there are none to find, so the step
     * marked itself complete over a column that was still wrong.
     *
     * A rebuild is the only way. That is not a departure from this module being
     * additive — nothing is dropped or narrowed and every row is carried across
     * by name — it is the one shape of change SQLite makes us spell out longhand.
     */
    columns: [],
    sql: [
      // Left behind by a crash mid-rebuild; the CREATE below would then fail.
      `DROP TABLE IF EXISTS "report_entries_rebuild"`,
      // The shape template.db has, so an upgraded database and a fresh one end
      // up identical rather than merely both working.
      `CREATE TABLE "report_entries_rebuild" (
         "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
         "sync_id" TEXT NOT NULL,
         "sync_rev" INTEGER NOT NULL DEFAULT 1,
         "sync_origin" TEXT NOT NULL DEFAULT '',
         "change_seq" INTEGER NOT NULL DEFAULT 0,
         "report_date" DATETIME NOT NULL,
         "mode" TEXT NOT NULL DEFAULT 'report',
         "branch" TEXT NOT NULL DEFAULT '',
         "technician" TEXT NOT NULL,
         "agency" TEXT NOT NULL,
         "tel_number" TEXT NOT NULL,
         "issi_number" TEXT NOT NULL,
         "type" TEXT NOT NULL,
         "model" TEXT NOT NULL,
         "comment" TEXT NOT NULL DEFAULT '',
         "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updated_at" DATETIME NOT NULL
       )`,
      /*
       * Copied by NAME, and every value defended on the way across.
       *
       * id is carried so faults and anything else pointing at an entry still
       * point at it. sync_id gets a fresh 128-bit id only if it is somehow null
       * — the column is NOT NULL now, and one null row would abort the whole
       * copy. sync_rev is floored at 1 because a counter starts there, and CAST
       * turns the text form SQLite may have stored into the integer the column
       * now declares.
       */
      `INSERT INTO "report_entries_rebuild"
         ("id", "sync_id", "sync_rev", "sync_origin", "change_seq", "report_date", "mode", "branch",
          "technician", "agency", "tel_number", "issi_number", "type", "model", "comment",
          "created_at", "updated_at")
       SELECT "id",
              COALESCE("sync_id", lower(hex(randomblob(16)))),
              MAX(1, CAST(COALESCE("sync_rev", 1) AS INTEGER)),
              COALESCE("sync_origin", ''),
              COALESCE("change_seq", 0),
              "report_date", "mode", "branch", "technician", "agency", "tel_number",
              "issi_number", "type", "model", "comment", "created_at", "updated_at"
         FROM "report_entries"`,
      `DROP TABLE "report_entries"`,
      `ALTER TABLE "report_entries_rebuild" RENAME TO "report_entries"`,
      // Dropping the table took its indexes with it.
      `CREATE UNIQUE INDEX IF NOT EXISTS "report_entries_sync_id_key" ON "report_entries"("sync_id")`,
      `CREATE INDEX IF NOT EXISTS "report_entries_report_date_idx" ON "report_entries"("report_date")`,
      `CREATE INDEX IF NOT EXISTS "report_entries_mode_idx" ON "report_entries"("mode")`,
      `CREATE INDEX IF NOT EXISTS "report_entries_branch_idx" ON "report_entries"("branch")`,
      `CREATE INDEX IF NOT EXISTS "report_entries_change_seq_idx" ON "report_entries"("change_seq")`,
    ],
    /*
     * The DECLARED type, which is the thing that was wrong. Asking the
     * catalogue rather than the rows is the whole point: an empty table has no
     * bad value to find, and that is exactly the database this bug hid in.
     */
    done: async (prisma) =>
      (await columnType(prisma, 'report_entries', 'sync_rev')) === 'INTEGER' &&
      // The indexes went with the dropped table. A crash between the rename and
      // their recreation would otherwise leave sync_id without its UNIQUE index
      // — and the type check alone would call the step finished, forever.
      (await hasIndex(prisma, 'report_entries_sync_id_key')) &&
      (await hasIndex(prisma, 'report_entries_change_seq_idx')),
  },
  {
    name: 'inventory columns added since the first desktop build',
    /*
     * Everything the inventory tables gained after the installer first shipped
     * and nothing here was told about. An install that upgraded rather than
     * being created fresh has the ORIGINAL inventory tables, so the first sync
     * to write a row dies on the first of these it reaches — "The column
     * `company` does not exist in the current database" — and fixing that one
     * only moves the failure to the next.
     *
     * They are listed together because they are one gap, not five: every one is
     * a TEXT column with a default, added to server/prisma/schema.prisma while
     * this file was not keeping up. See the note at the foot of this module on
     * why that keeps happening and what would end it.
     *
     * Company is the one that matters most. Inventory is scoped per company and
     * a row that cannot say which one it belongs to is a row nobody can file
     * against, so a fresh install had this from the day the column existed and
     * an upgraded one could not receive stock at all.
     */
    columns: [
      ['inventory_items', 'company', `TEXT NOT NULL DEFAULT ''`],
      ['inventory_items', 'room_id', `TEXT NOT NULL DEFAULT ''`],
      ['inventory_items', 'description', `TEXT NOT NULL DEFAULT ''`],
      ['inventory_items', 'alias', `TEXT NOT NULL DEFAULT ''`],
      ['inventory_items', 'pair_code', `TEXT NOT NULL DEFAULT ''`],
      ['inventory_items', 'former_pair_code', `TEXT NOT NULL DEFAULT ''`],
      ['inventory_txns', 'company', `TEXT NOT NULL DEFAULT ''`],
      ['inventory_txns', 'pair_code', `TEXT NOT NULL DEFAULT ''`],
    ],
    sql: [
      // The indexes a fresh database has over those columns. Missing ones cost
      // only speed, but "upgraded" and "fresh" should not be two shapes.
      `CREATE INDEX IF NOT EXISTS "inventory_items_company_idx" ON "inventory_items"("company")`,
      `CREATE INDEX IF NOT EXISTS "inventory_items_branch_company_idx" ON "inventory_items"("branch", "company")`,
      `CREATE INDEX IF NOT EXISTS "inventory_items_pair_code_idx" ON "inventory_items"("pair_code")`,
    ],
    done: async (prisma) =>
      (await hasColumn(prisma, 'inventory_items', 'company')) &&
      (await hasColumn(prisma, 'inventory_items', 'room_id')) &&
      (await hasColumn(prisma, 'inventory_items', 'description')) &&
      (await hasColumn(prisma, 'inventory_items', 'alias')) &&
      (await hasColumn(prisma, 'inventory_items', 'pair_code')) &&
      (await hasColumn(prisma, 'inventory_items', 'former_pair_code')) &&
      (await hasColumn(prisma, 'inventory_txns', 'company')) &&
      (await hasColumn(prisma, 'inventory_txns', 'pair_code')) &&
      (await hasIndex(prisma, 'inventory_items_company_idx')) &&
      (await hasIndex(prisma, 'inventory_items_branch_company_idx')) &&
      (await hasIndex(prisma, 'inventory_items_pair_code_idx')),
  },
]

/*
 * A NOTE ON WHY THIS FILE KEEPS BEING WRONG
 *
 * Three separate faults have now reached an installed machine by the same
 * route: a column is added to server/prisma/schema.prisma, template.db picks it
 * up automatically at build time because it is GENERATED from that schema, and
 * every fresh install is correct — while every upgraded install is missing it
 * and nothing says so until a query touches the column, often months later and
 * always on somebody else's PC.
 *
 * The asymmetry is the bug. One side of it is derived and cannot drift; the
 * other is hand-maintained and drifts silently by default. Nothing here fails
 * when a step is forgotten, because a forgotten step is indistinguishable from
 * a schema that never moved.
 *
 * The fix is to derive both sides. prepare.mjs already generates the SQLite
 * schema at build time and could emit the expected shape — table, column, type,
 * default — as data shipped beside it, leaving this module to add whatever a
 * database is missing rather than whatever somebody remembered to list. It
 * would stay additive: a column a fresh install has and this one does not, with
 * the default a fresh install gives it. Anything subtractive is a data
 * migration and would still be written by hand, deliberately, as these are.
 *
 * That is a larger change than the fault in front of it, which is why it is
 * written down here instead of done in the same breath.
 */

/** This installation's id, reduced to what is safe to paste into SQL. */
const originLiteral = () => String(process.env.SYNC_ORIGIN || '').replace(/[^a-zA-Z0-9_-]/g, '')

/** True once no sync_rev anywhere still holds a millisecond timestamp. */
async function isConverted(prisma) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM "report_entries"
      WHERE typeof("sync_rev") = 'text'
         OR (typeof("sync_rev") IN ('integer', 'real') AND "sync_rev" > 100000000000)`,
  )
  return Number(rows?.[0]?.n ?? 0) === 0
}

/** A column's DECLARED type, upper-cased, or '' when there is no such column. */
async function columnType(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`)
  return String((rows ?? []).find((c) => c.name === column)?.type ?? '').toUpperCase()
}

async function hasColumn(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`)
  return (rows ?? []).some((c) => c.name === column)
}

async function hasIndex(prisma, name) {
  const rows = await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, name)
  return (rows ?? []).length > 0
}

async function hasTable(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table)
  return (rows ?? []).length > 0
}

/**
 * Apply whatever this database is missing. Returns the names of the steps run.
 *
 * A database copied fresh from template.db already has everything, so on the
 * common path this costs one query and changes nothing.
 */
export async function upgradeSchema(prisma) {
  const ran = []
  /*
   * A rebuild (see the sync_rev step) drops the old table and renames the new
   * one into its place, and SQLite gives us no way to do those two as one. Lose
   * power between them and the rows are all present under the working name
   * while `report_entries` does not exist — at which point the guard below would
   * read "no tables yet, nothing to upgrade" and return, leaving a database that
   * every query fails against and no later run ever repairs.
   *
   * So the half-done swap is finished first, before anything concludes there is
   * nothing here. Renaming it back is not a guess: the table is only ever
   * created by that step, and it holds a complete copy by the time the drop
   * that preceded this could have happened.
   */
  if (!(await hasTable(prisma, 'report_entries')) && (await hasTable(prisma, 'report_entries_rebuild'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "report_entries_rebuild" RENAME TO "report_entries"`)
    ran.push('recovered an interrupted rebuild')
  }

  // Nothing to upgrade before the tables exist at all — a database mid-creation
  // is not an old one.
  if (!(await hasTable(prisma, 'report_entries'))) return ran

  for (const step of STEPS) {
    if (await step.done(prisma)) continue
    for (const [table, column, type] of step.columns) {
      if (await hasColumn(prisma, table, column)) continue
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`)
    }
    // A step may carry a statement as a function when it depends on something
    // that is not known at import time — see the origin backfill above.
    for (const sql of step.sql) await prisma.$executeRawUnsafe(typeof sql === 'function' ? sql() : sql)
    ran.push(step.name)
  }
  return ran
}
