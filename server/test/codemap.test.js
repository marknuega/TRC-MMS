/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The public code map is consumed by the WhatsApp bot, which has no session and
 * no way to report a mistake — a code it resolves wrongly becomes a misfiled
 * report. So the contract is tested directly, and the fault-code derivation is
 * run through BOTH implementations to keep the server and the client in step.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { faultCodes, technicianCodes, sanitizeCodeMap, validateCodeMap, withRequiredActions } from '../src/routes/codemap.js'
import { issueCode, issueName, technicianIdMap } from '../../client/src/options.js'

// The same rows the app stores, in every shape it has ever written them.
const ROWS = [
  'LCD', // legacy plain string: an issue type with no code
  { name: 'Fistmic', parts: '19', variant: 'B' },
  { name: 'Belt Clip', parts: '55', variant: 'A' },
  { name: 'Charger-DEY', parts: '99', variant: 'C' },
  { name: 'Legacy Grip', device: 'H', base: '43A' }, // superseded shape
  { name: 'No code', parts: '', variant: '' },
  { name: 'Half a code', parts: '19', variant: '' },
  { name: '  ', parts: '77', variant: 'A' }, // nameless: nothing to decode to
]

describe('faultCodes', () => {
  test('publishes exactly the rows that claim a code', () => {
    assert.deepEqual(faultCodes(ROWS), {
      '19B': 'Fistmic',
      '55A': 'Belt Clip',
      '99C': 'Charger-DEY',
      '43A': 'Legacy Grip',
    })
  })

  test('agrees with the client, row for row', () => {
    // If either implementation drifts, this fails on the row that moved rather
    // than silently handing the bot a different vocabulary than the app's.
    const fromClient = {}
    for (const row of ROWS) {
      const code = issueCode(row)
      const name = issueName(row).trim()
      if (code && name && !fromClient[code]) fromClient[code] = name
    }
    assert.deepEqual(faultCodes(ROWS), fromClient)
  })

  test('first claim wins, so list order cannot flip a meaning', () => {
    assert.deepEqual(
      faultCodes([
        { name: 'FIRST', parts: '43', variant: 'A' },
        { name: 'SECOND', parts: '43', variant: 'A' },
      ]),
      { '43A': 'FIRST' },
    )
  })

  test('a malformed code is dropped, never half-published', () => {
    assert.deepEqual(
      faultCodes([
        { name: 'Too few', parts: '4', variant: 'A' },
        { name: 'Too many', parts: '431', variant: 'A' },
        { name: 'Not a letter', parts: '43', variant: '1' },
        { name: 'Two letters', parts: '43', variant: 'AB' },
      ]),
      {},
    )
  })

  test('missing or empty options are not an error — just no faults', () => {
    assert.deepEqual(faultCodes(undefined), {})
    assert.deepEqual(faultCodes([]), {})
  })
})

// The technicians rows the app stores, in every shape it has ever written them.
const TECH_ROWS = [
  'AMIR', // legacy plain string: a technician with no ID
  { name: 'Muhammad Rashid', id: '2' },
  { name: 'Imran', id: '3' },
  { name: 'No ID', id: '' },
  { name: '  ', id: '9' }, // nameless: nothing to decode to
  { name: 'Muhammad Amir', id: '1', initials2: 'ma', initials3: 'mha' }, // lower-case as typed — upper-cased on publish
]

