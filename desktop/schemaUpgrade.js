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
]

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

async function hasColumn(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`)
  return (rows ?? []).some((c) => c.name === column)
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
