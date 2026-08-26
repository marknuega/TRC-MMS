import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  classify,
  entryCounts,
  entryQty,
  foldMaintenance,
  technicianTotals,
  agencyBlocks,
  activityTotals,
  buildSparePartsReport,
  agencyComment,
  buildDateReport,
  buildTxt,
  deviceBlocksByType,
  entriesByModel,
  materialBlocksByType,
  setIssueClaims,
  isCountable,
  periodEntries,
  buildMonthlyMatrix,
  buildDayMatrix,
  buildYearMatrix,
  dashboardSummary,
  monthlyTrend,
  shortDocId,
  shortIdOf,
  blockNumber,
  parseBlockNumber,
  branchCode,
  seriesOf,
  docIdMatches,
  displayNumber,
  setModelNames,
} from './report.js'
import { DEFAULT_OPTIONS } from './options.js'

// RTO (Return to Owner) = the device went back untouched. It is not maintenance
// work and consumes no part, so it must stay out of every service total.
describe('classify', () => {
  test('RTO is its own category, not maintenance', () => {
    assert.equal(classify('RTO'), 'rto')
  })

  test('matches regardless of case and padding', () => {
    assert.equal(classify(' rto '), 'rto')
  })

  // A defective PCB handed back is the parts code 50F plus the RTO action —
  // the part carries the "PCB" half, so there is no PCB-specific RTO action.
  test('a defective-PCB return classifies on its action, not its part', () => {
    assert.equal(classify('RTO'), 'rto')
    assert.equal(classify('PCB'), 'maintenance') // PCB the action is real work
  })

  test('the real service actions are unchanged', () => {
    assert.equal(classify('CHANGE'), 'maintenance')
    assert.equal(classify('REPAIR'), 'maintenance')
    assert.equal(classify('PCB'), 'maintenance')
    assert.equal(classify('PROGRAM'), 'programming')
    assert.equal(classify('RE-INSTALL'), 'install')
    assert.equal(classify('DISMANTLE'), 'dismantle')
  })

  test('an unknown action still falls back to maintenance', () => {
    assert.equal(classify('SOMETHING ELSE'), 'maintenance')
  })
})

const entry = (faults, extra = {}) => ({
  technician: 'AMIR',
  agency: 'PSD',
  type: 'AIRBUS',
  model: 'TH1N',
  ...extra,
  faults,
})
const rtoOnly = entry([{ issue: 'SIDE GRIP', quantity: 3, action: 'RTO', company: 'MOTECO' }])
const realWork = entry([{ issue: 'ANTENNA', quantity: 2, action: 'CHANGE', company: 'MOTECO' }])

describe('RTO stays out of the service totals', () => {
  test('entryCounts reports zero across every category', () => {
    assert.deepEqual(entryCounts(rtoOnly), {
      maintenance: 0,
      programming: 0,
      install: 0,
      dismantle: 0,
    })
  })

  test('entryCounts does not grow a stray category key for RTO', () => {
    assert.deepEqual(Object.keys(entryCounts(rtoOnly)).sort(), ['dismantle', 'install', 'maintenance', 'programming'])
  })

  test('an RTO fault does not inflate a real maintenance count on the same entry', () => {
    const mixed = entry([
      { issue: 'ANTENNA', quantity: 2, action: 'CHANGE', company: 'MOTECO' },
      { issue: 'SIDE GRIP', quantity: 9, action: 'RTO', company: 'MOTECO' },
    ])
    assert.equal(entryCounts(mixed).maintenance, 2)
  })

  test('technicianTotals counts no maintenance and no parts for an RTO', () => {
    const [row] = technicianTotals([rtoOnly])
    assert.equal(row.maintenance, 0)
    assert.equal(row.parts, 0)
    assert.equal(row.devices, 1) // the device was still handled
  })

  test('agencyBlocks omits an agency whose only activity was an RTO', () => {
    assert.deepEqual(agencyBlocks([rtoOnly]), [])
  })

  test('activityTotals ignores RTO but still counts real work', () => {
    const rto = activityTotals([rtoOnly])
    const real = activityTotals([realWork])
    assert.equal(
      rto.reduce((n, r) => n + r.maintenance + r.program + r.install + r.dismantle, 0),
      0,
    )
    assert.ok(real.reduce((n, r) => n + r.maintenance, 0) > 0)
  })

  test('an RTO line is not reported as a consumed spare part', () => {
    assert.equal(buildSparePartsReport([rtoOnly]).grandParts, 0)
    assert.deepEqual(buildSparePartsReport([rtoOnly]).parts, {})
    // …while a real CHANGE on the same shape still is.
    assert.equal(buildSparePartsReport([realWork]).grandParts, 2)
  })
})

// A charger / power supply unit is counted on its own, on TOP of the single
// device the entry's other maintenance faults represent. The rule was already
// here; what was broken was recognising the item — the names carry the model
// joined onto the word (CHARGER12), which the old closing \b never matched.
describe('chargers and power supplies count on top of the entry max', () => {
  const DIVIDER = '------------------------------' // 30 dashes, as buildTxt writes them
  const change = (issue, quantity) => ({
    issue,
    quantity,
    action: 'CHANGE',
    company: 'MOTECO',
  })

  test('an entry whose only fault is a charger counts once', () => {
    assert.equal(entryCounts(entry([change('CHARGER12', 1)])).maintenance, 1)
  })

  test('a charger alongside another part counts as two, not the max', () => {
    assert.equal(entryCounts(entry([change('CHARGER12', 1), change('ANTENNA', 1)])).maintenance, 2)
  })

  test('an entry with no charger still counts once however many faults it has', () => {
    assert.equal(entryCounts(entry([change('ANTENNA', 1), change('BCOVER', 1)])).maintenance, 1)
  })

  test('entry quantity collapses multiple ordinary maintenance parts to one', () => {
    assert.equal(entryQty(entry([change('BELT CLIP', 1), change('ANTENNA', 1), change('SIDEGRIP', 1)])), 1)
  })

  test('entry quantity keeps charger units as additional devices', () => {
    assert.equal(entryQty(entry([change('CHARGER12', 1), change('LCD', 1), change('BATTERY 3180', 1)])), 2)
  })

  // The store names these several ways; all of them are the same rule.
  test('the model number may be joined on, spaced, or absent', () => {
    for (const name of ['CHARGER', 'CHARGER12', 'CHARGER818', 'CHARGERDC', 'CHARGER 818', 'CHARGER DEY']) {
      assert.equal(entryCounts(entry([change(name, 1), change('ANTENNA', 1)])).maintenance, 2, name)
    }
  })

  test('power supplies follow the same rule', () => {
    for (const name of ['POWER SUPPLY', 'POWERSUPPLY12', 'POWER SUPPLY - PSE65-12']) {
      assert.equal(entryCounts(entry([change(name, 1), change('ANTENNA', 1)])).maintenance, 2, name)
    }
  })

  // A charging pin was never a charger (it was part 97, since retired from the
  // listings), and the name pattern must keep telling the two apart.
  test('a charging pin is an ordinary part, not a standalone item', () => {
    assert.equal(entryCounts(entry([change('CHARGING PIN', 1), change('ANTENNA', 1)])).maintenance, 1)
  })

  test('each unit counts, so quantity carries', () => {
    assert.equal(entryCounts(entry([change('CHARGER12', 10), change('ANTENNA', 1)])).maintenance, 11)
  })

  test('multiple non-charger faults count as one device', () => {
    assert.equal(
      entryCounts(
        entry([
          change('ACOVER', 1),
          change('BCOVER', 1),
          change('UIFRAME', 1),
          {
            issue: 'BUTTONPTT',
            quantity: 1,
            action: 'REPAIR',
            company: 'MOTECO',
          },
        ]),
      ).maintenance,
      1,
    )
  })

  test('a charger adds one to the non-charger device count', () => {
    assert.equal(
      entryCounts(entry([change('CHARGER12', 1), change('LCD', 1), change('BATTERY 3180', 1)])).maintenance,
      2,
    )
  })

  // Makkah MAKKAH-REP-0017, 09/08/2026 — three chargers across the day, one of
  // them on an entry that also had an antenna changed. That entry is the one
  // worth 2, which is why the day totals 5.
  const makkah = [
    entry([change('CHARGER12', 1)]),
    entry([change('CHARGER12', 1)]),
    entry([change('CHARGER12', 1), change('ANTENNA', 1)]),
    entry([change('BCOVER', 1)]),
  ]

  test('the device summary totals 5', () => {
    const [block] = deviceBlocksByType(makkah).AIRBUS
    assert.equal(block.header, 'AIRBUS (TH1N)')
    assert.deepEqual(block.cats, [['MAINTENANCE', 5]])
    assert.equal(block.total, 5)
  })

  test('the agency summary agrees with it', () => {
    assert.equal(agencyComment(makkah), ['Agency Summary', DIVIDER, 'MAIN: [PSD = 5]'].join('\n'))
  })

  test('the exported report reads exactly as it should', () => {
    const report = buildDateReport('09/08/2026', 'MAKKAH-REP-0017', makkah, {
      branch: 'Makkah',
    })
    assert.equal(
      buildTxt(report),
      [
        '09/08/2026',
        'DAILY ACTIVITY REPORT',
        'BRANCH: Makkah',
        'REPORT ID: MAKKAH-REP-0017',
        DIVIDER,
        'Entry & Materials Summary',
        DIVIDER,
        'AIRBUS (TH1N)',
        '1. ANTENNA (MOT) = 1',
        '2. BCOVER (MOT) = 1',
        '3. CHARGER12 (MOT) = 3',
        DIVIDER,
        'Device Summary',
        DIVIDER,
        'AIRBUS (TH1N)',
        '1. MAINTENANCE = 5',
        '       TOTAL = 5',
        DIVIDER,
        'Agency Summary',
        DIVIDER,
        'MAIN: [PSD = 5]',
      ].join('\n'),
    )
  })
})

