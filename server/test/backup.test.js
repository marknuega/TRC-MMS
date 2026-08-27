/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Whole-database export and import.
 *
 * Run against an in-memory stand-in for Prisma rather than a database, and
 * deliberately: importAll's first act is to delete every row it has a
 * replacement for, so a test pointed at the dev database would empty it on the
 * first run and there would be no version of that test worth keeping. The stub
 * records the ORDER of the calls, which is the half that actually has to be
 * right — foreign keys are satisfied by sequence, and a sequence is exactly
 * what a mocked client can prove.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { exportAll, importAll, validateExport, resyncSequences, TABLES, FORMAT, VERSION } from '../src/backup.js'

/** An in-memory Prisma stand-in: the four calls backup.js makes, and a log. */
function fakePrisma(seed = {}) {
  const store = {}
  const calls = []
  const client = {}
  for (const { key, model } of TABLES) {
    store[model] = [...(seed[key] ?? [])]
    client[model] = {
      findMany: async () => [...store[model]],
      count: async () => store[model].length,
      deleteMany: async () => {
        calls.push(`delete:${key}`)
        const n = store[model].length
        store[model] = []
        return { count: n }
      },
      create: async ({ data }) => {
        calls.push(`create:${key}`)
        store[model].push(data)
        return data
      },
    }
  }
  return { client, store, calls, at: (model) => store[model] }
}

const docOf = (data) => ({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data })

describe('exportAll', () => {
  test('carries every table the schema has, with an envelope that names itself', async () => {
    const { client } = fakePrisma({ users: [{ id: 1, username: 'amir' }], faults: [{ id: 9, entryId: 4 }] })
    const doc = await exportAll(client)
    assert.equal(doc.format, FORMAT)
    assert.equal(doc.version, VERSION)
    // Every table present, not just the ones that happened to have rows — a
    // key missing from an export is a table silently absent from every copy.
    for (const { key } of TABLES) assert.ok(Array.isArray(doc.data[key]), `${key} missing`)
    assert.equal(doc.counts.users, 1)
    assert.equal(doc.counts.faults, 1)
    assert.equal(doc.counts.reports, 0)
  })
})

describe('validateExport', () => {
  const cases = [
    [undefined, /export document/],
    ['nope', /export document/],
    [{}, /Not a TRC-MMS export/],
    [{ format: 'something-else' }, /Not a TRC-MMS export/],
    [{ format: FORMAT, version: VERSION + 1 }, /newer than this app understands/],
    [{ format: FORMAT, version: 1 }, /no data/],
    [{ format: FORMAT, version: 1, data: { users: 'not an array' } }, /users must be an array/],
  ]
  for (const [input, re] of cases) {
    test(`refuses ${JSON.stringify(input)?.slice(0, 40) ?? 'undefined'}`, () => {
      assert.match(validateExport(input), re)
    })
  }

  test('accepts a document this app wrote', async () => {
    const { client } = fakePrisma()
    assert.equal(validateExport(await exportAll(client)), '')
  })

  // Older is fine — a copy taken before a table existed simply has less in it.
  test('accepts an OLDER version, which is only ever a smaller document', () => {
    assert.equal(validateExport({ format: FORMAT, version: 1, data: {} }), '')
  })
})

