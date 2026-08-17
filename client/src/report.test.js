import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  classify, entryCounts, technicianTotals, agencyBlocks, activityTotals, buildSparePartsReport,
  agencyComment, buildDateReport, buildTxt, deviceBlocksByType,
} from './report.js'

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

  // 97 is Charging Pin, 99 is Charger — different parts, and only one of them
  // is standalone.
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