// Which items are standalone is the CODE an Issue type claims — 98 Power
// Supply, 99 Charger — not what the item happens to be called. A claim may name
// its part anything, so the name is a guess and the code is not.
describe('the standalone rule reads claimed codes, not names', () => {
  const change = (issue, quantity = 1) => ({
    issue,
    quantity,
    action: 'CHANGE',
    company: 'MOTECO',
  })
  // The item under test, plus one ordinary part: a standalone item counts on
  // top of that part, so 2 means standalone and 1 means it folded into the max.
  const withPart = (name) => entry([change(name), change('ANTENNA')])

  const CLAIMS = [
    { name: 'Charger12', parts: '99', variant: 'A' },
    { name: 'ChargerDC', parts: '99', variant: 'B' },
    { name: 'Power Supply - PSE65-12', parts: '98', variant: 'A' },
    { name: 'DEY-450', parts: '99', variant: 'C' }, // a charger named nothing like one
    { name: 'CHARGER CABLE', parts: '45', variant: 'C' }, // named like one, but is not
    { name: 'ANTENNA', parts: '10', variant: 'A' },
  ]

  // Registration is module-level, so it must not leak into the tests above.
  const claiming = (list, fn) => {
    try {
      setIssueClaims(list)
      fn()
    } finally {
      setIssueClaims([])
    }
  }

  test('99A is the Charger12', () => {
    claiming(CLAIMS, () => assert.equal(entryCounts(withPart('Charger12')).maintenance, 2))
  })

  test('a 99 part counts standalone however it is named', () => {
    claiming(CLAIMS, () => assert.equal(entryCounts(withPart('DEY-450')).maintenance, 2))
  })

  test('98 (power supply) is standalone on the same rule', () => {
    claiming(CLAIMS, () => assert.equal(entryCounts(withPart('Power Supply - PSE65-12')).maintenance, 2))
  })

  test('a part claimed as something else is not, however charger-ish its name', () => {
    claiming(CLAIMS, () => assert.equal(entryCounts(withPart('CHARGER CABLE')).maintenance, 1))
  })

  test('the claim is matched past case and punctuation', () => {
    claiming(CLAIMS, () => assert.equal(entryCounts(withPart('charger 12')).maintenance, 2))
  })

  // Hand-typed issues, and every report saved before codes existed.
  test('a name no claim covers still falls back to the pattern', () => {
    claiming(CLAIMS, () => {
      assert.equal(entryCounts(withPart('CHARGER818')).maintenance, 2)
      assert.equal(entryCounts(withPart('BCOVER')).maintenance, 1)
    })
  })

  test('with nothing registered the pattern alone decides, as it always has', () => {
    setIssueClaims([])
    assert.equal(entryCounts(withPart('CHARGER CABLE')).maintenance, 2) // the name wins again
    assert.equal(entryCounts(withPart('DEY-450')).maintenance, 1)
  })
})

// Two rows naming the same part are two of that part. What makes them the same
// part is the item and its code — not the company, which only records which
// pool the units came out of.
describe('the Materials Summary adds up one line per part', () => {
  const change = (issue, company, quantity = 1) => ({
    issue,
    quantity,
    action: 'CHANGE',
    company,
  })
  // Without the "1. " a Materials line carries: these rules are about which
  // parts land on which line and what each one says, not where it sits in the
  // block. The numbering has a test of its own below.
  const unnumbered = (l) => l.replace(/^\d+\. /, '')
  const lines = (entries) => materialBlocksByType(entries).AIRBUS.flatMap((b) => b.lines.map(unnumbered))

  const CLAIMS = [
    { name: 'Speaker Mid', parts: '45', variant: 'B' },
    { name: 'ANTENNA', parts: '10', variant: 'A' },
    { name: 'Charger12', parts: '99', variant: 'A' },
  ]
  const claiming = (list, fn) => {
    try {
      setIssueClaims(list)
      fn()
    } finally {
      setIssueClaims([])
    }
  }

  test('the same part twice on one entry is summed, not listed twice', () => {
    claiming(CLAIMS, () => {
      const e = entry([change('Speaker Mid', 'MOTECO'), change('Speaker Mid', 'MOTECO')])
      assert.deepEqual(lines([e]), ['SPEAKER MID (MOT) = 2'])
    })
  })

  // The reported case: 45B twice, drawn from two different pools.
  test('different companies do not split the part into two lines', () => {
    claiming(CLAIMS, () => {
      const e = entry([change('Speaker Mid', 'MOTECO'), change('Speaker Mid', 'MOI')])
      assert.deepEqual(lines([e]), ['SPEAKER MID (MOT) = 2'])
    })
  })

  test('the same part across two entries of one model is summed too', () => {
    claiming(CLAIMS, () => {
      const a = entry([change('Speaker Mid', 'MOI')])
      const b = entry([change('Speaker Mid', 'MOTECO', 3)])
      assert.deepEqual(lines([a, b]), ['SPEAKER MID (MOI) = 4'])
    })
  })

  // The code is the identity, so two spellings of one claim are one part.
  test('a second spelling of the same claim lands on the same line', () => {
    claiming(CLAIMS, () => {
      const e = entry([change('Speaker Mid', 'MOTECO'), change('SPEAKER-MID', 'MOTECO')])
      assert.deepEqual(lines([e]), ['SPEAKER MID (MOT) = 2'])
    })
  })

  test('different parts stay on their own lines', () => {
    claiming(CLAIMS, () => {
      const e = entry([change('Speaker Mid', 'MOI'), change('ANTENNA', 'MOI')])
      assert.deepEqual(lines([e]), ['ANTENNA (MOI) = 1', 'SPEAKER MID (MOI) = 1'])
    })
  })

  // Hand-typed items, and every report saved before codes existed: no claim to
  // read, so the name carries the identity and must still merge.
  test('an unclaimed item merges on its name', () => {
    claiming(CLAIMS, () => {
      const e = entry([change('BCOVER', 'MOTECO'), change('BCOVER', 'MOI')])
      assert.deepEqual(lines([e]), ['BCOVER (MOT) = 2'])
    })
  })

  // The name space and the code space are kept apart, so an item someone names
  // after a code cannot be counted as that code's part.
  test('an item named like a code does not land on that code', () => {
    claiming(CLAIMS, () => {
      const e = entry([change('Speaker Mid', 'MOI'), change('45B', 'MOI')])
      assert.deepEqual(lines([e]), ['45B (MOI) = 1', 'SPEAKER MID (MOI) = 1'])
    })
  })

  test('programming still collapses to its one line', () => {
    claiming(CLAIMS, () => {
      const e = entry([
        {
          issue: 'Speaker Mid',
          quantity: 1,
          action: 'PROGRAM',
          company: 'MOI',
        },
        { issue: 'ANTENNA', quantity: 2, action: 'PROGRAM', company: 'MOTECO' },
      ])
      assert.deepEqual(lines([e]), ['PROGRAMMING = 3'])
    })
  })
})

