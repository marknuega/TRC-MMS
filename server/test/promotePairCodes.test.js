/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Promotion: a named item moving onto the parts code its name was just given.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { newlyCodedIssues, promotePairCodes } from '../src/promotePairCodes.js'
import { CODEMAP_SEED } from '../src/codemapSeed.js'

const CUR3 = 'CUR3 DISPLAY FOR TMR880I - HT10280AA'

describe('newlyCodedIssues', () => {
  test('an issue that gained a code is a promotion', () => {
    const before = [CUR3, 'ANTENNA']
    const after = [{ name: CUR3, parts: '26', variant: 'A' }, 'ANTENNA']
    assert.deepEqual(newlyCodedIssues(before, after), [{ name: CUR3, code: '26A' }])
  })

  // A routine save of the option list — adding a technician, renaming an agency
  // — must not re-run every promotion that ever happened.
  test('an issue that already had a code is not', () => {
    const list = [{ name: 'SPEAKER LOW', parts: '45', variant: 'A' }]
    assert.deepEqual(newlyCodedIssues(list, list), [])
  })

  // A RE-code is a correction to the vocabulary, not a part finding its code.
  // Moving stock under it would need someone to say which shelf they meant.
  test('a changed code is left alone', () => {
    const before = [{ name: 'SPEAKER LOW', parts: '45', variant: 'A' }]
    const after = [{ name: 'SPEAKER LOW', parts: '46', variant: 'A' }]
    assert.deepEqual(newlyCodedIssues(before, after), [])
  })

  test('an issue added already carrying a code counts', () => {
    assert.deepEqual(newlyCodedIssues(['ANTENNA'], ['ANTENNA', { name: 'LCD', parts: '26', variant: 'A' }]), [
      { name: 'LCD', code: '26A' },
    ])
  })

  test('half a code is not a code', () => {
    assert.deepEqual(newlyCodedIssues([CUR3], [{ name: CUR3, parts: '26' }]), [])
    assert.deepEqual(newlyCodedIssues([CUR3], [{ name: CUR3, variant: 'A' }]), [])
  })

  test('tolerates a missing or empty list', () => {
    assert.deepEqual(newlyCodedIssues(undefined, undefined), [])
    assert.deepEqual(newlyCodedIssues(null, []), [])
  })
})

/**
 * A stand-in for the Prisma transaction client, holding rows in memory. Enough
 * of findMany / findFirst / update / updateMany for what promotion does, and no
 * more — the point is the rules, not the query builder.
 */
function fakeTx(items, txns = []) {
  const match = (row, where) =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'NOT') return !match(row, v)
      return row[k] === v
    })
  return {
    items,
    txns,
    inventoryItem: {
      findMany: async ({ where }) => items.filter((i) => match(i, where)),
      findFirst: async ({ where }) => items.find((i) => match(i, where)) ?? null,
      update: async ({ where, data }) => {
        const row = items.find((i) => i.id === where.id)
        Object.assign(row, data)
        return row
      },
    },
    inventoryTxn: {
      updateMany: async ({ where, data }) => {
        let count = 0
        for (const t of txns) {
          if (match(t, where)) {
            Object.assign(t, data)
            count += 1
          }
        }
        return { count }
      },
    },
  }
}

const EQUIP = CODEMAP_SEED.equipmentCodes

