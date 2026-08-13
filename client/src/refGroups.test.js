/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupComponents } from './refGroups.js'

// The card is what technicians read. Listing a code they cannot use is worse
// than listing nothing: H99A once meant "Charger818" in the parts map, but a
// claim says 99A is "Charger", and the claim is what decodes. Showing the dead
// row invites a report filed against the wrong part.
const MAP = {
  11: 'Antenna Connector',
  26: 'LCD',
  43: 'Side Grip',
  98: 'Power Supply',
  '98A': 'Power Supply - PSE65-12',
  '99A': 'Charger818',
  H43A: 'Sidegrip',
}

test('only two-digit parts numbers reach the card', () => {
  const { groups } = groupComponents(MAP)
  const shown = groups.flatMap((g) => g.items.map(([code]) => code))
  assert.deepEqual(shown.sort(), ['11', '26', '43', '98'])
})

test('the unreachable ones are reported, not silently dropped', () => {
  const { unusable } = groupComponents(MAP)
  assert.deepEqual(
    unusable.map(([code]) => code).sort(),
    ['98A', '99A', 'H43A'],
  )
})

test('a clean map reports nothing to fix', () => {
  const { groups, unusable } = groupComponents({ 11: 'Antenna Connector', 43: 'Side Grip' })
  assert.equal(unusable.length, 0)
  assert.equal(groups.flatMap((g) => g.items).length, 2)
})

test('parts land in their number buckets', () => {
  const { groups } = groupComponents(MAP)
  const byTitle = Object.fromEntries(groups.map((g) => [g.title, g.items.map(([c]) => c)]))
  assert.deepEqual(byTitle['Housing & Antenna'], ['11'])
  assert.deepEqual(byTitle['Electronics & UI'], ['26'])
  assert.deepEqual(byTitle['Audio & Controls'], ['43'])
  assert.deepEqual(byTitle['Power & Charging'], ['98'])
})

// The Edit Code Map "Category" field on a parts number (client/src/ReferenceCard.jsx,
// CodeMapEditor) — an override that wins over the automatic by-number bucket.
test('an explicit category overrides the automatic number bucket', () => {
  const { groups } = groupComponents({ 11: 'Antenna Connector', 43: 'Side Grip' }, { 11: 'Batteries' })
  const byTitle = Object.fromEntries(groups.map((g) => [g.title, g.items.map(([c]) => c)]))
  assert.deepEqual(byTitle.Batteries, ['11'])
  assert.equal(byTitle['Housing & Antenna'], undefined)
  assert.deepEqual(byTitle['Audio & Controls'], ['43'])
})

test('a blank or missing category falls back to the number bucket', () => {
  const { groups } = groupComponents({ 11: 'Antenna Connector' }, { 11: '  ', 26: 'Orphaned override' })
  const byTitle = Object.fromEntries(groups.map((g) => [g.title, g.items.map(([c]) => c)]))
  assert.deepEqual(byTitle['Housing & Antenna'], ['11'])
})

test('an unusable code ignores any category override', () => {
  const { unusable } = groupComponents({ '98A': 'Power Supply - PSE65-12' }, { '98A': 'Power & Charging' })
  assert.deepEqual(unusable, [['98A', 'Power Supply - PSE65-12']])
})