// The Notes block at the foot of the TXT — "MODEL — comment", one line per
// entry that carries a comment.
describe('the notes block names the device, except where there is none', () => {
  const noted = (model, comment) =>
    entry([{ issue: 'ANTENNA', quantity: 1, action: 'CHANGE', company: 'MOTECO' }], { model, comment })
  const txt = (e) =>
    buildTxt(
      buildDateReport('17/08/2026', 'MAKKAH-REP-0021', [e], {
        branch: 'Makkah',
      }),
    )

  test('an ordinary entry prefixes its note with the model', () => {
    assert.match(txt(noted('TH1N', 'Bench test passed.')), /\nTH1N — Bench test passed\.$/)
  })

  // "For Record Purpose Only. — closed for the holiday" reads as a note about a
  // device. The whole point of that entry is that no device was involved.
  test('the no-activity record leaves the placeholder model out', () => {
    assert.match(txt(noted('For Record Purpose Only.', 'Friday, branch closed.')), /\nFriday, branch closed\.$/)
  })

  test('an entry with no model at all does not open with a stray dash', () => {
    assert.match(txt(noted('', 'Collected from stores.')), /\nCollected from stores\.$/)
  })

  test('an entry with no comment contributes no note', () => {
    assert.ok(!txt(noted('TH1N', '')).includes('Notes'))
  })
})

// A reference-only report is kept for the record and counts towards nothing.
// It stays openable and exportable on its own; it just never reaches a total.
describe('reference-only reports stay out of every aggregation', () => {
  const entryOn = (date, issue) => ({
    reportDate: date,
    technician: 'AMIR',
    agency: 'PSD',
    type: 'AIRBUS',
    model: 'TH1N',
    faults: [{ issue, quantity: 1, action: 'CHANGE', company: 'MOTECO' }],
  })
  const report = (extra) => ({
    mode: 'report',
    branch: 'Makkah',
    dateLabel: '16/08/2026',
    entries: [entryOn('2026-08-16', 'ANTENNA')],
    ...extra,
  })
  const normal = report({ reportId: 'REP-0017' })
  const refOnly = report({ reportId: 'REF-0001', isReferenceOnly: true })

  test('isCountable rejects it, and a transmittal, and nothing else', () => {
    assert.equal(isCountable(normal), true)
    assert.equal(isCountable(refOnly), false)
    assert.equal(isCountable({ mode: 'transmittal' }), false)
    assert.equal(isCountable({}), true) // a plain report, no flag set
  })

  test('periodEntries skips it', () => {
    assert.equal(periodEntries([refOnly], '2026-08').length, 0)
    assert.equal(periodEntries([normal], '2026-08').length, 1)
    assert.equal(periodEntries([normal, refOnly], '2026-08').length, 1)
  })

  test('the monthly matrix gives it no count and no description', () => {
    const m = buildMonthlyMatrix([refOnly], {
      year: 2026,
      month: 7,
      branch: 'Makkah',
    })
    const row = m.rows.find((r) => r.day === 16)
    assert.equal(row.counts.th1n, 0)
    assert.equal(row.description, '')
    assert.equal(m.totals.th1n, 0)
  })

  // A day is still a row in the sheet whether or not anything countable
  // happened on it — the matrix has one row per calendar day.
  test('…and the day is still a row, not a hole', () => {
    const m = buildMonthlyMatrix([refOnly], {
      year: 2026,
      month: 7,
      branch: 'Makkah',
    })
    assert.equal(m.rows.length, 31)
    assert.ok(m.rows.find((r) => r.day === 16))
  })

  test('a normal report on the same day still counts in full', () => {
    const m = buildMonthlyMatrix([normal, refOnly], {
      year: 2026,
      month: 7,
      branch: 'Makkah',
    })
    const row = m.rows.find((r) => r.day === 16)
    assert.equal(row.counts.th1n, 1)
    assert.match(row.description, /ANTENNA/)
    assert.equal(m.totals.th1n, 1)
  })

  test('the day and year views inherit it from the monthly matrix', () => {
    const day = buildDayMatrix([refOnly], {
      year: 2026,
      month: 7,
      day: 16,
      branch: 'Makkah',
    })
    assert.equal(day.totals.th1n, 0)
    const year = buildYearMatrix([refOnly], { year: 2026, branch: 'Makkah' })
    assert.equal(year.totals.th1n, 0)
  })

  test('the dashboard and spare-parts totals ignore it', () => {
    const entries = periodEntries([refOnly], '2026-08')
    assert.equal(dashboardSummary(entries).devices, 0)
    assert.equal(dashboardSummary(entries).maintenance, 0)
    assert.equal(buildSparePartsReport(entries).grandParts, 0)
  })

  // monthlyTrend walks the saved list itself to decide which months get a row.
  test('the trend chart does not plot a month that has only a reference-only report', () => {
    assert.deepEqual(monthlyTrend([refOnly], 'Makkah'), [])
    assert.equal(monthlyTrend([normal], 'Makkah').length, 1)
  })

  // Excluded from the roll-ups, not hidden: the report itself still renders.
  test('it still builds its own report text', () => {
    const txt = buildTxt(
      buildDateReport('16/08/2026', 'MAKKAH-REF-0001', refOnly.entries, {
        branch: 'Makkah',
      }),
    )
    assert.match(txt, /REPORT ID: MAKKAH-REF-0001/)
    assert.match(txt, /ANTENNA/)
  })
})

