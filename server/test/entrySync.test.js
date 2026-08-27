/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Two-way entry sync: which of two versions of an entry survives.
 *
 * Against an in-memory stand-in for Prisma rather than a database. The rules
 * being tested are decisions — the higher revision wins, a deletion is an edit,
 * a branch you may not write to is refused — and every one of them is a
 * comparison this module makes before it touches anything. A database would
 * test Prisma's upsert; this tests the answers.
 *
 * NOTHING HERE INVOLVES A CLOCK, which is the point of the design it covers.
 * The revision is a counter, so these tests can state exactly which version
 * ought to win without arranging for one machine to believe it is Tuesday.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { applyChanges, pullChanges, pruneTombstones, wireEntry, currentSeq } from '../src/entrySync.js'
import { compareRev, nextSeq } from '../src/syncClock.js'

const HERE = 'aaaa1111'
const THERE = 'bbbb2222'

const entry = (syncId, syncRev, over = {}) => ({
  syncId,
  syncRev,
  syncOrigin: THERE,
  reportDate: new Date('2026-08-27'),
  mode: 'report',
  branch: 'Makkah',
  technician: 'AMIR',
  agency: 'PSD',
  telNumber: '',
  issiNumber: '',
  type: 'AIRBUS',
  model: 'TH1N',
  comment: '',
  faults: [],
  ...over,
})

const grave = (syncId, syncRev, over = {}) => ({
  syncId,
  syncRev,
  syncOrigin: THERE,
  branch: 'Makkah',
  mode: 'report',
  ...over,
})

/** The calls entrySync makes, over two in-memory tables. */
function fakePrisma({ entries = [], tombstones = [] } = {}) {
  const store = {
    entries: entries.map((e, i) => ({ id: i + 1, changeSeq: i + 1, syncOrigin: HERE, ...e })),
    tombstones: tombstones.map((t, i) => ({ changeSeq: i + 1, syncOrigin: HERE, ...t })),
  }
  const find = (list, syncId) => list.find((r) => r.syncId === syncId) ?? null
  const maxSeq = (list) => list.reduce((m, r) => Math.max(m, r.changeSeq ?? 0), 0)
  // Only the filter pullChanges actually uses. A fake that honoured everything
  // would be a database, and a fake that honoured nothing could not show that
  // paging works at all.
  const page = (list, where) => {
    const gte = where?.changeSeq?.gte
    const rows = gte === undefined ? [...list] : list.filter((r) => (r.changeSeq ?? 0) >= gte)
    return rows.sort((a, b) => (a.changeSeq ?? 0) - (b.changeSeq ?? 0))
  }
  return {
    store,
    reportEntry: {
      aggregate: async () => ({ _max: { changeSeq: maxSeq(store.entries) } }),
      findUnique: async ({ where }) => find(store.entries, where.syncId),
      findMany: async ({ where } = {}) => page(store.entries, where),
      create: async ({ data }) => {
        const row = { ...data, faults: data.faults?.create ?? [] }
        store.entries.push(row)
        return row
      },
      update: async ({ where, data }) => {
        const i = store.entries.findIndex((r) => r.syncId === where.syncId)
        store.entries[i] = { ...store.entries[i], ...data, faults: data.faults?.create ?? [] }
        return store.entries[i]
      },
      delete: async ({ where }) => {
        const i = store.entries.findIndex((r) => r.syncId === where.syncId)
        return store.entries.splice(i, 1)[0]
      },
    },
    entryTombstone: {
      aggregate: async () => ({ _max: { changeSeq: maxSeq(store.tombstones) } }),
      findUnique: async ({ where }) => find(store.tombstones, where.syncId),
      findMany: async ({ where } = {}) => page(store.tombstones, where),
      upsert: async ({ where, create, update }) => {
        const existing = find(store.tombstones, where.syncId)
        if (existing) Object.assign(existing, update)
        else store.tombstones.push({ ...create })
      },
      delete: async ({ where }) => {
        const i = store.tombstones.findIndex((r) => r.syncId === where.syncId)
        if (i < 0) throw new Error('not found')
        return store.tombstones.splice(i, 1)[0]
      },
      deleteMany: async ({ where }) => {
        const before = store.tombstones.length
        store.tombstones = store.tombstones.filter((t) => !(t.deletedAt < where.deletedAt.lt))
        return { count: before - store.tombstones.length }
      },
    },
  }
}

