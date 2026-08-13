/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCodeReport, matchOption, denseCode, FALLBACK } from './codes.js'
import { DEFAULT_OPTIONS, issueCode, issueCodeIndex, issueNames } from './options.js'

const OPTS = DEFAULT_OPTIONS

// Issue types that own a CDS code outright — what Manage inputs now writes.
// Plain strings stay in the list alongside them, as a real one always will.
const CODED = {
  ...OPTS,
  issueTypes: [
    ...OPTS.issueTypes.filter((t) => t !== 'CHARGER'),
    { name: 'CHARGER 818', parts: '99', variant: 'A' },
    { name: 'CHARGER DEY', parts: '99', variant: 'B' },
  ],
}

// Every separator style from the spec must decode to the SAME report.
const STYLES = [
  'H43A C 1 MT 2221 6575 1',
  'H43AC1MT 2221 6575 1',
  'H43AC1MT222165751',
  'H43A-C-1-MT-2221-6575-1',
  'H43A_C_1_MT_2221_6575_1',
  'H43A:C:1:MT:2221:6575:1',
]

test('all separator styles decode identically', () => {
  const results = STYLES.map((s) => parseCodeReport(s, FALLBACK, OPTS))
  for (const [i, r] of results.entries()) {
    assert.equal(r.ok, true, `${STYLES[i]} -> ${r.errors.join('; ')}`)
  }
  const first = JSON.stringify(results[0].entry)
  for (const [i, r] of results.entries()) {
    assert.equal(JSON.stringify(r.entry), first, `${STYLES[i]} differs`)
  }
})

test('H43A decodes to the original side grip on a TH1N', () => {
  const r = parseCodeReport('H43A C 1 MT 2221 6575 1', FALLBACK, OPTS)
  assert.equal(r.ok, true, r.errors.join('; '))
  assert.equal(r.faults.length, 1)
  assert.equal(r.faults[0].code, 'H43A')
  assert.equal(r.faults[0].variantLabel, 'Original')
  assert.equal(r.entry.type, 'AIRBUS')
  assert.equal(r.entry.model, 'TH1N')
  assert.equal(r.entry.faults[0].issue, 'SIDE GRIP')
  assert.equal(r.entry.faults[0].action, 'CHANGE')
  assert.equal(r.entry.faults[0].company, 'MOTECO')
  assert.equal(r.entry.faults[0].quantity, 1)
  assert.equal(r.entry.telNumber, '2221')
  assert.equal(r.entry.issiNumber, '6575')
  assert.equal(r.entry.technician, 'AMIR')
})

test('H43B selects the 3D side grip', () => {
  const r = parseCodeReport('H43B C 1 MT 2221 6575 1', FALLBACK, OPTS)
  assert.equal(r.ok, true, r.errors.join('; '))
  assert.equal(r.faults[0].variantLabel, '3D')
  assert.equal(r.entry.faults[0].issue, 'SIDE GRIP 3D')
})

test('multi-digit quantity is read whole, not split into the company', () => {
  const r = parseCodeReport('H43AC12MT222165751', FALLBACK, OPTS)
  assert.equal(r.ok, true, r.errors.join('; '))
  assert.equal(r.entry.faults[0].quantity, 12)
  assert.equal(r.entry.faults[0].company, 'MOTECO')
})

test('several parts on one device become several faults on one entry', () => {
  const r = parseCodeReport('H43AC1MT H26AR2MI 2221 6575 1', FALLBACK, OPTS)
  assert.equal(r.ok, true, r.errors.join('; '))
  assert.equal(r.entry.faults.length, 2)
  assert.equal(r.entry.faults[1].action, 'REPAIR')
  assert.equal(r.entry.faults[1].company, 'MOI')
  assert.equal(r.entry.faults[1].quantity, 2)
})