// The id a document is shown by: MAKKAH-REP-0018 reads MAK-REP-A018. Derived
// from branch + series + docNumber, never stored — the long form remains what
// the record is filed under, and stays searchable.
describe('short-form document ids', () => {
  test('the three forms, exactly', () => {
    assert.equal(shortDocId('Makkah', 'REP', 18), 'MAK-REP-A018')
    assert.equal(shortDocId('Makkah', 'REF', 1), 'MAK-RTO-A001')
    assert.equal(shortDocId('Makkah', 'TRANS', 1), 'MAK-TRA-A001')
  })

  test('each series gets its own three letters', () => {
    assert.equal(shortDocId('Taif', 'REP', 7), 'TAI-REP-A007')
    assert.equal(shortDocId('Jeddah', 'TRANS', 7), 'JED-TRA-A007')
    // REF reads RTO — Return To Owner. Deliberate: the two id forms name this
    // series differently, and that is the point, not a slip.
    assert.equal(shortDocId('Jeddah', 'REF', 7), 'JED-RTO-A007')
  })

  test('the letter blocks hold 999 each, and 000 is never emitted', () => {
    assert.equal(blockNumber(1), 'A001')
    assert.equal(blockNumber(18), 'A018')
    assert.equal(blockNumber(999), 'A999')
    assert.equal(blockNumber(1000), 'B001')
    assert.equal(blockNumber(1998), 'B999')
    assert.equal(blockNumber(1999), 'C001')
    for (let n = 1; n <= 3000; n++) assert.doesNotMatch(blockNumber(n), /000$/, `n=${n}`)
  })

  test('every number up to Z999 is distinct', () => {
    const seen = new Set()
    for (let n = 1; n <= 26 * 999; n++) seen.add(blockNumber(n))
    assert.equal(seen.size, 26 * 999)
  })

  // Past Z999 there is no letter left, so it falls back to the plain number —
  // visibly different, and it cannot collide with a lettered form.
  test('past Z999 it degrades to the bare number rather than a stray character', () => {
    assert.equal(blockNumber(26 * 999), 'Z999')
    assert.equal(blockNumber(26 * 999 + 1), '25975')
    assert.doesNotMatch(blockNumber(26 * 999 + 1), /[A-Z]/)
  })

  test('a branch shorter than three letters gives the letters it has', () => {
    assert.equal(shortDocId('Al', 'REP', 1), 'AL-REP-A001')
  })

  // The unassigned/legacy branch drops the segment entirely, the same way
  // repLabel drops the prefix rather than emitting a leading hyphen.
  test('the unassigned branch has no branch segment', () => {
    assert.equal(shortDocId('', 'REP', 18), 'REP-A018')
    assert.equal(shortDocId(undefined, 'REF', 1), 'RTO-A001')
  })

  test('the branch code ignores case and punctuation', () => {
    assert.equal(shortDocId('makkah', 'REP', 1), 'MAK-REP-A001')
    assert.equal(shortDocId('  Makkah  ', 'REP', 1), 'MAK-REP-A001')
  })

  // The short id is a rendering, not a key: two branches sharing a three-letter
  // prefix would share a code. The shipped list must not contain such a pair —
  // if this fails, the new branch needs an entry in BRANCH_SHORT.
  test('no two shipped branches collide on their code', () => {
    const codes = DEFAULT_OPTIONS.branches.map(branchCode)
    assert.equal(new Set(codes).size, codes.length, `collision in ${codes.join(', ')}`)
  })

  // Reading back a number someone typed over the one that was offered.
  describe('parseBlockNumber', () => {
    test('is the exact inverse of blockNumber, at every block edge', () => {
      for (const n of [1, 2, 998, 999, 1000, 1001, 1998, 25974]) {
        assert.equal(parseBlockNumber(blockNumber(n)), n, `round trip ${n}`)
      }
    })

    test('every way someone writes A019 names 19', () => {
      for (const q of ['A019', 'a019', ' A019 ', 'MAK-REP-A019', 'REP-0019', '0019', '19']) {
        assert.equal(parseBlockNumber(q), 19, `"${q}"`)
      }
    })

    test('null for anything that names no number', () => {
      // Never 0: blockNumber would render that A001 — silently the FIRST
      // document — so the caller must be able to tell "unreadable" from a value.
      for (const q of ['', '   ', 'A', 'ABC', 'A0', 'A000', '0', 'A1000', null, undefined]) {
        assert.equal(parseBlockNumber(q), null, `"${q}"`)
      }
    })

    // A dash is a separator, always — that is what lets a whole pasted id be
    // read. So "-4" is the segment "4", not minus four; there is no spelling of
    // a negative document number for it to be confused with.
    test('a dash separates rather than negates', () => {
      assert.equal(parseBlockNumber('-4'), 4)
    })
  })

  // A branch belongs to ONE region. Two would make "this region's branches
  // only" ambiguous — the same branch would be inside two different scopes at
  // once, and the region a plain user is told they are in would depend on which
  // key happened to be found first.
  test('no branch belongs to two regions', () => {
    const seen = new Map() // branch -> the region that claimed it
    for (const [region, branches] of Object.entries(DEFAULT_OPTIONS.regions)) {
      for (const b of branches) {
        assert.equal(seen.get(b), undefined, `${b} is in both ${seen.get(b)} and ${region}`)
        seen.set(b, region)
      }
    }
  })

  // Every branch the app ships with must be reachable when a region is selected,
  // or it would be visible only in the All-regions view — present in the branch
  // list, absent from every region that could plausibly contain it.
  test('every shipped branch belongs to a region', () => {
    const claimed = new Set(Object.values(DEFAULT_OPTIONS.regions).flat())
    for (const b of DEFAULT_OPTIONS.branches) {
      assert.ok(claimed.has(b), `${b} is in no region`)
    }
  })

  test('seriesOf reads rows saved before the series column existed', () => {
    assert.equal(seriesOf({ series: 'REF', mode: 'report' }), 'REF')
    assert.equal(seriesOf({ mode: 'report' }), 'REP')
    assert.equal(seriesOf({ mode: 'transmittal' }), 'TRANS')
    assert.equal(seriesOf({}), 'REP')
  })

  test('the report header carries the short id alone', () => {
    const opts = { branch: 'Makkah' }
    const withShort = buildDateReport('16/08/2026', 'MAKKAH-REP-0018', [], {
      ...opts,
      shortId: 'MAK-REP-A018',
    })
    const txt = buildTxt(withShort)
    assert.match(txt, /REPORT ID: MAK-REP-A018\n/)
    assert.ok(!txt.includes('MAKKAH-REP-0018'), 'the long form is not printed beside it')
  })

  // The All-Branches merge is never saved and so never draws a document number.
  test('a report with no short id still prints the long one', () => {
    const without = buildDateReport('16/08/2026', 'MAKKAH-REP-0018', [], {
      branch: 'Makkah',
    })
    assert.match(buildTxt(without), /REPORT ID: MAKKAH-REP-0018\n/)
  })

  // The short id is what shows, so it must be right for a row whose docNumber
  // has not been assigned yet — an offline save waiting to sync.
  test('shortIdOf reads the number from the long id when docNumber is missing', () => {
    const row = {
      branch: 'Makkah',
      series: 'REP',
      docNumber: 0,
      reportId: 'REP-0018',
    }
    assert.equal(shortIdOf(row), 'MAK-REP-A018')
    assert.equal(shortIdOf({ ...row, docNumber: 18 }), 'MAK-REP-A018')
    assert.equal(
      shortIdOf({
        branch: 'Taif',
        mode: 'transmittal',
        reportId: 'TRANS-0007',
      }),
      'TAI-TRA-A007',
    )
  })
})

