import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { hasRtoAction } from '../src/routes/savedReports.js'

// RTO (Return to Owner) = the device went back untouched, so no part was used.
// A snapshot containing one is saved as reference-only.
describe('hasRtoAction', () => {
  const entry = (...actions) => ({ faults: actions.map((action) => ({ action })) })

  test('detects an RTO fault anywhere in the snapshot', () => {
    assert.equal(hasRtoAction([entry('CHANGE'), entry('REPAIR', 'RTO')]), true)
  })

  test('is false when no fault is an RTO', () => {
    assert.equal(hasRtoAction([entry('CHANGE'), entry('PROGRAM', 'DISMANTLE')]), false)
  })

  test('matches regardless of case and surrounding spaces', () => {
    assert.equal(hasRtoAction([entry(' rto ')]), true)
  })

  test('does not match an action that merely contains "rto"', () => {
    assert.equal(hasRtoAction([entry('RTOX'), entry('PORTO')]), false)
  })

  test('tolerates missing entries, faults and actions', () => {
    assert.equal(hasRtoAction(undefined), false)
    assert.equal(hasRtoAction([]), false)
    assert.equal(hasRtoAction([{}]), false)
    assert.equal(hasRtoAction([{ faults: [{}] }]), false)
  })
})