test('a two-digit technician id still leaves tel and issi at 4', () => {
  const r = parseCodeReport('H43AC1MT2221657512', FALLBACK, OPTS)
  assert.equal(r.telNumber, '2221')
  assert.equal(r.issiNumber, '6575')
})

test('mixing devices in one report is rejected, not silently merged', () => {
  const r = parseCodeReport('H43AC1MT T26AR1MI 2221 6575 1', FALLBACK, OPTS)
  assert.equal(r.ok, false)
  assert.match(r.errors.join(' '), /one device/i)
})

test('unknown codes are reported rather than guessed', () => {
  const bad = parseCodeReport('Z43AC1MT 2221 6575 1', FALLBACK, OPTS)
  assert.equal(bad.ok, false)
  assert.match(bad.errors.join(' '), /Unknown type letter "Z"/)

  const badVariant = parseCodeReport('H43QC1MT 2221 6575 1', FALLBACK, OPTS)
  assert.equal(badVariant.ok, false)
  assert.match(badVariant.errors.join(' '), /Unknown variant "Q"/)
})

test('a malformed tail fails loudly instead of producing a half entry', () => {
  const r = parseCodeReport('H43AC1MT 22 65 1', FALLBACK, OPTS)
  assert.equal(r.ok, false)
  assert.equal(r.entry, null)
  assert.match(r.errors.join(' '), /tel\(4\)|Missing the tail/)
})

test('matchOption bridges the two vocabularies without guessing', () => {
  assert.equal(matchOption('SRG Carkit', OPTS.models), 'SRG3900 CARKIT')
  assert.equal(matchOption('TMR880i', OPTS.models), 'TMR 880i')
  assert.equal(matchOption('TH1n', OPTS.models), 'TH1N')
  assert.equal(matchOption('Nothing Like This', OPTS.models), null)
})

test('a loose match takes the most specific option, not the first', () => {
  // 'LCD' sits before 'LCD CABLE' in the list; first-match order would file an
  // LCD Cable fault against the bare LCD.
  assert.equal(matchOption('LCD Cable', OPTS.issueTypes), 'LCD CABLE')
  assert.equal(matchOption('LCD Base', OPTS.issueTypes), 'LCD BASE')
  assert.equal(matchOption('LCD', OPTS.issueTypes), 'LCD')
})

test('denseCode collapses every supported separator', () => {
  for (const s of STYLES) assert.equal(denseCode(s), 'H43AC1MT222165751')
})

// ---- Issue types that own a CDS code (Manage inputs -> Issue types) ----

test('a code claimed by an issue type outranks the parts + variant lookup', () => {
  // Without a claim, 99 + B reads as "Charger" + "3D" and lands on CHARGER.
  const plain = parseCodeReport('H99B C 1 MT 2221 6575 1', FALLBACK, OPTS)
  assert.equal(plain.entry.faults[0].issue, 'CHARGER')

  // The claim makes B part of the identity, not a build of the same charger.
  const r = parseCodeReport('H99B C 1 MT 2221 6575 1', FALLBACK, CODED)
  assert.equal(r.ok, true, r.errors.join('; '))
  assert.equal(r.entry.faults[0].issue, 'CHARGER DEY')
  // No build to name once the code is claimed whole.
  assert.equal(r.faults[0].variantLabel, '—')

  const a = parseCodeReport('H99A C 1 MT 2221 6575 1', FALLBACK, CODED)
  assert.equal(a.entry.faults[0].issue, 'CHARGER 818')
})

test('a claimed code needs no entry in the code map at all', () => {
  // 71 is not a component and Q is not a variant, so this only decodes because
  // an issue type says what 71Q is.
  const opts = { ...OPTS, issueTypes: [{ name: 'UI FRAME', parts: '71', variant: 'Q' }] }
  const r = parseCodeReport('H71Q C 1 MT 2221 6575 1', FALLBACK, opts)
  assert.equal(r.ok, true, r.errors.join('; '))
  assert.equal(r.entry.faults[0].issue, 'UI FRAME')
  assert.equal(r.faults[0].variantLabel, '—')
})

