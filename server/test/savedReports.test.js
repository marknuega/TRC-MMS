import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { hasRtoAction, isRtoAction } from '../src/routes/savedReports.js'

// RTO (Return to Owner) = the device went back untouched, so no part was used.
// A snapshot containing one is saved as reference-only.
describe('hasRtoAction', () => {
  const entry = (...actions) => ({ faults: actions.map((action) => ({ action })) })

  test('detects an RTO fault anywhere in the snapshot', () => {
    assert.equal(hasRtoAction([entry('CHANGE'), entry('REPAIR', 'RTO')]), true)
  })

  // A defective PCB handed back is the parts code 50F plus the RTO action, so
  // the action alone decides — there is no PCB-specific RTO action.
  test('PCB the action is real work, not an RTO', () => {
    assert.equal(hasRtoAction([entry('PCB')]), false)
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

// Stock is skipped per FAULT, not per report — this is what lets a
// reference-only report still deduct for the real parts it also records.
describe('isRtoAction', () => {
  test('an RTO line draws no stock', () => {
    assert.equal(isRtoAction('RTO'), true)
    assert.equal(isRtoAction(' rto '), true)
  })

  test('a real service action still draws stock', () => {
    for (const a of ['CHANGE', 'NEW', 'PCB', 'REPAIR', 'INSTALL', 'DISMANTLE']) {
      assert.equal(isRtoAction(a), false, `${a} should still deduct`)
    }
  })

  test('an action that merely contains "rto" is not an RTO', () => {
    assert.equal(isRtoAction('RTOX'), false)
    assert.equal(isRtoAction('PORTO'), false)
  })

  test('tolerates a missing action', () => {
    assert.equal(isRtoAction(undefined), false)
    assert.equal(isRtoAction(''), false)
  })
})
