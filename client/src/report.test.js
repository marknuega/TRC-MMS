import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  classify, entryCounts, technicianTotals, agencyBlocks, activityTotals, buildSparePartsReport,
  agencyComment, buildDateReport, buildTxt, deviceBlocksByType, setIssueClaims,
  isCountable, periodEntries, buildMonthlyMatrix, buildDayMatrix, buildYearMatrix,
  dashboardSummary, monthlyTrend, shortDocId, blockNumber, branchCode, seriesOf,
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
  technician: 'AMIR', agency: 'PSD', type: 'AIRBUS', model: 'TH1N', ...extra, faults,
})
const rtoOnly = entry([{ issue: 'SIDE GRIP', quantity: 3, action: 'RTO', company: 'MOTECO' }])
const realWork = entry([{ issue: 'ANTENNA', quantity: 2, action: 'CHANGE', company: 'MOTECO' }])

describe('RTO stays out of the service totals', () => {
  test('entryCounts reports zero across every category', () => {
    assert.deepEqual(entryCounts(rtoOnly), { maintenance: 0, programming: 0, install: 0, dismantle: 0 })
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
    assert.equal(rto.reduce((n, r) => n + r.maintenance + r.program + r.install + r.dismantle, 0), 0)
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
  const change = (issue, quantity) => ({ issue, quantity, action: 'CHANGE', company: 'MOTECO' })

  test('an entry whose only fault is a charger counts once', () => {
    assert.equal(entryCounts(entry([change('CHARGER12', 1)])).maintenance, 1)
  })

  test('a charger alongside another part counts as two, not the max', () => {
    assert.equal(entryCounts(entry([change('CHARGER12', 1), change('ANTENNA', 1)])).maintenance, 2)
  })

  test('an entry with no charger still counts once however many faults it has', () => {
    assert.equal(entryCounts(entry([change('ANTENNA', 1), change('BCOVER', 1)])).maintenance, 1)
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
    assert.equal(block.header, 'AIRBUS TH1N')
    assert.deepEqual(block.cats, [['MAINTENANCE', 5]])
    assert.equal(block.total, 5)
  })

  test('the agency summary agrees with it', () => {
    assert.equal(agencyComment(makkah), ['Agency Summary', DIVIDER, 'PSD [MAIN 5]'].join('\n'))
  })

  test('the exported report reads exactly as it should', () => {
    const report = buildDateReport('09/08/2026', 'MAKKAH-REP-0017', makkah, { branch: 'Makkah' })
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
        'AIRBUS TH1N',
        'ANTENNA (MOT) = 1',
        'BCOVER (MOT) = 1',
        'CHARGER12 (MOT) = 3',
        DIVIDER,
        'Device Summary',
        DIVIDER,
        'AIRBUS TH1N',
        '1. MAINTENANCE = 5',
        '       TOTAL = 5',
        DIVIDER,
        'Agency Summary',
        DIVIDER,
        'PSD [MAIN 5]',
      ].join('\n'),
    )
  })
})

// Which items are standalone is the CODE an Issue type claims — 98 Power
// Supply, 99 Charger — not what the item happens to be called. A claim may name
// its part anything, so the name is a guess and the code is not.
describe('the standalone rule reads claimed codes, not names', () => {
  const change = (issue, quantity = 1) => ({ issue, quantity, action: 'CHANGE', company: 'MOTECO' })
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

// A reference-only report is kept for the record and counts towards nothing.
// It stays openable and exportable on its own; it just never reaches a total.
describe('reference-only reports stay out of every aggregation', () => {
  const entryOn = (date, issue) => ({
    reportDate: date, technician: 'AMIR', agency: 'PSD', type: 'AIRBUS', model: 'TH1N',
    faults: [{ issue, quantity: 1, action: 'CHANGE', company: 'MOTECO' }],
  })
  const report = (extra) => ({
    mode: 'report', branch: 'Makkah', dateLabel: '16/08/2026',
    entries: [entryOn('2026-08-16', 'ANTENNA')], ...extra,
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
    const m = buildMonthlyMatrix([refOnly], { year: 2026, month: 7, branch: 'Makkah' })
    const row = m.rows.find((r) => r.day === 16)
    assert.equal(row.counts.th1n, 0)
    assert.equal(row.description, '')
    assert.equal(m.totals.th1n, 0)
  })

  // A day is still a row in the sheet whether or not anything countable
  // happened on it — the matrix has one row per calendar day.
  test('…and the day is still a row, not a hole', () => {
    const m = buildMonthlyMatrix([refOnly], { year: 2026, month: 7, branch: 'Makkah' })
    assert.equal(m.rows.length, 31)
    assert.ok(m.rows.find((r) => r.day === 16))
  })

  test('a normal report on the same day still counts in full', () => {
    const m = buildMonthlyMatrix([normal, refOnly], { year: 2026, month: 7, branch: 'Makkah' })
    const row = m.rows.find((r) => r.day === 16)
    assert.equal(row.counts.th1n, 1)
    assert.match(row.description, /ANTENNA/)
    assert.equal(m.totals.th1n, 1)
  })

  test('the day and year views inherit it from the monthly matrix', () => {
    const day = buildDayMatrix([refOnly], { year: 2026, month: 7, day: 16, branch: 'Makkah' })
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
    const txt = buildTxt(buildDateReport('16/08/2026', 'MAKKAH-REF-0001', refOnly.entries, { branch: 'Makkah' }))
    assert.match(txt, /REPORT ID: MAKKAH-REF-0001/)
    assert.match(txt, /ANTENNA/)
  })
})

// The second, shorter rendering of a saved report's id: MAKKAH-REP-0018 also
// reads MAK-REP-A018. Derived from branch + series + docNumber, never stored.
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

  test('seriesOf reads rows saved before the series column existed', () => {
    assert.equal(seriesOf({ series: 'REF', mode: 'report' }), 'REF')
    assert.equal(seriesOf({ mode: 'report' }), 'REP')
    assert.equal(seriesOf({ mode: 'transmittal' }), 'TRANS')
    assert.equal(seriesOf({}), 'REP')
  })

  test('the report header carries both ids, and only the long one without a short', () => {
    const opts = { branch: 'Makkah' }
    const withShort = buildDateReport('16/08/2026', 'MAKKAH-REP-0018', [], { ...opts, shortId: 'MAK-REP-A018' })
    assert.match(buildTxt(withShort), /REPORT ID: MAKKAH-REP-0018 \(MAK-REP-A018\)/)
    const without = buildDateReport('16/08/2026', 'MAKKAH-REP-0018', [], opts)
    assert.match(buildTxt(without), /REPORT ID: MAKKAH-REP-0018\n/)
  })
})