test('a claim is device-agnostic — the technician supplies the device letter', () => {
  // The same fault reported off an Airbus TH1n and a Sepura STP9000 resolves to
  // the one issue type, but each keeps its own device on the entry.
  const h = parseCodeReport('H99B C 1 MT 2221 6575 1', FALLBACK, CODED)
  const t = parseCodeReport('T99B C 1 MT 2221 6575 1', FALLBACK, CODED)
  assert.equal(h.entry.faults[0].issue, 'CHARGER DEY')
  assert.equal(t.entry.faults[0].issue, 'CHARGER DEY')
  assert.equal(h.entry.type, 'AIRBUS')
  assert.equal(t.entry.type, 'SEPURA')
  assert.equal(h.faults[0].code, 'H99B')
  assert.equal(t.faults[0].code, 'T99B')
})

test('an unclaimed code still fails loudly on an unknown part or variant', () => {
  const r = parseCodeReport('H71Q C 1 MT 2221 6575 1', FALLBACK, CODED)
  assert.equal(r.ok, false)
  assert.match(r.errors.join(' '), /Unknown parts number "71"/)
  assert.match(r.errors.join(' '), /Unknown variant "Q"/)
})

test('uncoded issue types decode exactly as before', () => {
  const before = parseCodeReport('H43A C 1 MT 2221 6575 1', FALLBACK, OPTS)
  const after = parseCodeReport('H43A C 1 MT 2221 6575 1', FALLBACK, CODED)
  assert.equal(after.entry.faults[0].issue, 'SIDE GRIP')
  assert.equal(JSON.stringify(after.entry), JSON.stringify(before.entry))
})

test('half a code is not a code', () => {
  assert.equal(issueCode({ name: 'X', parts: '43', variant: '' }), '')
  assert.equal(issueCode({ name: 'X', parts: '', variant: 'A' }), '')
  assert.equal(issueCode({ name: 'X', parts: '4', variant: 'A' }), '')
  assert.equal(issueCode({ name: 'X', parts: '431', variant: 'A' }), '')
  assert.equal(issueCode({ name: 'X', parts: '43', variant: 'AB' }), '')
  assert.equal(issueCode({ name: 'X', parts: '43', variant: 'a' }), '43A')
  assert.equal(issueCode('SIDE GRIP'), '')
})

// The superseded shape carried a device letter and a combined "43A" base.
test('rows saved in the old device + base shape still resolve', () => {
  assert.equal(issueCode({ name: 'X', device: 'H', base: '43A' }), '43A')
  assert.equal(issueCode({ name: 'X', device: 'H', base: '43' }), '')
  const r = parseCodeReport('T43A C 1 MT 2221 6575 1', FALLBACK, {
    ...OPTS,
    issueTypes: [{ name: 'LEGACY GRIP', device: 'H', base: '43A' }],
  })
  // Claimed on 43A alone, so it resolves off a Sepura too — the stored device
  // letter was never what the decoder matched on.
  assert.equal(r.entry.faults[0].issue, 'LEGACY GRIP')
})

test('a duplicated code keeps its first meaning, whatever the list order', () => {
  const index = issueCodeIndex([
    { name: 'FIRST', parts: '43', variant: 'A' },
    { name: 'SECOND', parts: '43', variant: 'A' },
  ])
  assert.equal(index['43A'], 'FIRST')
})

test('a code with no description claims nothing — there is nothing to decode to', () => {
  const index = issueCodeIndex([{ name: '  ', parts: '43', variant: 'A' }])
  assert.deepEqual(index, {})
})

test('issueNames reads legacy strings and coded objects alike', () => {
  assert.deepEqual(issueNames(['LCD', { name: 'CHARGER 818', parts: '99', variant: 'A' }]), [
    'LCD',
    'CHARGER 818',
  ])
})
