import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  classify, entryCounts, technicianTotals, agencyBlocks, activityTotals, buildSparePartsReport,
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