describe('the higher revision wins, per entry', () => {
  let db
  beforeEach(() => {
    db = fakePrisma({ entries: [entry('a', 4, { syncOrigin: HERE, technician: 'HERE' })] })
  })

  test('a higher incoming revision replaces ours', async () => {
    const r = await applyChanges(db, { entries: [entry('a', 5, { technician: 'THERE' })] })
    assert.deepEqual(r.applied, ['a'])
    assert.equal(db.store.entries[0].technician, 'THERE')
  })

  test('a lower incoming revision is kept out, and ours is untouched', async () => {
    const r = await applyChanges(db, { entries: [entry('a', 3, { technician: 'THERE' })] })
    assert.deepEqual(r.applied, [])
    assert.equal(r.kept[0].reason, 'newer here')
    assert.equal(db.store.entries[0].technician, 'HERE')
  })

  // Re-sending an identical row must not churn the record or move its revision
  // forward — the next sync back would then think it was newer than it is.
  test('the same revision from the same machine changes nothing', async () => {
    const r = await applyChanges(db, { entries: [entry('a', 4, { syncOrigin: HERE, technician: 'THERE' })] })
    assert.deepEqual(r.applied, [])
    assert.equal(db.store.entries[0].technician, 'HERE')
  })

  test('an entry we have never seen is created', async () => {
    const r = await applyChanges(db, { entries: [entry('b', 1)] })
    assert.deepEqual(r.applied, ['b'])
    assert.equal(db.store.entries.length, 2)
  })

  // syncId is the identity, never `id` — the desktop's entry 5 and the
  // server's entry 5 are different entries, and matching on the autoincrement
  // would merge two people's work into one row.
  test('a matching local id does not make it the same entry', async () => {
    const r = await applyChanges(db, { entries: [entry('different-uuid', 9)] })
    assert.deepEqual(r.applied, ['different-uuid'])
    assert.equal(db.store.entries.length, 2, 'it is a second entry, not a replacement')
  })

  // An entry is one document. Half of one person's faults beside half of
  // another's is a device nobody worked on.
  test('the winner’s faults replace the loser’s outright', async () => {
    db = fakePrisma({
      entries: [entry('a', 4, { faults: [{ position: 0, issue: 'LCD', quantity: 1, action: 'CHANGE' }] })],
    })
    await applyChanges(db, {
      entries: [entry('a', 5, { faults: [{ position: 0, issue: 'ANTENNA', quantity: 2, action: 'NEW' }] })],
    })
    assert.deepEqual(
      db.store.entries[0].faults.map((f) => f.issue),
      ['ANTENNA'],
    )
  })

  // The counter's promise is not the timestamp's. More edits behind it wins,
  // even when the other side's single edit happened later by the wall clock —
  // which no longer exists as far as this code is concerned.
  test('a machine that edited five times offline beats one that edited once', async () => {
    const r = await applyChanges(db, { entries: [entry('a', 9, { technician: 'OFFLINE' })] })
    assert.deepEqual(r.applied, ['a'])
    assert.equal(db.store.entries[0].technician, 'OFFLINE')
  })
})

/*
 * The case a counter has and a timestamp does not.
 *
 * Two machines both hold rev 3, both edit while apart, both are now at rev 4
 * with different content. The counter cannot separate them. What matters is not
 * which one wins — that is arbitrary — but that BOTH MACHINES CHOOSE THE SAME
 * ONE. If they broke the tie differently they would each keep their own copy
 * and stay split forever, syncing cleanly every time and never converging.
 */