describe('importAll', () => {
  let fake
  beforeEach(() => {
    fake = fakePrisma({ users: [{ id: 99, username: 'stale' }] })
  })

  test('replaces what is there — the old rows do not survive', async () => {
    await importAll(fake.client, docOf({ users: [{ id: 1, username: 'amir' }] }))
    assert.deepEqual(
      fake.at('user').map((u) => u.username),
      ['amir'],
    )
  })

  test('deletes children before parents, and creates parents before children', async () => {
    await importAll(fake.client, docOf({ reportEntries: [{ id: 1 }], faults: [{ id: 1, entryId: 1 }] }))
    const del = fake.calls.filter((c) => c.startsWith('delete:'))
    const add = fake.calls.filter((c) => c.startsWith('create:'))
    assert.ok(
      del.indexOf('delete:faults') < del.indexOf('delete:reportEntries'),
      'faults must be deleted before the entries they hang off',
    )
    assert.ok(
      add.indexOf('create:reportEntries') < add.indexOf('create:faults'),
      'an entry must exist before a fault points at it',
    )
    // Same for the inventory pair.
    assert.ok(del.indexOf('delete:inventoryTxns') < del.indexOf('delete:inventoryItems'))
  })

  test('ids are preserved, because a copy has to be the same document', async () => {
    // A saved report must come back under the REP number it was printed with.
    await importAll(fake.client, docOf({ savedReports: [{ id: 7, seq: 7, reportId: 'REP-0007' }] }))
    assert.deepEqual(fake.at('savedReport'), [{ id: 7, seq: 7, reportId: 'REP-0007' }])
  })

  test('date strings come back as Dates, so a file imports like an object', async () => {
    await importAll(fake.client, docOf({ reports: [{ id: 1, reportDate: '2026-08-26T00:00:00.000Z' }] }))
    const [row] = fake.at('report')
    assert.ok(row.reportDate instanceof Date, 'reportDate should be revived')
    assert.equal(row.reportDate.toISOString(), '2026-08-26T00:00:00.000Z')
  })

  test('a field that merely looks like a date is left alone', async () => {
    // dateLabel is prose ("26 Aug 2026"), not a timestamp, and must not become
    // an Invalid Date on the way in.
    await importAll(fake.client, docOf({ savedReports: [{ id: 1, dateLabel: 'not a date at all' }] }))
    assert.equal(fake.at('savedReport')[0].dateLabel, 'not a date at all')
  })

  test('a missing table is imported as empty, not skipped', async () => {
    // The old rows still have to go: a table absent from the document means
    // the source had none, which is a fact to copy like any other.
    await importAll(fake.client, docOf({}))
    assert.deepEqual(fake.at('user'), [])
  })

  describe('skip', () => {
    test('a skipped table is neither emptied nor written', async () => {
      const r = await importAll(fake.client, docOf({ users: [{ id: 1, username: 'amir' }] }), { skip: ['users'] })
      assert.deepEqual(
        fake.at('user').map((u) => u.username),
        ['stale'],
        'the local account must survive — it is the one signed in',
      )
      assert.ok(!fake.calls.includes('delete:users'))
      assert.deepEqual(r.skipped, ['users'])
      assert.equal(r.imported.users, undefined)
    })

    test('everything else still lands', async () => {
      const r = await importAll(fake.client, docOf({ users: [{ id: 1 }], reports: [{ id: 1 }, { id: 2 }] }), {
        skip: ['users'],
      })
      assert.equal(r.imported.reports, 2)
    })

    // No such pair exists today — users and processedMessages have no children
    // — so this is the guard that speaks up if one is ever added.
    test('refuses to import a child whose parent is being skipped', async () => {
      await assert.rejects(
        () => importAll(fake.client, docOf({}), { skip: ['inventoryItems'] }),
        /Cannot import inventoryTxns while skipping inventoryItems/,
      )
    })
  })

  test('export then import is a faithful round trip', async () => {
    const source = fakePrisma({
      appOptions: [{ id: 1, data: { issueTypes: ['LCD'] } }],
      users: [{ id: 3, username: 'amir', passwordHash: '$2b$10$x' }],
      inventoryItems: [{ id: 5, sku: 'MOT-MAK-1', pairCode: 'H44A' }],
      inventoryTxns: [{ id: 8, itemId: 5, change: -1 }],
      savedReports: [{ id: 2, seq: 2, reportId: 'REP-0002' }],
    })
    const doc = await exportAll(source.client)
    // Through a file, which is how it actually travels.
    const target = fakePrisma()
    await importAll(target.client, JSON.parse(JSON.stringify(doc)))
    const back = await exportAll(target.client)
    assert.deepEqual(back.counts, doc.counts)
    assert.deepEqual(back.data.inventoryTxns, doc.data.inventoryTxns)
    assert.equal(back.data.users[0].passwordHash, '$2b$10$x', 'a copy you cannot log into is not a copy')
  })
})

describe('resyncSequences', () => {
  test('does nothing on SQLite, whose rowid counter follows MAX(id) by itself', async () => {
    const before = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'file:./trc-mms.db'
    try {
      // No $executeRawUnsafe on the stub: if it tried, this would throw.
      assert.deepEqual(await resyncSequences({}), [])
    } finally {
      process.env.DATABASE_URL = before
    }
  })

  test('on Postgres it resets every table with an integer id', async () => {
    const before = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://localhost/x'
    const sql = []
    try {
      const done = await resyncSequences({ $executeRawUnsafe: async (q) => sql.push(q) })
      // processedMessages is keyed by a string and has no sequence to reset.
      assert.ok(!done.includes('processedMessages'))
      assert.equal(done.length, TABLES.length - 1)
      assert.ok(sql.every((q) => q.includes('setval')))
      assert.ok(sql.some((q) => q.includes('"report_entries"')))
      assert.ok(!sql.some((q) => q.includes('processed_messages')))
    } finally {
      process.env.DATABASE_URL = before
    }
  })

  test('a skipped table keeps its sequence, having kept its rows', async () => {
    const before = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://localhost/x'
    const sql = []
    try {
      await resyncSequences({ $executeRawUnsafe: async (q) => sql.push(q) }, { skip: ['users'] })
      assert.ok(!sql.some((q) => q.includes('"users"')))
    } finally {
      process.env.DATABASE_URL = before
    }
  })
})
