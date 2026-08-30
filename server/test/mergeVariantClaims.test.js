/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The plan that folds a code claimed once per device into one row.
 *
 * Worth testing rather than reading: it rewrites the parts vocabulary somebody
 * files reports against, in a script whose whole job is to be run once against
 * production. The failure it exists to prevent is a name quietly disappearing —
 * a part that stops being offered for the radio it is actually on.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { planMerges, mergedList } from '../src/mergeVariantClaims.js'
import { issueAllNames, issueNameForModel, issueModels } from '../../client/src/options.js'

const claim = (name, parts, variant, models, names) => {
  const t = { name, parts, variant }
  if (models) t.models = models
  if (names) t.names = names
  return t
}

// 44A as it is stored today: two rows, one per device.
const B1590 = claim('Battery 1590', '44', 'A', ['TH1n'])
const B1880 = claim('Battery 1880', '44', 'A', ['STP9000'])
// 99A as it is stored today: one row, two devices, one override.
const ACP12 = claim('Charger ACP-12', '99', 'A', ['TH1n', 'STP9000'], { STP9000: 'ChargerSC2' })

describe('planning the merge', () => {
  test('two claims on one code become one row with a per-device name', () => {
    const { merges, skipped } = planMerges([B1590, B1880])
    assert.equal(skipped.length, 0)
    assert.equal(merges.length, 1)
    const { merged, dropped } = merges[0]
    assert.equal(merged.name, 'Battery 1590') // the FIRST row keeps its name
    assert.deepEqual(merged.models, ['TH1n', 'STP9000'])
    assert.deepEqual(merged.names, { STP9000: 'Battery 1880' })
    assert.deepEqual(dropped, [B1880])
  })

  test('the merged row is shaped exactly like the 99A it is copying', () => {
    const { merges } = planMerges([B1590, B1880])
    assert.deepEqual(Object.keys(merges[0].merged).sort(), Object.keys(ACP12).sort())
  })

  test('a code already held as one row is left alone', () => {
    const { merges, skipped, multi } = planMerges([ACP12])
    assert.equal(multi, 0)
    assert.equal(merges.length, 0)
    assert.equal(skipped.length, 0)
  })

  test('an uncoded row is not a claim and cannot be merged', () => {
    const { merges } = planMerges([{ name: 'Solder Lead' }, { name: 'Electric Tape' }])
    assert.equal(merges.length, 0)
  })

  // Every skip is a case where merging would decide something a person has to.
  test('an un-narrowed row is reported, not merged', () => {
    const wide = claim('Battery Generic', '44', 'A') // no models: every device
    const { merges, skipped } = planMerges([B1590, wide])
    assert.equal(merges.length, 0)
    assert.equal(skipped.length, 1)
    assert.match(skipped[0].why, /not narrowed/)
  })

  test('two rows claiming the SAME device are reported, not merged', () => {
    const other = claim('Battery Other', '44', 'A', ['TH1N']) // same radio, spelled differently
    const { merges, skipped } = planMerges([B1590, other])
    assert.equal(merges.length, 0)
    assert.equal(skipped.length, 1)
    assert.match(skipped[0].why, /claimed by both/)
  })

  test('a row carrying a field this does not understand is reported, not merged', () => {
    const odd = { ...claim('Battery 1880', '44', 'A', ['STP9000']), shelf: 'B2' }
    const { merges, skipped } = planMerges([B1590, odd])
    assert.equal(merges.length, 0)
    assert.match(skipped[0].why, /unknown field shelf/)
  })

  test('a row narrowed to nothing at all is still a narrowed row, and merges', () => {
    const none = claim('Battery Spare', '44', 'A', [])
    const { merges, skipped } = planMerges([B1590, none])
    assert.equal(skipped.length, 0)
    assert.deepEqual(merges[0].merged.models, ['TH1n'])
  })

  test('three claims fold into one row', () => {
    const B2000 = claim('Battery 2000', '44', 'A', ['PT580H'])
    const { merges } = planMerges([B1590, B1880, B2000])
    assert.equal(merges.length, 1)
    assert.deepEqual(merges[0].merged.models, ['TH1n', 'STP9000', 'PT580H'])
    assert.deepEqual(merges[0].merged.names, { STP9000: 'Battery 1880', PT580H: 'Battery 2000' })
  })

  // The row already says its own name; a stored duplicate is a second copy to
  // drift out of step with the first.
  test('a dropped row that merely re-spells the base name stores no override', () => {
    const same = claim('BATTERY  1590', '44', 'A', ['STP9000'])
    const { merges } = planMerges([B1590, same])
    assert.equal(merges[0].merged.names, undefined)
    assert.deepEqual(merges[0].merged.models, ['TH1n', 'STP9000'])
  })

  test('overrides already stored on either row are carried across', () => {
    const withOverride = claim('Battery 1590', '44', 'A', ['TH1n', 'THR9'], { THR9: 'Battery 1590L' })
    const { merges } = planMerges([withOverride, B1880])
    assert.deepEqual(merges[0].merged.names, { THR9: 'Battery 1590L', STP9000: 'Battery 1880' })
  })
})

describe('what the list looks like afterwards', () => {
  const list = [claim('Antenna', '10', 'A', ['TH1n']), B1590, claim('PCB', '20', 'A', ['TH1n']), B1880]

  test('the merged row takes the first claim place, so nothing shuffles', () => {
    const { merges } = planMerges(list)
    const next = mergedList(list, merges)
    assert.deepEqual(
      next.map((t) => t.name),
      ['Antenna', 'Battery 1590', 'PCB'],
    )
  })

  test('rows that were not part of a merge come through untouched', () => {
    const { merges } = planMerges(list)
    const next = mergedList(list, merges)
    assert.equal(next[0], list[0])
    assert.equal(next[2], list[2])
  })

  // The whole safety claim of the script, asserted rather than promised.
  test('every name that was in the list is still answerable afterwards', () => {
    const before = new Set(list.flatMap(issueAllNames))
    const { merges } = planMerges(list)
    const after = new Set(mergedList(list, merges).flatMap(issueAllNames))
    for (const n of before) assert.ok(after.has(n), `"${n}" went missing`)
  })

  test('each device still gets the name the part goes by there', () => {
    const { merges } = planMerges(list)
    const battery = mergedList(list, merges).find((t) => t.parts === '44')
    assert.equal(issueNameForModel(battery, 'TH1n'), 'Battery 1590')
    assert.equal(issueNameForModel(battery, 'STP9000'), 'Battery 1880')
  })

  test('and is still offered for the devices it was offered for', () => {
    const { merges } = planMerges(list)
    const battery = mergedList(list, merges).find((t) => t.parts === '44')
    assert.deepEqual(issueModels(battery), ['TH1n', 'STP9000'])
  })

  test('a list with nothing to merge comes back identical', () => {
    const clean = [ACP12, claim('Antenna', '10', 'A', ['TH1n'])]
    const { merges } = planMerges(clean)
    assert.deepEqual(mergedList(clean, merges), clean)
  })
})