describe('a tie is broken the same way on both machines', () => {
  test('the higher origin wins', async () => {
    const db = fakePrisma({ entries: [entry('a', 4, { syncOrigin: 'aaaa', technician: 'LOW' })] })
    const r = await applyChanges(db, { entries: [entry('a', 4, { syncOrigin: 'zzzz', technician: 'HIGH' })] })
    assert.deepEqual(r.applied, ['a'])
    assert.equal(db.store.entries[0].technician, 'HIGH')
  })

  test('the lower origin does not', async () => {
    const db = fakePrisma({ entries: [entry('a', 4, { syncOrigin: 'zzzz', technician: 'HIGH' })] })
    const r = await applyChanges(db, { entries: [entry('a', 4, { syncOrigin: 'aaaa', technician: 'LOW' })] })
    assert.deepEqual(r.applied, [])
    assert.equal(db.store.entries[0].technician, 'HIGH')
  })

  // The property itself, rather than one side of it: run the exchange in both
  // directions and assert the two databases agree afterwards.
  test('both ends converge on one version, whichever way the exchange runs', async () => {
    const versionA = entry('a', 4, { syncOrigin: 'aaaa', technician: 'A' })
    const versionB = entry('a', 4, { syncOrigin: 'zzzz', technician: 'B' })

    const dbA = fakePrisma({ entries: [{ ...versionA }] })
    const dbB = fakePrisma({ entries: [{ ...versionB }] })
    await applyChanges(dbA, { entries: [versionB] })
    await applyChanges(dbB, { entries: [versionA] })

    assert.equal(dbA.store.entries[0].technician, dbB.store.entries[0].technician)
    assert.equal(dbA.store.entries[0].syncOrigin, dbB.store.entries[0].syncOrigin)
  })

  test('the live server takes a tie against any desktop, because "live" sorts above hex', () => {
    assert.ok(compareRev(4, 'live', 4, 'ffffffffffffffffffffffffffffffff') > 0)
    assert.ok(compareRev(4, '0000000000000000', 4, 'live') < 0)
  })
})

describe('compareRev', () => {
  test('the number decides first, and the origin only on a tie', () => {
    assert.ok(compareRev(5, 'a', 4, 'z') > 0, 'a higher revision beats a higher origin')
    assert.ok(compareRev(4, 'z', 5, 'a') < 0)
    assert.equal(compareRev(4, 'a', 4, 'a'), 0, 'same revision, same machine: nothing to choose')
  })

  test('a missing revision is a zero, not a crash', () => {
    assert.ok(compareRev(1, 'a', undefined, 'a') > 0)
  })
})

describe('a deletion travels, and is an edit like any other', () => {
  test('a tombstone removes the entry it names', async () => {
    const db = fakePrisma({ entries: [entry('a', 3)] })
    const r = await applyChanges(db, { tombstones: [grave('a', 4)] })
    assert.deepEqual(r.removed, ['a'])
    assert.equal(db.store.entries.length, 0)
    assert.equal(db.store.tombstones.length, 1, 'and is recorded, so it travels on')
  })

  // The whole reason tombstones exist: without one, the machine that still
  // holds the entry cannot tell "deleted there" from "never sent", and pushes
  // it back on every sync, forever.
  test('an entry deleted here is not resurrected by a push that predates it', async () => {
    const db = fakePrisma({ tombstones: [grave('a', 5, { deletedAt: new Date() })] })
    const r = await applyChanges(db, { entries: [entry('a', 4)] })
    assert.deepEqual(r.applied, [])
    assert.equal(r.kept[0].reason, 'deleted here more recently')
    assert.equal(db.store.entries.length, 0)
  })

  // ...but a deletion is not permanent authority. Worked on again afterwards,
  // the entry legitimately comes back, and its grave has to be cleared or the
  // check above would delete it again on the next round.
  test('an entry edited after it was deleted comes back, and stays back', async () => {
    const db = fakePrisma({ tombstones: [grave('a', 4, { deletedAt: new Date() })] })
    const first = await applyChanges(db, { entries: [entry('a', 5)] })
    assert.deepEqual(first.applied, ['a'])
    assert.equal(db.store.tombstones.length, 0, 'the grave is cleared')
    const second = await applyChanges(db, { entries: [entry('a', 5)] })
    assert.deepEqual(second.applied, [], 'and the second round is a no-op, not a deletion')
    assert.equal(db.store.entries.length, 1)
  })

  test('a deletion loses to an edit made after it', async () => {
    const db = fakePrisma({ entries: [entry('a', 6)] })
    const r = await applyChanges(db, { tombstones: [grave('a', 5)] })
    assert.deepEqual(r.removed, [])
    assert.equal(r.kept[0].reason, 'edited after it was deleted')
    assert.equal(db.store.entries.length, 1)
  })

  test('an unreadable revision is refused rather than guessed at', async () => {
    const db = fakePrisma()
    const r = await applyChanges(db, { entries: [entry('a', 'whenever')] })
    assert.deepEqual(r.applied, [])
    assert.equal(r.refused[0].reason, 'unreadable syncRev')
  })
})