// Finding a saved report by the id printed on it. Both renderings are matched,
// in every spelling the id realistically arrives in.
describe('finding a document by its id', () => {
  // The pair the short form abbreviates, plus the two near-misses it must not
  // pull in: 0180 (short A180) and a document numbered 181.
  const ids18 = ['MAKKAH-REP-0018', 'MAK-REP-A018']
  const ids180 = ['MAKKAH-REP-0180', 'MAK-REP-A180']
  const ids181 = ['MAKKAH-REF-0181', 'MAK-RTO-A181']

  test('every way someone writes MAKKAH-REP-0018 finds it', () => {
    for (const q of [
      'A018',
      'a018',
      'MAK-REP-A018',
      'mak-rep-a018',
      'makrepa018',
      'mak rep a018',
      'MAK_REP_A018',
      '  A018  ',
      '0018',
      'REP-0018',
      'rep 0018',
      'MAKKAH-REP-0018',
      'makkah-rep-0018',
      'makkahrep0018',
    ]) {
      assert.equal(docIdMatches(q, ids18), true, `"${q}" should find MAKKAH-REP-0018`)
    }
  })

  // The whole reason a fragment anchors at the END of a segment run rather than
  // matching anywhere: a flattened id contains A018 in all three of these.
  test('a fragment does not drag in a neighbouring number', () => {
    assert.equal(docIdMatches('A018', ids180), false)
    assert.equal(docIdMatches('REP-0018', ids180), false)
    assert.equal(docIdMatches('A018', ids181), false)
    assert.equal(docIdMatches('A0181', ids18), false)
    // Nor may it start mid-segment.
    assert.equal(docIdMatches('018', ids18), false)
    assert.equal(docIdMatches('EP-A018', ids18), false)
    assert.equal(docIdMatches('MAKKAH', ids18), false)
  })

  test('each series answers to its own short form', () => {
    assert.equal(docIdMatches('RTO-A001', ['MAKKAH-REP-0001', 'MAK-RTO-A001']), true)
    assert.equal(docIdMatches('TRA-A001', ['MAKKAH-TRANS-0001', 'MAK-TRA-A001']), true)
    // …and not to another's. A REP and a REF may share a document number.
    assert.equal(docIdMatches('RTO-A001', ['MAKKAH-REP-0001', 'MAK-REP-A001']), false)
  })

  // A query is an id query because it MATCHES an id, not because it looks like
  // one — so a genuine item search can never be mistaken for an id.
  test('an ordinary item search matches no document', () => {
    for (const q of ['A COVER', 'ANTENNA', 'CHARGER12', 'AMIR', 'MOTECO']) {
      assert.equal(docIdMatches(q, ids18), false, `"${q}" is an item search, not an id`)
    }
  })

  test('an empty query matches nothing', () => {
    assert.equal(docIdMatches('', ids18), false)
    assert.equal(docIdMatches('   ', ids18), false)
    assert.equal(docIdMatches('-', ids18), false)
    assert.equal(docIdMatches('A018', []), false)
  })

  // The unassigned/legacy branch has no branch segment at all (see shortDocId).
  test('a document with no branch segment is still findable', () => {
    assert.equal(docIdMatches('A018', ['REP-0018', 'REP-A018']), true)
    assert.equal(docIdMatches('REP-A018', ['REP-0018', 'REP-A018']), true)
  })

  // The match is a question about the DOCUMENT's id and nothing else. That is
  // what makes a snapshot with no fault lines on it findable at all: the old
  // search only ever reached an id by walking down to a fault line, so a report
  // with none could not be found by the id printed at the top of it.
  test('nothing about the report but its id takes part', () => {
    const ids = (r) => [shortDocId(r.branch, seriesOf(r), r.docNumber)]
    const noFaults = {
      branch: 'Makkah',
      series: 'REP',
      docNumber: 19,
      mode: 'report',
      entries: [],
    }
    assert.equal(docIdMatches('A019', ids(noFaults)), true)
  })
})

// The record stores what was typed; each export decides how much of it to show.
describe('Tel / ISSI display', () => {
  test('complete prints the number as stored', () => {
    assert.equal(displayNumber('0501234567', 'full'), '0501234567')
    assert.equal(displayNumber('0501234567'), '0501234567') // 'full' is the default
  })

  test('masked prints exactly the last 4, house style', () => {
    assert.equal(displayNumber('0501234567', 'masked'), '***4567')
    assert.equal(displayNumber('12346575', 'masked'), '***6575')
    // Three asterisks whatever the length — the length of a number is itself
    // not something an export needs to publish.
    assert.equal(displayNumber('96650123456789', 'masked'), '***6789')
  })

  // Reports saved before full numbers existed hold 4 digits, all of which ARE
  // the last 4. Asterisks would claim a hidden prefix that was never recorded.
  test('a legacy 4-digit value renders sensibly in both modes', () => {
    assert.equal(displayNumber('2221', 'full'), '2221')
    assert.equal(displayNumber('2221', 'masked'), '2221')
  })

  // A CDS short code carries exactly tel(4) issi(4) — that contract is
  // unchanged, so a code-decoded entry is simply a 4-digit legacy value.
  test('a code-decoded entry behaves like any other 4-digit value', () => {
    assert.equal(displayNumber('6575', 'masked'), '6575')
  })

  test('a blank number and its stored placeholders render as they always did', () => {
    for (const mode of ['full', 'masked']) {
      assert.equal(displayNumber('', mode), '')
      assert.equal(displayNumber(null, mode), '')
      assert.equal(displayNumber(undefined, mode), '')
      assert.equal(displayNumber('-', mode), '-') // the stored "no tel"
      assert.equal(displayNumber('*', mode), '*') // the stored "no ISSI"
    }
  })

  test('the mode rides on the report model, defaulting to complete', () => {
    const opts = { branch: 'Makkah' }
    assert.equal(buildDateReport('16/08/2026', 'MAKKAH-REP-0018', [], opts).numberMode, 'full')
    assert.equal(
      buildDateReport('16/08/2026', 'MAKKAH-REP-0018', [], {
        ...opts,
        numberMode: 'masked',
      }).numberMode,
      'masked',
    )
  })

  // The TXT — which is also the WhatsApp daily text (server/src/dailyText.js) —
  // is a summary format and carries no per-entry number at all. So it cannot
  // disagree with the print sheet about how much of one to show: it shows none,
  // in either mode. If a per-entry line is ever added, this test fails and the
  // line must go through displayNumber.
  test('the TXT export publishes no Tel / ISSI in either mode', () => {
    const entries = [
      {
        id: 1,
        reportDate: '2026-08-16',
        technician: 'AMIR',
        agency: 'PSD',
        telNumber: '0501234567',
        issiNumber: '12346575',
        type: 'AIRBUS',
        model: 'TH1N',
        comment: '',
        faults: [
          {
            issue: 'ANTENNA',
            quantity: 1,
            action: 'CHANGE',
            company: 'MOTECO',
            status: 'New',
          },
        ],
      },
    ]
    for (const numberMode of ['full', 'masked']) {
      const txt = buildTxt(
        buildDateReport('16/08/2026', 'MAKKAH-REP-0018', entries, {
          branch: 'Makkah',
          numberMode,
        }),
      )
      assert.doesNotMatch(txt, /0501234567|12346575/, numberMode)
      assert.doesNotMatch(txt, /\*\*\*\d{4}/, numberMode)
      assert.match(txt, /ANTENNA/) // …but the report itself is unaffected
    }
  })
})