describe('promotePairCodes', () => {
  const item = (id, sku, pairCode, branch = 'Makkah') => ({
    id,
    sku,
    branch,
    pairCode,
    formerPairCode: '',
  })

  test('the item moves onto its real code and keeps the old one on the record', async () => {
    const tx = fakeTx([item(1, 'TMR-CUR3', `M:${CUR3}`)])
    const { promoted, skipped } = await promotePairCodes(tx, {
      before: [CUR3],
      after: [{ name: CUR3, parts: '26', variant: 'A' }],
      equipmentCodes: EQUIP,
    })

    assert.deepEqual(promoted, [{ sku: 'TMR-CUR3', branch: 'Makkah', from: `M:${CUR3}`, to: 'M26A' }])
    assert.deepEqual(skipped, [])
    assert.equal(tx.items[0].pairCode, 'M26A')
    // Kept for good: documents already printed name the old form, and the shelf
    // they point at has to stay findable.
    assert.equal(tx.items[0].formerPairCode, `M:${CUR3}`)
  })

  // An audit that stopped at the promotion would read as two half histories of
  // two items that never existed.
  test('the ledger rows that recorded the old code are rewritten too', async () => {
    const txns = [
      { itemId: 1, pairCode: `M:${CUR3}`, change: -1 },
      { itemId: 1, pairCode: `M:${CUR3}`, change: -2 },
      { itemId: 2, pairCode: `M:${CUR3}`, change: -9 }, // another item's ledger
      { itemId: 1, pairCode: '', change: -3 }, // drawn as a shared item
    ]
    const tx = fakeTx([item(1, 'TMR-CUR3', `M:${CUR3}`)], txns)
    await promotePairCodes(tx, {
      before: [CUR3],
      after: [{ name: CUR3, parts: '26', variant: 'A' }],
      equipmentCodes: EQUIP,
    })
    assert.deepEqual(
      txns.map((t) => t.pairCode),
      ['M26A', 'M26A', `M:${CUR3}`, ''],
    )
  })

  // One name, several radios: each model's own item moves to its own code, and
  // they stay as separate afterwards as they were before.
  test('every model holding that name is promoted to its own code', async () => {
    const tx = fakeTx([
      item(1, 'TH1N-SPK', 'H:LOUD SPEAKER'),
      item(2, 'CARKIT-SPK', 'C:LOUD SPEAKER'),
      item(3, 'DESK-SPK', 'D:LOUD SPEAKER'),
    ])
    const { promoted } = await promotePairCodes(tx, {
      before: ['LOUD SPEAKER'],
      after: [{ name: 'Loud Speaker', parts: '45', variant: 'A' }],
      equipmentCodes: EQUIP,
    })
    assert.deepEqual(
      promoted.map((p) => p.to).sort(),
      ['C45A', 'D45A', 'H45A'],
    )
  })

  // Two items under one code is exactly the ambiguity that stops a save, so it
  // is reported rather than created.
  test('a code another item already holds is skipped, not overwritten', async () => {
    const tx = fakeTx([item(1, 'TMR-CUR3', `M:${CUR3}`), item(2, 'TMR-LCD', 'M26A')])
    const { promoted, skipped } = await promotePairCodes(tx, {
      before: [CUR3],
      after: [{ name: CUR3, parts: '26', variant: 'A' }],
      equipmentCodes: EQUIP,
    })
    assert.deepEqual(promoted, [])
    assert.deepEqual(skipped, [{ sku: 'TMR-CUR3', to: 'M26A', heldBy: 'TMR-LCD' }])
    assert.equal(tx.items[0].pairCode, `M:${CUR3}`) // untouched
  })

  // Each branch keeps its own stock, so the same code in another branch is not
  // a clash at all.
  test('the same code in another branch is not a clash', async () => {
    const tx = fakeTx([item(1, 'MAK-CUR3', `M:${CUR3}`, 'Makkah'), item(2, 'TAIF-LCD', 'M26A', 'Taif')])
    const { promoted, skipped } = await promotePairCodes(tx, {
      before: [CUR3],
      after: [{ name: CUR3, parts: '26', variant: 'A' }],
      equipmentCodes: EQUIP,
    })
    assert.equal(promoted.length, 1)
    assert.deepEqual(skipped, [])
  })

  test('a shared item is not touched — it never had a provisional code', async () => {
    const tx = fakeTx([item(1, 'ANY-CUR3', '')])
    const { promoted } = await promotePairCodes(tx, {
      before: [CUR3],
      after: [{ name: CUR3, parts: '26', variant: 'A' }],
      equipmentCodes: EQUIP,
    })
    assert.deepEqual(promoted, [])
    assert.equal(tx.items[0].pairCode, '')
  })

  test('nothing gained a code, nothing is read or written', async () => {
    const tx = fakeTx([item(1, 'TMR-CUR3', `M:${CUR3}`)])
    const { promoted } = await promotePairCodes(tx, { before: [CUR3], after: [CUR3], equipmentCodes: EQUIP })
    assert.deepEqual(promoted, [])
    assert.equal(tx.items[0].pairCode, `M:${CUR3}`)
  })
})