describe('branch scope is not a thing sync gets around', () => {
  const mine = (branch) => branch === 'Makkah'

  test('an entry for another branch is refused, not written', async () => {
    const db = fakePrisma()
    const r = await applyChanges(db, { entries: [entry('a', 4, { branch: 'Jeddah' })] }, { canWrite: mine })
    assert.deepEqual(r.applied, [])
    assert.equal(r.refused[0].reason, 'branch')
    assert.equal(db.store.entries.length, 0)
  })

  // The incoming row claims a branch the caller may write to, but the row it
  // would overwrite is in one they may not. The row that exists decides.
  test('an entry cannot be moved out of a branch the caller may not touch', async () => {
    const db = fakePrisma({ entries: [entry('a', 3, { branch: 'Jeddah' })] })
    const r = await applyChanges(db, { entries: [entry('a', 9, { branch: 'Makkah' })] }, { canWrite: mine })
    assert.deepEqual(r.applied, [])
    assert.equal(r.refused[0].reason, 'branch')
    assert.equal(db.store.entries[0].branch, 'Jeddah')
  })

  test('a tombstone for another branch is refused too', async () => {
    const db = fakePrisma({ entries: [entry('a', 3, { branch: 'Jeddah' })] })
    const r = await applyChanges(db, { tombstones: [grave('a', 9)] }, { canWrite: mine })
    assert.deepEqual(r.removed, [])
    assert.equal(db.store.entries.length, 1)
  })
})

describe('paging by the change sequence', () => {
  test('a pull hands back this database’s mark, for the caller to send next time', async () => {
    const db = fakePrisma({ entries: [entry('a', 4), entry('b', 4)] })
    const out = await pullChanges(db)
    assert.equal(out.seq, 2, 'the highest sequence in use')
    assert.equal(out.entries.length, 2)
  })

  test('a later pull sends only what was written since — plus the boundary row', async () => {
    const db = fakePrisma({ entries: [entry('a', 4), entry('b', 4), entry('c', 4)] })
    const out = await pullChanges(db, { since: 3 })
    assert.deepEqual(
      out.entries.map((e) => e.syncId),
      ['c'],
    )
  })

  /*
   * `>=` and a mark of "the highest in use", not "one past it".
   *
   * Two writers can be issued the same sequence number, and only one of them
   * may have landed when the mark was read. Re-sending the boundary row costs a
   * comparison; excluding it would silently drop whichever row came second.
   */
  test('the boundary row is re-sent rather than risked', async () => {
    const db = fakePrisma({ entries: [entry('a', 4), entry('b', 4)] })
    const out = await pullChanges(db, { since: 2 })
    assert.deepEqual(
      out.entries.map((e) => e.syncId),
      ['b'],
      'the row AT the mark comes again',
    )
  })

  test('an entry travels without the local id or the sender’s sequence, neither of which is its identity', () => {
    const wire = wireEntry({ id: 42, changeSeq: 77, ...entry('a', 4) })
    assert.equal(wire.id, undefined)
    assert.equal(wire.changeSeq, undefined, 'the receiver stamps its own, or its paging is corrupted')
    assert.equal(wire.syncId, 'a')
    assert.equal(wire.syncRev, 4)
    assert.equal(wire.syncOrigin, THERE)
  })

  test('the sequence is shared by both tables, so one mark covers the pair', async () => {
    const db = fakePrisma({ entries: [entry('a', 4)], tombstones: [grave('z', 4, { changeSeq: 7 })] })
    assert.equal(await currentSeq(db), 7)
    assert.equal(await nextSeq(db), 8, 'and the next write continues past both')
  })

  test('applying an incoming entry stamps it with OUR sequence, not the sender’s', async () => {
    const db = fakePrisma({ entries: [entry('a', 4)] })
    await applyChanges(db, { entries: [entry('b', 4, { changeSeq: 999 })] })
    const written = db.store.entries.find((e) => e.syncId === 'b')
    assert.equal(written.changeSeq, 2, 'one past what this database had')
  })
})

test('tombstones are pruned once they are older than any copy could be away', async () => {
  const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
  const db = fakePrisma({
    tombstones: [
      { syncId: 'old', syncRev: 2, deletedAt: old },
      { syncId: 'new', syncRev: 2, deletedAt: new Date() },
    ],
  })
  assert.equal(await pruneTombstones(db), 1)
  assert.deepEqual(
    db.store.tombstones.map((t) => t.syncId),
    ['new'],
  )
})
