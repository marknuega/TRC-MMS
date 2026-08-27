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
      assert.deepEqual(ran.length, 1)
      const cols = db
        .prepare(`PRAGMA table_info("report_entries")`)
        .all()
        .map((c) => c.name)
      assert.ok(cols.includes('sync_id'))
      assert.ok(cols.includes('sync_rev'))
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
      assert.deepEqual(await upgradeSchema(prisma), ['entry sync (sync_id, sync_rev, entry_tombstones)'])
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
