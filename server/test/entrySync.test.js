/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Two-way entry sync: which of two versions of an entry survives.
 *
 * Against an in-memory stand-in for Prisma rather than a database. The rules
 * being tested are decisions — later wins, a deletion is an edit, a branch you
 * may not write to is refused — and every one of them is a comparison this
 * module makes before it touches anything. A database would test Prisma's
 * upsert; this tests the answers.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { applyChanges, pullChanges, pruneTombstones, skewOf, wireEntry, MAX_CLOCK_SKEW_MS } from '../src/entrySync.js'

const iso = (s) => new Date(s)
const T0 = '2026-08-27T10:00:00.000Z'
const T1 = '2026-08-27T11:00:00.000Z'
const T2 = '2026-08-27T12:00:00.000Z'

const entry = (syncId, syncRev, over = {}) => ({
  syncId,
  syncRev: iso(syncRev),
  reportDate: iso('2026-08-27'),
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

/** The four calls entrySync makes, over two in-memory tables. */
function fakePrisma({ entries = [], tombstones = [] } = {}) {
  const store = { entries: entries.map((e) => ({ id: entries.indexOf(e) + 1, ...e })), tombstones: [...tombstones] }
  const find = (list, syncId) => list.find((r) => r.syncId === syncId) ?? null
  return {
    store,
    reportEntry: {
      findUnique: async ({ where }) => find(store.entries, where.syncId) ?? null,
      findMany: async () => [...store.entries],
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
      findUnique: async ({ where }) => find(store.tombstones, where.syncId),
      findMany: async () => [...store.tombstones],
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

describe('last write wins, per entry', () => {
  let db
  beforeEach(() => {
    db = fakePrisma({ entries: [entry('a', T1, { technician: 'HERE' })] })
  })

  test('a newer incoming entry replaces ours', async () => {
    const r = await applyChanges(db, { entries: [entry('a', T2, { technician: 'THERE' })] })
    assert.deepEqual(r.applied, ['a'])
    assert.equal(db.store.entries[0].technician, 'THERE')
  })

  test('an older incoming entry is kept out, and ours is untouched', async () => {
    const r = await applyChanges(db, { entries: [entry('a', T0, { technician: 'THERE' })] })
    assert.deepEqual(r.applied, [])
    assert.equal(r.kept[0].reason, 'newer here')
    assert.equal(db.store.entries[0].technician, 'HERE')
  })

  // Re-sending an identical row must not churn the record or move its revision
  // forward — the next sync back would then think it was newer than it is.
  test('an entry at the same revision changes nothing', async () => {
    const r = await applyChanges(db, { entries: [entry('a', T1, { technician: 'THERE' })] })
    assert.deepEqual(r.applied, [])
    assert.equal(db.store.entries[0].technician, 'HERE')
  })

  test('an entry we have never seen is created', async () => {
    const r = await applyChanges(db, { entries: [entry('b', T0)] })
    assert.deepEqual(r.applied, ['b'])
    assert.equal(db.store.entries.length, 2)
  })

  // syncId is the identity, never `id` — the desktop's entry 5 and the
  // server's entry 5 are different entries, and matching on the autoincrement
  // would merge two people's work into one row.
  test('a matching local id does not make it the same entry', async () => {
    const r = await applyChanges(db, { entries: [entry('different-uuid', T2)] })
    assert.deepEqual(r.applied, ['different-uuid'])
    assert.equal(db.store.entries.length, 2, 'it is a second entry, not a replacement')
  })

  // An entry is one document. Half of one person's faults beside half of
  // another's is a device nobody worked on.
  test('the winner’s faults replace the loser’s outright', async () => {
    db = fakePrisma({
      entries: [entry('a', T1, { faults: [{ position: 0, issue: 'LCD', quantity: 1, action: 'CHANGE' }] })],
    })
    await applyChanges(db, {
      entries: [entry('a', T2, { faults: [{ position: 0, issue: 'ANTENNA', quantity: 2, action: 'NEW' }] })],
    })
    assert.deepEqual(
      db.store.entries[0].faults.map((f) => f.issue),
      ['ANTENNA'],
    )
  })
})

describe('a deletion travels, and is an edit like any other', () => {
  test('a tombstone removes the entry it names', async () => {
    const db = fakePrisma({ entries: [entry('a', T0)] })
    const r = await applyChanges(db, { tombstones: [{ syncId: 'a', deletedAt: T1, branch: 'Makkah', mode: 'report' }] })
    assert.deepEqual(r.removed, ['a'])
    assert.equal(db.store.entries.length, 0)
    assert.equal(db.store.tombstones.length, 1, 'and is recorded, so it travels on')
  })

  // The whole reason tombstones exist: without one, the machine that still
  // holds the entry cannot tell "deleted there" from "never sent", and pushes
  // it back on every sync, forever.
  test('an entry deleted here is not resurrected by a push that predates it', async () => {
    const db = fakePrisma({ tombstones: [{ syncId: 'a', deletedAt: iso(T2), branch: 'Makkah', mode: 'report' }] })
    const r = await applyChanges(db, { entries: [entry('a', T1)] })
    assert.deepEqual(r.applied, [])
    assert.equal(r.kept[0].reason, 'deleted here more recently')
    assert.equal(db.store.entries.length, 0)
  })

  // ...but a deletion is not permanent authority. Worked on again afterwards,
  // the entry legitimately comes back, and its grave has to be cleared or the
  // check above would delete it again on the next round.
  test('an entry edited after it was deleted comes back, and stays back', async () => {
    const db = fakePrisma({ tombstones: [{ syncId: 'a', deletedAt: iso(T1), branch: 'Makkah', mode: 'report' }] })
    const first = await applyChanges(db, { entries: [entry('a', T2)] })
    assert.deepEqual(first.applied, ['a'])
    assert.equal(db.store.tombstones.length, 0, 'the grave is cleared')
    const second = await applyChanges(db, { entries: [entry('a', T2)] })
    assert.deepEqual(second.applied, [], 'and the second round is a no-op, not a deletion')
    assert.equal(db.store.entries.length, 1)
  })

  test('a deletion loses to an edit made after it', async () => {
    const db = fakePrisma({ entries: [entry('a', T2)] })
    const r = await applyChanges(db, { tombstones: [{ syncId: 'a', deletedAt: T1 }] })
    assert.deepEqual(r.removed, [])
    assert.equal(r.kept[0].reason, 'edited after it was deleted')
    assert.equal(db.store.entries.length, 1)
  })
})

describe('branch scope is not a thing sync gets around', () => {
  const mine = (branch) => branch === 'Makkah'

  test('an entry for another branch is refused, not written', async () => {
    const db = fakePrisma()
    const r = await applyChanges(db, { entries: [entry('a', T1, { branch: 'Jeddah' })] }, { canWrite: mine })
    assert.deepEqual(r.applied, [])
    assert.equal(r.refused[0].reason, 'branch')
    assert.equal(db.store.entries.length, 0)
  })

  // The incoming row claims a branch the caller may write to, but the row it
  // would overwrite is in one they may not. The row that exists decides.
  test('an entry cannot be moved out of a branch the caller may not touch', async () => {
    const db = fakePrisma({ entries: [entry('a', T0, { branch: 'Jeddah' })] })
    const r = await applyChanges(db, { entries: [entry('a', T2, { branch: 'Makkah' })] }, { canWrite: mine })
    assert.deepEqual(r.applied, [])
    assert.equal(r.refused[0].reason, 'branch')
    assert.equal(db.store.entries[0].branch, 'Jeddah')
  })

  test('a tombstone for another branch is refused too', async () => {
    const db = fakePrisma({ entries: [entry('a', T0, { branch: 'Jeddah' })] })
    const r = await applyChanges(db, { tombstones: [{ syncId: 'a', deletedAt: T2 }] }, { canWrite: mine })
    assert.deepEqual(r.removed, [])
    assert.equal(db.store.entries.length, 1)
  })
})

describe('pull', () => {
  test('sends the server’s clock, so the caller does not page with its own', async () => {
    const db = fakePrisma({ entries: [entry('a', T1)] })
    const out = await pullChanges(db)
    assert.ok(Date.parse(out.now), 'now must be a timestamp')
    assert.equal(out.entries.length, 1)
  })

  test('an entry travels without the local id, which is not its identity', async () => {
    const wire = wireEntry({ id: 42, ...entry('a', T1) })
    assert.equal(wire.id, undefined)
    assert.equal(wire.syncId, 'a')
  })
})

describe('the clock check', () => {
  test('measures how far ahead or behind the caller is', () => {
    const now = Date.parse(T1)
    assert.equal(skewOf(T1, now), 0)
    assert.equal(skewOf(T2, now), 60 * 60 * 1000)
    assert.equal(skewOf(T0, now), -60 * 60 * 1000)
  })

  test('an unreadable or absent claim is not a skew, it is no claim', () => {
    assert.equal(skewOf(undefined), null)
    assert.equal(skewOf('later'), null)
  })

  // The failure this exists for: a clock an hour fast wins every conflict it is
  // in, including the ones it should lose, and the result looks ordinary.
  test('an hour out is far past what is tolerated', () => {
    assert.ok(Math.abs(skewOf(T2, Date.parse(T1))) > MAX_CLOCK_SKEW_MS)
  })

  test('ordinary drift is not', () => {
    assert.ok(Math.abs(skewOf('2026-08-27T11:00:20.000Z', Date.parse(T1))) < MAX_CLOCK_SKEW_MS)
  })
})

test('tombstones are pruned once they are older than any copy could be away', async () => {
  const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
  const db = fakePrisma({
    tombstones: [
      { syncId: 'old', deletedAt: old },
      { syncId: 'new', deletedAt: new Date() },
    ],
  })
  assert.equal(await pruneTombstones(db), 1)
  assert.deepEqual(
    db.store.tombstones.map((t) => t.syncId),
    ['new'],
  )
})
