/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The desktop build's startup schema upgrade, against a real SQLite file.
 *
 * Lives here because this is where the test runner is; the code under test is
 * desktop/schemaUpgrade.js. It is worth the awkward import: that function runs
 * unattended, before the window is on screen, against the only copy of somebody
 * else's reports, and the failure it exists to prevent — an app that crashes on
 * every query after an upgrade — cannot be found by reading it.
 *
 * node:sqlite stands in for Prisma here, which is the reverse of the real thing
 * (the packaged app uses Prisma precisely because node:sqlite may be compiled
 * out of Electron). That is fine for what is being checked: the SQL is the
 * part that has to be right, and both drivers run the same SQLite.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upgradeSchema } from '../../desktop/schemaUpgrade.js'

/** A Prisma-shaped stand-in over a real SQLite file. */
function prismaOver(db) {
  return {
    $queryRawUnsafe: async (sql, ...params) => db.prepare(sql).all(...params),
    $executeRawUnsafe: async (sql, ...params) => {
      const s = db.prepare(sql)
      return params.length ? s.run(...params) : s.run()
    },
  }
}

/** The shape report_entries had BEFORE two-way sync — what is installed today. */
function oldDatabase(dir) {
  const db = new DatabaseSync(join(dir, 'trc-mms.db'))
  db.exec(`
    CREATE TABLE "report_entries" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
  for (const t of ['AMIR', 'RASHID', 'IMRAN']) {
    db.prepare(
      `INSERT INTO "report_entries"
       ("report_date","technician","agency","tel_number","issi_number","type","model")
       VALUES ('2026-08-27', ?, 'PSD', '', '', 'AIRBUS', 'TH1N')`,
    ).run(t)
  }
  return db
}

const withDb = async (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'trc-schema-'))
  const db = oldDatabase(dir)
  try {
    return await fn(db, prismaOver(db))
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('upgrading a database installed before two-way sync', () => {
  test('adds the columns and the tombstone table', async () => {
    await withDb(async (db, prisma) => {
      const ran = await upgradeSchema(prisma)
      assert.deepEqual(ran.length, 3, 'the identity step, the counter step and the sync_rev rebuild')
      const cols = db
        .prepare(`PRAGMA table_info("report_entries")`)
        .all()
        .map((c) => c.name)
      assert.ok(cols.includes('sync_id'))
      assert.ok(cols.includes('sync_rev'))
      assert.ok(cols.includes('sync_origin'))
      assert.ok(cols.includes('change_seq'))
      assert.ok(db.prepare(`SELECT name FROM sqlite_master WHERE name='entry_tombstones'`).get())
    })
  })

  // The rows are somebody's reports. An upgrade that loses one, or leaves one
  // without the identity a sync needs, is the failure that matters.
  test('every existing row keeps its data and gains a DISTINCT id', async () => {
    await withDb(async (db, prisma) => {
      await upgradeSchema(prisma)
      const rows = db.prepare(`SELECT technician, sync_id, sync_rev FROM "report_entries" ORDER BY id`).all()
      assert.deepEqual(
        rows.map((r) => r.technician),
        ['AMIR', 'RASHID', 'IMRAN'],
      )
      assert.equal(new Set(rows.map((r) => r.sync_id)).size, 3, 'ids must not collide')
      for (const r of rows) {
        assert.match(r.sync_id, /^[0-9a-f]{32}$/)
        assert.ok(r.sync_rev, 'a row with no revision would lose every conflict it is in')
      }
    })
  })

  test('running it again changes nothing and does not throw', async () => {
    await withDb(async (db, prisma) => {
      await upgradeSchema(prisma)
      const before = db.prepare(`SELECT sync_id FROM "report_entries" ORDER BY id`).all()
      assert.deepEqual(await upgradeSchema(prisma), [], 'second run should report no steps')
      const after = db.prepare(`SELECT sync_id FROM "report_entries" ORDER BY id`).all()
      assert.deepEqual(after, before, 'ids must be stable — they are what two machines match on')
    })
  })

  // SQLite will not roll DDL back into a transaction we opened, so a step can
  // die half-applied. The next start has to finish it rather than skip it.
  test('a half-applied upgrade is completed, not skipped', async () => {
    await withDb(async (db, prisma) => {
      // Exactly what a power cut between the two ALTERs would leave behind.
      db.exec(`ALTER TABLE "report_entries" ADD COLUMN "sync_id" TEXT`)
      assert.deepEqual(await upgradeSchema(prisma), [
        'entry sync (sync_id, sync_rev, entry_tombstones)',
        'entry sync counter (sync_origin, change_seq, sync_rev as a number)',
        'sync_rev declared as a number, not a moment',
      ])
      const cols = db
        .prepare(`PRAGMA table_info("report_entries")`)
        .all()
        .map((c) => c.name)
      assert.ok(cols.includes('sync_rev'), 'the column the interrupted run never reached')
      assert.ok(db.prepare(`SELECT name FROM sqlite_master WHERE name='entry_tombstones'`).get())
      const ids = db.prepare(`SELECT sync_id FROM "report_entries"`).all()
      assert.ok(
        ids.every((r) => /^[0-9a-f]{32}$/.test(r.sync_id)),
        'rows left with a NULL id must be filled in',
      )
    })
  })

  /*
   * The counter step, which is the one that rewrites data rather than adding to
   * it — and the only step here that could quietly ruin a sync while leaving a
   * database that opens perfectly well.
   */
  describe('turning the revision from a moment into a count', () => {
    test('sync_rev becomes a small number, and keeps the order it expressed', async () => {
      await withDb(async (db, prisma) => {
        // Three rows, deliberately out of insertion order in time, so preserved
        // ORDER is testable rather than coincidental.
        db.exec(`UPDATE "report_entries" SET "updated_at" = '2026-08-27 09:00:00' WHERE technician = 'AMIR'`)
        db.exec(`UPDATE "report_entries" SET "updated_at" = '2026-08-27 11:00:00' WHERE technician = 'RASHID'`)
        db.exec(`UPDATE "report_entries" SET "updated_at" = '2026-08-27 10:00:00' WHERE technician = 'IMRAN'`)
        await upgradeSchema(prisma)

        const rows = db.prepare(`SELECT technician, sync_rev FROM "report_entries"`).all()
        const by = Object.fromEntries(rows.map((r) => [r.technician, r.sync_rev]))
        for (const r of rows) {
          assert.equal(typeof r.sync_rev, 'number')
          // A millisecond timestamp left in here would be around 1.7e12, and
          // would beat the live server at everything forever.
          assert.ok(r.sync_rev > 0 && r.sync_rev < 1e11, `implausible revision ${r.sync_rev}`)
        }
        assert.ok(by.AMIR < by.IMRAN && by.IMRAN < by.RASHID, 'the order the timestamps expressed must survive')
      })
    })

    test('every row is signed with this installation, so it does not lose every tie', async () => {
      process.env.SYNC_ORIGIN = 'deadbeef00112233'
      try {
        await withDb(async (db, prisma) => {
          await upgradeSchema(prisma)
          const rows = db.prepare(`SELECT sync_origin FROM "report_entries"`).all()
          assert.ok(
            rows.every((r) => r.sync_origin === 'deadbeef00112233'),
            'an empty origin sorts below every other, so this machine would lose every tie',
          )
        })
      } finally {
        delete process.env.SYNC_ORIGIN
      }
    })

    test('change_seq numbers every row, without collisions', async () => {
      await withDb(async (db, prisma) => {
        await upgradeSchema(prisma)
        const seqs = db
          .prepare(`SELECT change_seq FROM "report_entries"`)
          .all()
          .map((r) => r.change_seq)
        assert.equal(new Set(seqs).size, seqs.length, 'a repeated sequence would page two rows as one')
        assert.ok(
          seqs.every((n) => n > 0),
          'a zero would sit below every mark and never be pulled',
        )
      })
    })

    /*
     * The failure worth the most care here.
     *
     * A crash between the ALTERs and the UPDATEs leaves the columns present and
     * the values unconverted. If the step were marked done off the catalogue
     * alone, the app would come back up reading millisecond timestamps as a
     * count of edits — an astronomically high revision on every local row, which
     * would beat the live server at every conflict, forever, and look like an
     * ordinary number the whole time.
     */
    test('columns present but values unconverted is NOT treated as done', async () => {
      await withDb(async (db, prisma) => {
        db.exec(`ALTER TABLE "report_entries" ADD COLUMN "sync_id" TEXT`)
        db.exec(`ALTER TABLE "report_entries" ADD COLUMN "sync_rev" DATETIME`)
        db.exec(`ALTER TABLE "report_entries" ADD COLUMN "sync_origin" TEXT NOT NULL DEFAULT ''`)
        db.exec(`ALTER TABLE "report_entries" ADD COLUMN "change_seq" INTEGER NOT NULL DEFAULT 0`)
        // The half-applied state: a millisecond timestamp still sitting in the
        // column the app now reads as a counter.
        db.exec(`UPDATE "report_entries" SET "sync_rev" = 1756298400000, "sync_id" = lower(hex(randomblob(16)))`)

        const ran = await upgradeSchema(prisma)
        assert.ok(
          ran.includes('entry sync counter (sync_origin, change_seq, sync_rev as a number)'),
          'the conversion must run, not be skipped because the columns exist',
        )
        const revs = db.prepare(`SELECT sync_rev FROM "report_entries"`).all()
        assert.ok(
          revs.every((r) => r.sync_rev > 0 && r.sync_rev < 1e11),
          'every millisecond timestamp must have been converted',
        )
      })
    })

    test('running the whole upgrade twice converts nothing a second time', async () => {
      await withDb(async (db, prisma) => {
        await upgradeSchema(prisma)
        const before = db.prepare(`SELECT sync_rev, change_seq FROM "report_entries" ORDER BY id`).all()
        assert.deepEqual(await upgradeSchema(prisma), [], 'second run should report no steps')
        const after = db.prepare(`SELECT sync_rev, change_seq FROM "report_entries" ORDER BY id`).all()
        assert.deepEqual(after, before, 'a revision that drifts on restart would resolve conflicts differently')
      })
    })
  })

  /*
   * The bug this step exists for, reproduced end to end.
   *
   * sync_rev was first ADDED as a DATETIME, back when a revision was a moment.
   * The step that turned revisions into counters could rewrite the values but
   * not the column: SQLite has no ALTER COLUMN. So every upgraded database kept
   * a column DECLARED DATETIME while holding a number — and Prisma decodes by
   * declared type, reads 86282456 back as 1970-01-01 23:58:02.456, and refuses
   * to convert that to Int. The first sync that writes an entry dies with
   * "Error converting field sync_rev of expected non-nullable type Int".
   *
   * A fresh install was never affected, which is what kept this hidden.
   */
  describe('sync_rev must be declared a number, not just hold one', () => {
    test('an upgraded database ends up with the type a fresh one has', async () => {
      await withDb(async (db, prisma) => {
        await upgradeSchema(prisma)
        const col = db
          .prepare(`PRAGMA table_info("report_entries")`)
          .all()
          .find((c) => c.name === 'sync_rev')
        assert.equal(col.type.toUpperCase(), 'INTEGER')
        // NOT NULL too — the schema says syncRev is non-nullable.
        assert.equal(col.notnull, 1)
      })
    })

    test('every row survives the rebuild, ids and all', async () => {
      await withDb(async (db, prisma) => {
        const before = db.prepare(`SELECT id, technician FROM "report_entries" ORDER BY id`).all()
        await upgradeSchema(prisma)
        const after = db.prepare(`SELECT id, technician FROM "report_entries" ORDER BY id`).all()
        // ids are carried across deliberately: faults point at an entry by id.
        assert.deepEqual(after, before)
        assert.equal(after.length, 3)
      })
    })

    test('sync_id keeps its UNIQUE index — dropping the table took every index with it', async () => {
      await withDb(async (db, prisma) => {
        await upgradeSchema(prisma)
        const names = db
          .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='report_entries'`)
          .all()
          .map((r) => r.name)
        for (const idx of [
          'report_entries_sync_id_key',
          'report_entries_report_date_idx',
          'report_entries_mode_idx',
          'report_entries_branch_idx',
          'report_entries_change_seq_idx',
        ]) {
          assert.ok(names.includes(idx), `missing ${idx}`)
        }
      })
    })

    test('the values still read as counters, not as timestamps', async () => {
      await withDb(async (db, prisma) => {
        await upgradeSchema(prisma)
        for (const r of db.prepare(`SELECT sync_rev FROM "report_entries"`).all()) {
          assert.equal(typeof r.sync_rev, 'number')
          assert.ok(r.sync_rev >= 1 && r.sync_rev < 100000000000, `${r.sync_rev} is still a timestamp`)
        }
      })
    })

    test('a second run rebuilds nothing', async () => {
      await withDb(async (db, prisma) => {
        await upgradeSchema(prisma)
        assert.deepEqual(await upgradeSchema(prisma), [])
      })
    })

    /*
     * The crash that would otherwise brick the database. Dropping the old table
     * and renaming the new one cannot be one operation in SQLite, so a machine
     * that loses power between them wakes with the rows under the working name
     * and no report_entries at all — which the guard would read as "no tables
     * yet" and skip, forever.
     */
    test('a rebuild interrupted between the drop and the rename is recovered', async () => {
      await withDb(async (db, prisma) => {
        await upgradeSchema(prisma)
        // Recreate exactly that half-done state.
        db.exec(`ALTER TABLE "report_entries" RENAME TO "report_entries_rebuild"`)
        const ran = await upgradeSchema(prisma)
        assert.ok(ran.includes('recovered an interrupted rebuild'), ran.join(', '))
        const rows = db.prepare(`SELECT id, technician FROM "report_entries" ORDER BY id`).all()
        assert.equal(rows.length, 3, 'the rows must come back with the table')
      })
    })

    test('a leftover rebuild table from a crash before the copy is not mistaken for data', async () => {
      await withDb(async (db, prisma) => {
        // Died after CREATE, before INSERT: an empty rebuild table beside a
        // healthy report_entries. The step drops it and starts over.
        db.exec(`CREATE TABLE "report_entries_rebuild" ("id" INTEGER PRIMARY KEY)`)
        await upgradeSchema(prisma)
        const rows = db.prepare(`SELECT id FROM "report_entries" ORDER BY id`).all()
        assert.equal(rows.length, 3)
        const left = db.prepare(`SELECT name FROM sqlite_master WHERE name='report_entries_rebuild'`).all()
        assert.equal(left.length, 0, 'the scratch table should not survive')
      })
    })
  })

  test('a database with no tables at all is left alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trc-schema-empty-'))
    const db = new DatabaseSync(join(dir, 'empty.db'))
    try {
      assert.deepEqual(await upgradeSchema(prismaOver(db)), [])
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
