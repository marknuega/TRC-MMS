/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The letter series a SKU is filed under — see src/letterSku.js.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { letterFor, letterSku } from '../src/letterSku.js'
import { companyFromSku } from '../../client/src/company.js'

describe('letterFor', () => {
  test('1-26 are A-Z', () => {
    assert.equal(letterFor(1), 'A')
    assert.equal(letterFor(2), 'B')
    assert.equal(letterFor(26), 'Z')
  })

  test('there is no 27th letter, and no 0th', () => {
    assert.equal(letterFor(27), '')
    assert.equal(letterFor(0), '')
    assert.equal(letterFor(-1), '')
  })
})

describe('letterSku', () => {
  // -1 is B, not A. The unsuffixed row is the first of its stem and holds A,
  // so the suffix counts what was added after it.
  test('a numbered suffix counts on from the base', () => {
    assert.equal(letterSku('MOT-MAK-1117-1').to, 'MOT-MAK-1117B')
    assert.equal(letterSku('MOT-MAK-1117-2').to, 'MOT-MAK-1117C')
    assert.equal(letterSku('MOT-MAK-1117-25').to, 'MOT-MAK-1117Z')
  })

  // The base series. An unsuffixed SKU is the first of its stem, and A is what
  // "first" is called from here on.
  test('no suffix at all gains an A', () => {
    assert.equal(letterSku('MOT-MAK-1116').to, 'MOT-MAK-1116A')
    assert.equal(letterSku('X1-MAK-1111').to, 'X1-MAK-1111A')
  })

  // Re-running the migration must not march a SKU to MOT-MAK-1117AA.
  test('an already-lettered SKU is left alone', () => {
    assert.deepEqual(letterSku('MOT-MAK-1117A'), { done: true })
    assert.deepEqual(letterSku('MOT-MAK-1117Z'), { done: true })
    assert.deepEqual(letterSku('MOT-MAK-1117a'), { done: true })
  })

  test('applying it twice is the same as applying it once', () => {
    const once = letterSku('MOT-MAK-1117-1').to
    assert.deepEqual(letterSku(once), { done: true })
  })

  // Reported rather than approximated: a SKU is what every ledger row and
  // every count is keyed by, so a rename nobody can justify is not made.
  test('a suffix past -25 is refused, not wrapped', () => {
    assert.match(letterSku('MOT-MAK-1117-26').skip, /past -25/)
  })

  // A suffix only reads as a suffix behind a number. Behind a word there is
  // nothing saying -1 is a series rather than part of the name, so the SKU is
  // taken whole and lettered like any other base — which loses nothing and
  // still ends in a letter. The dry run prints it; a store that meant it as a
  // series can say so by hand.
  test('a -1 behind a word is part of the name, not a series', () => {
    assert.equal(letterSku('MOT-MAK-SPARE-1').to, 'MOT-MAK-SPARE-1A')
    assert.deepEqual(letterSku('MOT-MAK-SPARE-1A'), { done: true })
  })

  test('a SKU with no digit to letter is refused', () => {
    assert.ok(letterSku('MOT-MAK-SPARE').skip)
    assert.ok(letterSku('').skip)
  })

  // The four-digit tail is the item number, not a 1116-long series.
  test('a long tail is a part number, not a suffix', () => {
    assert.equal(letterSku('MOT-MAK-1116').to, 'MOT-MAK-1116A')
    assert.match(letterSku('MOT-MAK-1117-26').skip, /past -25/)
  })

  // The pair the whole stem-ends-in-a-digit rule exists to tell apart. Same
  // four digits, one with a suffix and one without, and the -1 is the half
  // that reads as a series.
  test('-1116 is the item number and -1116-1 is the one after it', () => {
    assert.equal(letterSku('MOT-MAK-1116').to, 'MOT-MAK-1116A')
    assert.equal(letterSku('MOT-MAK-1116-1').to, 'MOT-MAK-1116B')
    assert.equal(letterSku('MOT-MAK-1116-2').to, 'MOT-MAK-1116C')
  })

  // The store holds all three of these side by side. Every one has to land on
  // a SKU of its own or the migration refuses the whole run — this is the
  // case that sent the rule back for a second look.
  test('a stem with a bare row AND numbered rows keeps them all distinct', () => {
    const real = ['MOT-MAK-1114', 'MOT-MAK-1114-1', 'MOT-MAK-1114-2', 'MOT-MAK-1117', 'MOT-MAK-1117-1']
    const to = real.map((s) => letterSku(s).to)
    assert.deepEqual(to, ['MOT-MAK-1114A', 'MOT-MAK-1114B', 'MOT-MAK-1114C', 'MOT-MAK-1117A', 'MOT-MAK-1117B'])
    assert.equal(new Set(to).size, to.length, 'every row must keep a SKU of its own')
  })

  // The whole point of only ever touching the tail: the company is read off
  // the head, so no row changes shelf on the way through.
  test('the company prefix survives the rename', () => {
    for (const sku of ['MOT-MAK-1117-1', 'X1-MAK-1111', 'X2-MAK-1125-3']) {
      assert.equal(companyFromSku(letterSku(sku).to), companyFromSku(sku))
    }
  })
})
