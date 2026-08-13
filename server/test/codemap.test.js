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
import { faultCodes } from '../src/routes/codemap.js'
import { issueCode, issueName } from '../../client/src/options.js'

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