// ---------------------------------------------------------------------------
// MAK-REP-A011 (Makkah, 16/08/2026) — the day these rules were pinned to. Two
// entries: a TH1N whose PCB was changed and which was then programmed, and a
// Sepura car kit that took three parts and an installation.
//
// One fixture rather than five, because the rules constrain each other:
// splitting INSTALLATION out of MAINTENANCE must not move the block total, and
// giving the PCB line its action code must not move the line.
// ---------------------------------------------------------------------------
describe('a PCB, a programming and an installation on one day', () => {
  const DIVIDER = '------------------------------' // 30 dashes, as buildTxt writes them
  // A service action carries no company — the app clears it (see SERVICE_ACTIONS).
  const th1n = () => ({
    technician: 'AMIR',
    agency: 'PRI',
    type: 'AIRBUS',
    model: 'TH1N',
    faults: [
      { issue: 'PCB', quantity: 1, action: 'CHANGE', company: 'MOI' },
      { issue: 'PROGRAMMING', quantity: 1, action: 'PROGRAM', company: '' },
    ],
  })
  const carkit = () => ({
    technician: 'AMIR',
    agency: 'PSD',
    type: 'SEPURA',
    model: 'SRG3900 CARKIT',
    faults: [
      { issue: 'FISTMIC', quantity: 2, action: 'CHANGE', company: 'MOTECO' },
      { issue: 'FUSE COVER', quantity: 2, action: 'CHANGE', company: 'MOTECO' },
      { issue: 'FUSE10', quantity: 2, action: 'CHANGE', company: 'MOTECO' },
      { issue: 'INSTALLATION', quantity: 2, action: 'INSTALL', company: '' },
    ],
  })
  const a011 = () => [th1n(), carkit()]
  const report = (entries) =>
    buildDateReport('16/08/2026', 'MAKKAH-REP-0011', entries, {
      branch: 'Makkah',
      shortId: 'MAK-REP-A011',
    })
  const unnumbered = (l) => l.replace(/^\d+\. /, '')
  const materialLines = (entries, type) => materialBlocksByType(entries)[type].flatMap((b) => b.lines.map(unnumbered))
  // agencyBlocks keeps Installation and Dismantle broken out for the monthly
  // sheet; the daily Agency Summary folds them into MAINTENANCE. These rules are
  // about the daily report, so they read the folded tally it actually prints.
  const agencyOf = (entries, name) => {
    const b = agencyBlocks(entries).find((x) => x.agency === name)
    return b && { ...b, cats: foldMaintenance(b.cats) }
  }

  // -- Rule 1: PCB carries its action code in the Entry & Materials Summary --
  //
  // PCB is the one item name that is also an action name, so a bare "PCB" line
  // does not say which of the two it is.
  describe('the PCB line says which PCB it means', () => {
    const did = (issue, action, company = 'MOI', quantity = 1) => ({
      issue,
      quantity,
      action,
      company,
    })
    const one = (faults) => materialLines([{ agency: 'PRI', type: 'AIRBUS', model: 'TH1N', faults }], 'AIRBUS')

    test('the changed board reads PCB (C), not a bare PCB', () => {
      assert.deepEqual(one([did('PCB', 'CHANGE')]), ['PCB (C) (MOI) = 1'])
    })

    test('the code is the action that was performed, whichever it was', () => {
      for (const [action, code] of [
        ['CHANGE', 'C'],
        ['REPAIR', 'R'],
        ['NEW', 'N'],
        ['PCB', 'PCB'],
      ]) {
        assert.deepEqual(one([did('PCB', action)]), [`PCB (${code}) (MOI) = 1`], action)
      }
    })

    // FISTMIC, FUSE COVER and FUSE10 name no action, so nothing about them is
    // ambiguous and they print exactly as they always have.
    test('no other part gets a code', () => {
      assert.deepEqual(materialLines(a011(), 'SEPURA'), [
        'FISTMIC (MOT) = 2',
        'FUSE COVER (MOT) = 2',
        'FUSE10 (MOT) = 2',
        'INSTALLATION = 2',
      ])
    })

    // The code is a rendering hung off the end of the line, so it must not
    // reach the sort: the line sits where PCB sorts, not where "PCB (C)" would.
    test('the line still sorts under its own name', () => {
      const lines = one([
        did('SPEAKER MID', 'CHANGE'),
        did('PCB BASE', 'CHANGE'),
        did('PCB', 'CHANGE'),
        did('ANTENNA', 'CHANGE'),
      ])
      assert.deepEqual(lines, ['ANTENNA (MOI) = 1', 'PCB (C) (MOI) = 1', 'PCB BASE (MOI) = 1', 'SPEAKER MID (MOI) = 1'])
    })

    // The aggregation key is still materialKey() — the part, not the part and
    // its code. Two boards changed is two boards on one line, and the code is
    // read off the first fault seen, exactly as the company already is.
    test('the code does not split the part into two lines', () => {
      assert.deepEqual(one([did('PCB', 'CHANGE', 'MOI'), did('PCB', 'REPAIR', 'MOTECO')]), ['PCB (C) (MOI) = 2'])
    })

    // A custom action has no entry in the code table, so it prints its own name
    // rather than an empty pair of brackets — the fallback issueActionCell
    // already makes. An item that is not an action name is not ambiguous in the
    // first place, so it still gets nothing.
    test('an action outside the code table prints itself, an ordinary part nothing', () => {
      assert.deepEqual(one([did('RTO', 'RTO')]), ['RTO (RTO) (MOI) = 1'])
      assert.deepEqual(one([did('ANTENNA', 'SOMETHING CUSTOM')]), ['ANTENNA (MOI) = 1'])
    })
  })

  // -- Rule 2: an install and the parts fitted with it are both counted --
  //
  // Mounting a car kit and changing parts while doing it is an installation AND
  // a repair: two things happened to that device. The entry counts once under
  // each, the same way an entry carrying a programming and a PCB always has.
  describe('an install and its parts each count once', () => {
    test('the parts still reach maintenanceCount', () => {
      // The three parts count as one repair, taking their max quantity of 2,
      // and the installation's own 2 counts beside it rather than instead.
      assert.deepEqual(entryCounts(carkit()), {
        maintenance: 2,
        programming: 0,
        install: 2,
        dismantle: 0,
      })
    })

    // Two lines describing two different jobs, and a TOTAL that is their sum —
    // the install is no longer counted a second time inside MAINTENANCE.
    test('the Device Summary shows the repair and the install separately', () => {
      const [block] = deviceBlocksByType(a011()).SEPURA
      assert.equal(block.header, 'SEPURA (CARKIT)')
      assert.deepEqual(block.cats, [
        ['MAINTENANCE', 2],
        ['INSTALLATION', 2],
      ])
      assert.equal(block.total, 4)
    })

    // The roll-up accounts for the same work, in one cell rather than two:
    // the block's 2 parts and 2 install become PSD's single MAIN of 4.
    test('the Agency Summary counts the same work', () => {
      assert.deepEqual(agencyOf(a011(), 'PSD').cats, [['MAINTENANCE', 4]])
      assert.equal(agencyOf(a011(), 'PSD').total, 4)
    })

    // Programming was always counted this way; installation now matches it.
    test('programming is counted beside maintenance in just the same way', () => {
      assert.deepEqual(entryCounts(th1n()), {
        maintenance: 1,
        programming: 1,
        install: 0,
        dismantle: 0,
      })
      assert.deepEqual(deviceBlocksByType(a011()).AIRBUS[0].cats, [
        ['MAINTENANCE', 1],
        ['PROGRAMMING', 1],
      ])
    })
  })

  // -- Rule 3: an action line belongs to the device it was performed on --
  describe('an action line belongs to the entry that recorded it', () => {
    test('the programming prints under the TH1N and under no other device', () => {
      assert.ok(materialLines(a011(), 'AIRBUS').includes('PROGRAMMING = 1'))
      assert.ok(!materialLines(a011(), 'SEPURA').some((l) => l.startsWith('PROGRAMMING')))
      const labels = (type) => deviceBlocksByType(a011())[type][0].cats.map(([l]) => l)
      assert.ok(labels('AIRBUS').includes('PROGRAMMING'))
      assert.ok(!labels('SEPURA').includes('PROGRAMMING'))
    })

    test('the installation prints under the car kit and under no other device', () => {
      assert.ok(materialLines(a011(), 'SEPURA').includes('INSTALLATION = 2'))
      assert.ok(!materialLines(a011(), 'AIRBUS').some((l) => l.startsWith('INSTALLATION')))
      // The car kit's install is a line of its own on the car kit's block, so
      // what the TH1N must not pick up is an INSTALLATION line: its own
      // maintenance is the 1 PCB it really had.
      assert.deepEqual(deviceBlocksByType(a011()).AIRBUS[0].cats, [
        ['MAINTENANCE', 1],
        ['PROGRAMMING', 1],
      ])
    })

    test('each lands on the agency of the entry that recorded it', () => {
      assert.deepEqual(agencyOf(a011(), 'PRI').cats, [
        ['MAINTENANCE', 1],
        ['PROGRAMMING', 1],
      ])
      assert.ok(!agencyOf(a011(), 'PSD').cats.some(([l]) => l === 'PROGRAMMING'))
      // PRI's maintenance is its own 1 PCB — the car kit's install went to PSD.
      assert.equal(agencyOf(a011(), 'PRI').cats.find(([l]) => l === 'MAINTENANCE')[1], 1)
    })
  })

  // -- Rule 4: the Agency Summary agrees with the Device Summary --
  describe('the Agency Summary agrees with the Device Summary', () => {
    // The two answer different questions, so they do not print the same
    // numbers — but they must account for the same work. The agency's MAIN is
    // its device block's MAINTENANCE, INSTALLATION and DISMANTLE added up, and
    // every other category matches line for line.
    test('each agency accounts for the work its device block accounts for', () => {
      const devices = deviceBlocksByType(a011())
      const folded = (cats) => foldMaintenance(cats)
      assert.deepEqual(agencyOf(a011(), 'PRI').cats, folded(devices.AIRBUS[0].cats))
      assert.deepEqual(agencyOf(a011(), 'PSD').cats, folded(devices.SEPURA[0].cats))
      // The car kit's block reads 2 + 2 across two lines; PSD's one MAIN cell
      // carries the same 4.
      assert.equal(agencyOf(a011(), 'PSD').cats.find(([l]) => l === 'MAINTENANCE')[1], 4)
      assert.equal(devices.SEPURA[0].total, 4)
    })

    test('the install lands inside MAIN rather than on a line of its own', () => {
      // PSD leads on 4 (2 parts + 2 install) against PRI's 2, so it is named
      // first. The roll-up has only the two rows there can be.
      assert.equal(
        agencyComment(a011()),
        ['Agency Summary', DIVIDER, 'MAIN: [PSD = 4] [PRI = 1]', 'PROG: [PRI = 1]'].join('\n'),
      )
      // Programming is NOT folded the same way: PRI keeps a PROG cell of its
      // own rather than arriving on the MAIN line as a 2.
      assert.ok(!agencyComment(a011()).includes('MAIN: [PRI = 2]'))
      assert.ok(!agencyComment(a011()).includes('INST:'))
    })

    test('an agency with nothing in a category is left off that line', () => {
      // PSD did no programming, so the PROG line names PRI and stops — and the
      // block ends there, with no TOTAL line under it.
      assert.equal(agencyComment(a011()).split('\n').at(-1), 'PROG: [PRI = 1]')
      assert.ok(!agencyComment(a011()).includes('= 0]'))
    })
  })

  // -- Rule 5: Materials Summary numbering --
  //
  // Every block counts its own materials from 1. The number answers "how many
  // parts did this device take", so it has to restart per device — and the
  // blocks print side by side in their own columns, where a sequence running
  // on from the column to its left reads as a mistake.
  describe('Materials Summary numbering', () => {
    test('each block numbers its own lines from 1', () => {
      const blocks = materialBlocksByType(a011())
      assert.deepEqual(blocks.AIRBUS[0].lines, ['1. PCB (C) (MOI) = 1', '2. PROGRAMMING = 1'])
      assert.deepEqual(blocks.SEPURA[0].lines, [
        '1. FISTMIC (MOT) = 2',
        '2. FUSE COVER (MOT) = 2',
        '3. FUSE10 (MOT) = 2',
        '4. INSTALLATION = 2',
      ])
    })

    // The Device Summary's TXT numbers straight on across its blocks; the
    // Materials Summary does not, and that difference is deliberate.
    test('the second block restarts rather than continuing the first', () => {
      const blocks = materialBlocksByType(a011())
      assert.ok(blocks.AIRBUS[0].lines.length > 0)
      assert.match(blocks.SEPURA[0].lines[0], /^1\. /)
    })
  })

  // -- Rule 6: Device Summary numbering --
  describe('Device Summary numbering', () => {
    const deviceSection = (entries) =>
      buildTxt(report(entries)).split(`\n${DIVIDER}\nAgency Summary`)[0].split(`Device Summary\n${DIVIDER}\n`)[1]

    test('line numbers run on across every block rather than restarting', () => {
      assert.equal(
        deviceSection(a011()),
        [
          'AIRBUS (TH1N)',
          '1. MAINTENANCE = 1',
          '2. PROGRAMMING = 1',
          '       TOTAL = 2',
          DIVIDER,
          'SEPURA (CARKIT)',
          '3. MAINTENANCE = 2',
          '4. INSTALLATION = 2',
          '       TOTAL = 4',
        ].join('\n'),
      )
    })

    test('TOTAL is per block, indented seven spaces, and sums that block', () => {
      const totals = deviceSection(a011())
        .split('\n')
        .filter((l) => l.includes('TOTAL'))
      assert.equal(totals.length, 2) // one per block, not one for the report
      for (const line of totals) assert.match(line, /^ {7}TOTAL = \d+$/)
      assert.deepEqual(totals, ['       TOTAL = 2', '       TOTAL = 4'])
    })
  })

  // -- The report as a whole --
  test('MAK-REP-A011 renders exactly this', () => {
    assert.equal(
      buildTxt(report(a011())),
      [
        '16/08/2026',
        'DAILY ACTIVITY REPORT',
        'BRANCH: Makkah',
        'REPORT ID: MAK-REP-A011',
        DIVIDER,
        'Entry & Materials Summary',
        DIVIDER,
        'AIRBUS (TH1N)',
        '1. PCB (C) (MOI) = 1',
        '2. PROGRAMMING = 1',
        DIVIDER,
        'SEPURA (CARKIT)',
        '1. FISTMIC (MOT) = 2',
        '2. FUSE COVER (MOT) = 2',
        '3. FUSE10 (MOT) = 2',
        '4. INSTALLATION = 2',
        DIVIDER,
        'Device Summary',
        DIVIDER,
        'AIRBUS (TH1N)',
        '1. MAINTENANCE = 1',
        '2. PROGRAMMING = 1',
        '       TOTAL = 2',
        DIVIDER,
        'SEPURA (CARKIT)',
        '3. MAINTENANCE = 2',
        '4. INSTALLATION = 2',
        '       TOTAL = 4',
        DIVIDER,
        'Agency Summary',
        DIVIDER,
        'MAIN: [PSD = 4] [PRI = 1]',
        'PROG: [PRI = 1]',
      ].join('\n'),
    )
  })

  // The print sheet and the PDF read materialBlocksByType / deviceBlocksByType
  // directly (App.jsx SplitColumns), while the TXT — which is also the WhatsApp
  // daily text (server/src/dailyText.js) — is built from those same two
  // functions. So no view can print a line the others do not, and this is what
  // says so.
  test('the print sheet, the PDF blocks and the WhatsApp text carry the same lines', () => {
    const txt = buildTxt(report(a011()))
    for (const byType of [materialBlocksByType(a011()), deviceBlocksByType(a011())]) {
      for (const type of Object.keys(byType)) {
        for (const b of byType[type]) {
          assert.ok(txt.includes(b.header), `block "${b.header}" is missing from the text`)
          for (const line of b.lines) {
            // The device blocks number per block for the split columns; the TXT
            // numbers continuously, so compare on the part after the number.
            const body = line.replace(/^\d+\. /, '')
            assert.ok(txt.includes(body), `"${body}" is in the blocks but not in the text`)
          }
        }
      }
    }
  })
})

