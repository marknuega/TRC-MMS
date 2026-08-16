/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { test, describe } from 'node:test'
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

// A technician ID may be given once, right after ANY fault's company, and it
// applies to the whole message — later fault codes never need to repeat it.
describe('an inline technician ID (beside a company, not just at the end)', () => {
  test('decodes, and later shorthand codes still chain normally', () => {
    const r = parseCodeReport('H43ACT1 11ANI', FALLBACK, OPTS)
    assert.equal(r.ok, true, r.errors.join('; '))
    assert.equal(r.faults.length, 2)
    assert.equal(r.faults[1].code, 'H11A')
    assert.equal(r.telNumber, '')
    assert.equal(r.issiNumber, '')
    assert.equal(r.entry.technician, 'AMIR')
  })

  test('tel + ISSI may still follow at the true end of the message', () => {
    const r = parseCodeReport('H43ACT1 11ANI 2221 6575', FALLBACK, OPTS)
    assert.equal(r.ok, true, r.errors.join('; '))
    assert.equal(r.faults.length, 2)
    assert.equal(r.telNumber, '2221')
    assert.equal(r.issiNumber, '6575')
    assert.equal(r.entry.technician, 'AMIR')
  })

  test('only a REGISTERED id counts — an unregistered short run is not silently read as one', () => {
    const r = parseCodeReport('H43ACT99', FALLBACK, OPTS)
    assert.equal(r.ok, true, r.errors.join('; '))
    assert.equal(r.faults.length, 1) // "99" was never mistaken for a continuing fault code either
    assert.equal(r.entry.technician, '')
    assert.match(r.warnings.join(' '), /No technician with ID 99/)
  })

  test('a short numeric prefix that happens to be a real id never hijacks the standard end-of-line tel+ISSI+tech form', () => {
    // "2" IS a registered id (Muhammad Rashid) in FALLBACK, but the rest of
    // "2221657512" can never cleanly close out as more fault codes (it's all
    // digits), so this must still resolve exactly as the plain tail — tel
    // 2221, ISSI 6575, technician id "12" (unregistered, hence the warning).
    const r = parseCodeReport('H43AC1MT2221657512', FALLBACK, OPTS)
    assert.equal(r.ok, true, r.errors.join('; '))
    assert.equal(r.faults.length, 1)
    assert.equal(r.telNumber, '2221')
    assert.equal(r.issiNumber, '6575')
    assert.match(r.warnings.join(' '), /No technician with ID 12/)
  })

  test('a lettered (initials) id is recognized even with nothing but tel+ISSI after it — no fault code required to follow', () => {
    // Unlike a purely numeric id, a lettered token can never be confused
    // with the ordinary all-digit tail, so it doesn't need a following
    // fault code to prove its position — "MA" here sits right after the
    // second fault's company (I = MOI), with only tel+ISSI after it.
    const map = { ...FALLBACK, technicians: { ...FALLBACK.technicians, MA: 'Muhammad Amir' } }
    // Technicians list left empty — see the earlier letter-initials test for
    // why (avoids matchOption() fuzzy-matching onto the unrelated "AMIR").
    const r = parseCodeReport('H43ACT 43ACIMA 2222 6666', map, { ...OPTS, technicians: [] })
    assert.equal(r.ok, true, r.errors.join('; '))
    assert.equal(r.faults.length, 2)
    assert.equal(r.faults[1].company, 'MOI')
    assert.equal(r.telNumber, '2222')
    assert.equal(r.issiNumber, '6666')
    assert.equal(r.entry.technician, 'MUHAMMAD AMIR')
  })

  test('a lettered id with nothing at all after it also decodes', () => {
    const map = { ...FALLBACK, technicians: { ...FALLBACK.technicians, MA: 'Muhammad Amir' } }
    const r = parseCodeReport('H43ACIMA', map, { ...OPTS, technicians: [] })
    assert.equal(r.ok, true, r.errors.join('; '))
    assert.equal(r.faults.length, 1)
    assert.equal(r.faults[0].company, 'MOI')
    assert.equal(r.telNumber, '')
    assert.equal(r.issiNumber, '')
    assert.equal(r.entry.technician, 'MUHAMMAD AMIR')
  })
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

test('a truly unparseable tail fails loudly instead of producing a half entry', () => {
  const r = parseCodeReport('H43AC1MT@@@', FALLBACK, OPTS)
  assert.equal(r.ok, false)
  assert.equal(r.entry, null)
  assert.match(r.errors.join(' '), /Could not read|Missing the tail/)
})

test('an empty tail after a fault code fails loudly', () => {
  const r = parseCodeReport('H43AC1MT', FALLBACK, OPTS)
  assert.equal(r.ok, false)
  assert.equal(r.entry, null)
  assert.match(r.errors.join(' '), /Missing the tail/)
})

test('tel and ISSI are optional together — a bare numeric technician ID still decodes', () => {
  const r = parseCodeReport('H43AC1MT1', FALLBACK, OPTS)
  assert.equal(r.ok, true, r.errors.join('; '))
  assert.equal(r.telNumber, '')
  assert.equal(r.issiNumber, '')
  assert.equal(r.entry.technician, 'AMIR')
})

test('tel and ISSI are optional together — a letter-initials technician ID decodes the same way', () => {
  const map = { ...FALLBACK, technicians: { ...FALLBACK.technicians, MA: 'Muhammad Amir' } }
  // Technicians list left empty so matchOption() can't fuzzy-match "Muhammad
  // Amir" onto an unrelated "AMIR" already in OPTS — this test is about the
  // tail grammar accepting letters, not the name-matching heuristic.
  const r = parseCodeReport('H43AC1MT MA', map, { ...OPTS, technicians: [] })
  assert.equal(r.ok, true, r.errors.join('; '))
  assert.equal(r.telNumber, '')
  assert.equal(r.issiNumber, '')
  assert.equal(r.entry.technician, 'MUHAMMAD AMIR')
})

test('a stray, too-short digit run for tel/issi is read as a (probably unknown) technician ID, not silently split', () => {
  // There is no way to tell "5 stray digits meant to be a truncated tel+issi"
  // from "a genuinely 5-digit technician ID" apart — both are the same shape.
  // It must not silently misread as a partial tel/issi; it warns instead.
  const r = parseCodeReport('H43AC1MT 22 65 1', FALLBACK, OPTS)
  assert.equal(r.ok, true, r.errors.join('; '))
  assert.equal(r.telNumber, '')
  assert.equal(r.issiNumber, '')
  assert.equal(r.entry.technician, '')
  assert.match(r.warnings.join(' '), /No technician with ID 22651/)
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

// ---------------------------------------------------------------------------
// Shorthand: the device letter after the first code, and the one-letter company
// ---------------------------------------------------------------------------

const dec = (text, opts = OPTS) => parseCodeReport(text, FALLBACK, opts)

test('the device letter may be dropped from the second code onward', () => {
  const full = dec('H11AC1MT H11AC1MI 2221 6666 1')
  const short = dec('H11AC1MT 11AC1MI 2221 6666 1')
  assert.ok(short.ok, short.errors.join('; '))
  // Not merely "it parses" — it must produce the SAME report as writing it out.
  assert.deepEqual(short.faults, full.faults)
  assert.deepEqual(short.entry, full.entry)
})

test('the inherited device carries down a whole chain of codes', () => {
  const r = dec('H43AC1MT 11AC2MI 41ARMT 2221 6666 1')
  assert.ok(r.ok, r.errors.join('; '))
  assert.deepEqual(r.faults.map((f) => f.code), ['H43A', 'H11A', 'H41A'])
})

test('the first code must still name the device', () => {
  const r = dec('11AC1MI 2221 6666 1')
  assert.equal(r.ok, false)
  // The near-miss message, not the generic "no fault code found".
  assert.match(r.errors[0], /first code must start with the device letter/)
})

test('a company may be written with one letter — I is MOI, T is MOTECO', () => {
  const full = dec('H11AC1MT H11AC2MI 2221 6666 1')
  const short = dec('H11AC1T 11AC2I 2221 6666 1')
  assert.ok(short.ok, short.errors.join('; '))
  assert.deepEqual(short.faults, full.faults)
  // The shorthand is canonicalised, so what is stored never depends on how it
  // was typed.
  assert.deepEqual(short.faults.map((f) => f.companyCode), ['MT', 'MI'])
})

test('a one-letter company does not swallow the next code’s device letter', () => {
  // Separators are stripped before scanning, so "H11AC1T" + "H43AC1MT" runs
  // together as "...C1TH43A..." and the greedy company match grabs "TH".
  const r = dec('H11AC1T H43AC1MT 2221 6666 1')
  assert.ok(r.ok, r.errors.join('; '))
  assert.deepEqual(r.faults.map((f) => f.code), ['H11A', 'H43A'])
  assert.deepEqual(r.faults.map((f) => f.companyCode), ['MT', 'MT'])
})

test('quantity stays optional in every shorthand combination', () => {
  for (const text of [
    'H11ACMT 11ACMI 2221 6666 1',
    'H11ACT 11ACI 2221 6666 1',
    'H11AC1MT 11ACI 2221 6666 1',
  ]) {
    const r = dec(text)
    assert.ok(r.ok, `${text}: ${r.errors.join('; ')}`)
    assert.deepEqual(r.faults.map((f) => f.quantity), [1, 1], text)
  }
})

// The WhatsApp decoder is a separate implementation of this same grammar — it
// cannot import this module, which pulls in React. It has no imports of its own,
// so this direction works, and pins the two together: a change to one grammar
// that is not made to the other fails here rather than in the field, where the
// app and the bot would quietly read the same code two different ways.
test('the WhatsApp decoder reads the shorthand identically', async () => {
  const { decodeBatch, resolveCompany } = await import('../../server/src/whatsapp/decoder.js')

  const map = {
    ...FALLBACK,
    faults: {},
    technicians: { 1: 'Amir' },
  }

  for (const [code, expected] of [
    ['MT', 'MT'],
    ['MI', 'MI'],
    ['T', 'MT'],
    ['I', 'MI'],
    ['M', null],
    ['ZZ', null],
  ]) {
    const mine = resolveCompany(code, FALLBACK.companies)
    assert.equal(mine?.code ?? null, expected, `server resolveCompany("${code}")`)
    const theirs = (await import('./codes.js')).resolveCompany(code, FALLBACK.companies)
    assert.equal(theirs?.code ?? null, expected, `client resolveCompany("${code}")`)
  }

  // Same message, both decoders, same parts / quantities / companies.
  const text = 'H11AC1MT 11AC2I 41ARMT'
  const bot = decodeBatch(`${text} 1`, map)
  assert.ok(bot.ok, bot.reason)
  const botFaults = bot.batch.groups.flatMap((g) => g.faults)

  const app = parseCodeReport(`${text} 2221 6666 1`, FALLBACK, OPTS)
  assert.ok(app.ok, app.errors.join('; '))

  assert.deepEqual(
    botFaults.map((f) => [f.componentCode, f.quantity, f.companyCode]),
    app.faults.map((f) => [f.code, f.quantity, f.companyCode]),
  )
})