describe('technicianCodes', () => {
  test('publishes ID, 2-letter, and 3-letter initials, each independently', () => {
    assert.deepEqual(technicianCodes(TECH_ROWS), {
      2: 'Muhammad Rashid',
      3: 'Imran',
      1: 'Muhammad Amir',
      MA: 'Muhammad Amir',
      MHA: 'Muhammad Amir',
    })
  })

  test('agrees with the client, row for row', () => {
    assert.deepEqual(technicianCodes(TECH_ROWS), technicianIdMap(TECH_ROWS))
  })

  test('first claim wins, so list order cannot flip a meaning', () => {
    assert.deepEqual(
      technicianCodes([
        { name: 'FIRST', id: '1' },
        { name: 'SECOND', id: '1' },
      ]),
      { 1: 'FIRST' },
    )
    assert.deepEqual(
      technicianCodes([
        { name: 'FIRST', initials2: 'MA' },
        { name: 'SECOND', initials2: 'MA' },
      ]),
      { MA: 'FIRST' },
    )
  })

  test('missing or empty technicians are not an error — just no IDs', () => {
    assert.deepEqual(technicianCodes(undefined), {})
    assert.deepEqual(technicianCodes([]), {})
  })
})

// A parts number is exactly two digits (see refGroups.js PARTS_RE, client-side).
// The five codes the WhatsApp bridge seed carried in `components` — H43A, H43B,
// 98A, 99A, 99B — could never decode for that reason. Re-checked here so a PUT
// can never write another one back in, even if the client's own check is
// bypassed.
describe('sanitizeCodeMap', () => {
  test('drops stale 2-digit+suffix part codes that can never decode', () => {
    const cleaned = sanitizeCodeMap({
      components: { '43': 'Side Grip', H43A: 'Legacy', '98A': 'Power Supply', '99B': 'Charger DC' },
      componentCategories: { '43': 'Audio & Controls', H43A: 'Legacy' },
    })

    assert.deepEqual(cleaned.components, { '43': 'Side Grip' })
    assert.deepEqual(cleaned.componentCategories, { '43': 'Audio & Controls' })
  })
})

describe('validateCodeMap', () => {
  test('accepts a well-formed map', () => {
    assert.equal(
      validateCodeMap({ components: { '43': 'Side Grip' }, componentCategories: { '43': 'Audio & Controls' } }),
      null,
    )
  })

  test('rejects a components code that is not exactly two digits', () => {
    for (const bad of ['98A', '99A', '99B', 'H43A', 'H43B']) {
      const problem = validateCodeMap({ components: { [bad]: 'Something' } })
      assert.match(problem, /is not a parts number/)
    }
  })

  test('rejects the same malformed codes in componentCategories', () => {
    const problem = validateCodeMap({ componentCategories: { '98A': 'Power & Charging' } })
    assert.match(problem, /is not a parts number/)
  })

  test('componentCategories is a recognised category, not rejected as unknown', () => {
    assert.equal(validateCodeMap({ componentCategories: { '43': 'Audio & Controls' } }), null)
  })
})

// A map saved before RTO existed must not make a correctly-written RTO code
// undecodable: FAULT_PATTERN would match the three letters and then find no
// name for them, rejecting the technician's message.
describe('withRequiredActions', () => {
  test('RTO is filled into a map that predates it', () => {
    const out = withRequiredActions({ actions: { C: 'Change' } })
    assert.deepEqual(out.actions, { C: 'Change', RTO: 'RTO' })
  })

  test('a map with no actions category at all still gets RTO', () => {
    assert.deepEqual(withRequiredActions({}).actions, { RTO: 'RTO' })
  })

  test('an existing RTO entry is left exactly as the admin wrote it', () => {
    const map = { actions: { RTO: 'Return To Owner' } }
    assert.equal(withRequiredActions(map), map, 'must not rewrite an admin value')
  })

  test('nothing missing means the very same object back, so no needless write', () => {
    const map = { actions: { C: 'Change', RTO: 'RTO' }, companies: { MT: 'MOTECO' } }
    assert.equal(withRequiredActions(map), map)
  })

  test('the other categories are untouched', () => {
    const out = withRequiredActions({ actions: {}, components: { 43: 'Side Grip' } })
    assert.deepEqual(out.components, { 43: 'Side Grip' })
  })

  test('a non-object is passed straight through', () => {
    assert.equal(withRequiredActions(null), null)
    assert.equal(withRequiredActions(undefined), undefined)
  })
})