// The sheet's rows are read down the MODEL column, so they run in MODEL_ORDER
// rather than the order the devices reached the bench.
describe('the sheet lists its entries in fixed model order', () => {
  const TYPE_OF = { TH1N: 'AIRBUS', THR9: 'AIRBUS', 'TMR 880I': 'AIRBUS', MT680: 'HYTERA' }
  const at = (model, tag = '') => ({
    agency: 'PSD',
    type: TYPE_OF[model] ?? 'SEPURA',
    model,
    tag,
    faults: [{ issue: 'SPEAKER', quantity: 1, action: 'CHANGE', company: 'MOTECO' }],
  })
  const models = (entries) => entriesByModel(entries).map((e) => e.model)

  test('every model sorts to its place in MODEL_ORDER', () => {
    const shuffled = ['MT680', 'SRG3900 CARKIT', 'TH1N', 'STP9000', 'SRG3900 BIKE', 'THR9', 'SRG3900 DESKTOP']
    assert.deepEqual(models(shuffled.map((m) => at(m))), [
      'TH1N',
      'THR9',
      'STP9000',
      'SRG3900 CARKIT',
      'SRG3900 DESKTOP',
      'SRG3900 BIKE',
      'MT680',
    ])
  })

  // Stable, so the entry just typed is still the last of its group rather than
  // landing somewhere in the middle of the devices it shares a model with.
  test('entries on one model keep the order they were entered in', () => {
    const entries = [at('STP9000', 'a'), at('TH1N', 'b'), at('STP9000', 'c'), at('TH1N', 'd')]
    assert.deepEqual(
      entriesByModel(entries).map((e) => e.tag),
      ['b', 'd', 'a', 'c'],
    )
  })

  test('a model MODEL_ORDER does not name sorts last, not first', () => {
    assert.deepEqual(models([at('SOMETHING NEW'), at('STP9000'), at('TH1N')]), ['TH1N', 'STP9000', 'SOMETHING NEW'])
  })

  // Sorted on the report model itself, so the sheet, the PDF and the WhatsApp
  // text all number the same entry the same way.
  test('the report is built from the sorted entries', () => {
    const report = buildDateReport('23/08/2026', 'MAKKAH-REP-0016', [at('SRG3900 CARKIT'), at('TH1N'), at('STP9000')], {
      branch: 'Makkah',
    })
    assert.deepEqual(
      report.entries.map((e) => e.model),
      ['TH1N', 'STP9000', 'SRG3900 CARKIT'],
    )
  })
})

// The sheet has no column for an Airbus car kit's repair and programming — its
// group carries Installation and Dismantling only — so that work is counted as
// the TH1n it is done on. Without this it was written into the day's
// description and counted in no column at all.
describe('a TH1n car kit counts in the TH1n column', () => {
  const on = (model, date = '2026-08-25', faults = null) => ({
    reportDate: date,
    technician: 'AMIR',
    agency: 'PSD',
    type: 'AIRBUS',
    model,
    faults: faults ?? [{ issue: 'ANTENNA', quantity: 1, action: 'CHANGE', company: 'MOTECO' }],
  })
  const sheet = (entries) =>
    buildMonthlyMatrix([{ mode: 'report', branch: 'Makkah', dateLabel: '25/08/2026', entries }], {
      year: 2026,
      month: 7,
      branch: 'Makkah',
    })
  const day25 = (m) => m.rows.find((r) => r.day === 25)

  test('a car kit repaired on its own counts once, as a TH1n', () => {
    const m = sheet([on('TH1N Carkit')])
    assert.equal(day25(m).counts.th1n, 1)
    assert.equal(m.totals.th1n, 1)
  })

  test('however the name is spaced or cased', () => {
    for (const name of ['TH1N CARKIT', 'th1n carkit', 'TH1N CAR KIT', 'TH1n-Carkit']) {
      assert.equal(day25(sheet([on(name)])).counts.th1n, 1, name)
    }
  })

  test('a car kit and a handset are two devices, counted twice', () => {
    assert.equal(day25(sheet([on('TH1N'), on('TH1N Carkit')])).counts.th1n, 2)
  })

  // The count folds; the description does not. What was worked on is still
  // named device by device, so the sheet still says which one it was.
  test('the description still names the car kit as itself', () => {
    const desc = day25(sheet([on('TH1N Carkit')])).description
    assert.match(desc, /\(AIRBUS-TH1N Carkit\) ANTENNA \(1\)/)
  })

  // Installation and Dismantling are counted off the TYPE, and Airbus car kits
  // have columns of their own for both. Folding the model must not divert them.
  test('installing one still counts under Airbus Car Kit, not TH1n', () => {
    const m = sheet([on('TH1N Carkit', '2026-08-25', [{ issue: '', quantity: 1, action: 'INSTALL', company: 'MOT' }])])
    assert.equal(day25(m).counts.ack_i, 1)
    assert.equal(day25(m).counts.th1n, 0)
  })

  // A device with several faults is still one device — the fold must not turn
  // a car kit into the exception that counts per fault.
  test('several faults on one car kit still count it once', () => {
    const m = sheet([
      on('TH1N Carkit', '2026-08-25', [
        { issue: 'ANTENNA', quantity: 1, action: 'CHANGE', company: 'MOT' },
        { issue: 'FISTMIC', quantity: 2, action: 'CHANGE', company: 'MOT' },
      ]),
    ])
    assert.equal(day25(m).counts.th1n, 1)
  })

  test('the day and year views inherit the fold', () => {
    const rep = [{ mode: 'report', branch: 'Makkah', dateLabel: '25/08/2026', entries: [on('TH1N Carkit')] }]
    const day = buildDayMatrix(rep, { year: 2026, month: 7, day: 25, branch: 'Makkah' })
    assert.equal(day.totals.th1n, 1)
    const year = buildYearMatrix(rep, { year: 2026, branch: 'Makkah' })
    assert.equal(year.totals.th1n, 1)
  })
})

// What a device is CALLED is Manage Inputs' answer, not this module's. An entry
// holds the spelling that was current when it was saved, so without registering
// the list one day's report would print "TMR 880i" and the next "TMR880i", for
// the one terminal.
describe('a device is printed by the name Manage Inputs gives it', () => {
  const entry = (model, type = 'AIRBUS') => ({
    reportDate: '2026-08-25',
    agency: 'PSD',
    technician: 'AMIR',
    type,
    model,
    faults: [{ issue: 'ANTENNA', quantity: 1, action: 'CHANGE', company: 'MOTECO' }],
  })
  const txtFor = (model, type) =>
    buildTxt(buildDateReport('25/08/2026', 'MAKKAH-REP-0021', [entry(model, type)], { branch: 'Makkah' }))

  test('with no list registered, the entry keeps its own spelling', () => {
    setModelNames(null)
    assert.match(txtFor('TMR 880i'), /TMR 880i/)
  })

  test('a registered list renames it, however it was stored', () => {
    setModelNames(DEFAULT_OPTIONS.models)
    try {
      assert.match(txtFor('TMR 880i'), /TMR880i/)
      assert.ok(!txtFor('TMR 880i').includes('TMR 880i'))
      assert.match(txtFor('tmr-880i'), /TMR880i/)
    } finally {
      setModelNames(null)
    }
  })

  // A name the report shortens on purpose — "SRG3900 CARKIT" prints as
  // "SRG CARKIT" — is not a spelling the list gets to overrule.
  test('the sheet keeps its own short form for the SRG builds', () => {
    setModelNames(DEFAULT_OPTIONS.models)
    try {
      assert.match(txtFor('SRG3900 CARKIT', 'SEPURA'), /SEPURA \(CARKIT\)/)
    } finally {
      setModelNames(null)
    }
  })

  test('a model no list names is printed as the entry holds it', () => {
    setModelNames(DEFAULT_OPTIONS.models)
    try {
      assert.match(txtFor('SOMETHING NEW'), /SOMETHING NEW/)
    } finally {
      setModelNames(null)
    }
  })
})

// The fixed sort order and the sheet's columns are written in one spelling; an
// entry saved in another is the same terminal and must land in the same place.
describe('the old spelling still sorts and counts as the same terminal', () => {
  const at = (model) => ({
    reportDate: '2026-08-25',
    agency: 'PSD',
    type: 'AIRBUS',
    model,
    faults: [{ issue: 'ANTENNA', quantity: 1, action: 'CHANGE', company: 'MOTECO' }],
  })

  test('it sorts to the TMR880i place, not last', () => {
    assert.deepEqual(
      entriesByModel([at('MT680'), at('TMR 880i'), at('TH1N')]).map((e) => e.model),
      ['TH1N', 'TMR 880i', 'MT680'],
    )
  })

  test('it counts in the TMR880i column', () => {
    const m = buildMonthlyMatrix(
      [{ mode: 'report', branch: 'Makkah', dateLabel: '25/08/2026', entries: [at('TMR 880i')] }],
      { year: 2026, month: 7, branch: 'Makkah' },
    )
    assert.equal(m.rows.find((r) => r.day === 25).counts.tmr880i, 1)
    assert.equal(m.totals.tmr880i, 1)
  })
})
