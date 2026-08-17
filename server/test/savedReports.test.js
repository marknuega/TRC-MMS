import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { hasRtoAction, isRtoAction, seriesFor, requestedDate, requestedDocNumber } from '../src/routes/savedReports.js'

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

// Reference-only reports carry their own REF-#### series, so the record-keeping
// numbers never interleave with the daily reports' REP-####.
describe('seriesFor', () => {
  test('an ordinary report is a REP', () => {
    assert.equal(seriesFor('report', false), 'REP')
  })

  test('a reference-only report is a REF', () => {
    assert.equal(seriesFor('report', true), 'REF')
  })

  test('a transmittal is a TRANS whatever the flag says', () => {
    assert.equal(seriesFor('transmittal', false), 'TRANS')
    // The flag comes from an RTO, which is a service action a transmittal never
    // has — but if one ever arrives, it must not land in the REF series.
    assert.equal(seriesFor('transmittal', true), 'TRANS')
  })

  test('the mode is read the same loose way the rest of the route reads it', () => {
    assert.equal(seriesFor(' TRANSMITTAL ', false), 'TRANS')
    assert.equal(seriesFor(undefined, false), 'REP')
    assert.equal(seriesFor('anything else', true), 'REF')
  })

  // The three series are disjoint, which is what lets them share a branch's
  // numbering space without colliding on (series, branch, docNumber).
  test('every combination yields exactly one of the three', () => {
    const all = [
      seriesFor('report', false), seriesFor('report', true),
      seriesFor('transmittal', false), seriesFor('transmittal', true),
    ]
    assert.deepEqual([...new Set(all)].sort(), ['REF', 'REP', 'TRANS'])
  })
})

// A save can name its own date and number — the report written up a day late,
// or the number that has to match a document already issued on paper. Both are
// validated at the route, which is the only thing a request has to get past.
describe('requestedDate', () => {
  test('absent means "use the dates the entries already carry"', () => {
    assert.deepEqual(requestedDate(undefined), { value: null })
    assert.deepEqual(requestedDate(null), { value: null })
    assert.deepEqual(requestedDate(''), { value: null })
  })

  test('a plain YYYY-MM-DD passes through', () => {
    assert.deepEqual(requestedDate('2026-08-15'), { value: '2026-08-15' })
  })

  test('an ISO timestamp is cut down to its day', () => {
    assert.deepEqual(requestedDate('2026-08-15T09:30:00.000Z'), { value: '2026-08-15' })
  })

  // Date() rolls 31 February forward into March. A report filed silently on a
  // day nobody chose is worse than a refused save.
  test('a date that does not exist is refused, not rolled forward', () => {
    assert.match(requestedDate('2026-02-31').error, /not a real date/)
    assert.match(requestedDate('2026-13-01').error, /not a real date/)
  })

  test('anything not shaped like a date is refused', () => {
    for (const v of ['15/08/2026', 'yesterday', '2026-8-5', 42]) {
      assert.ok(requestedDate(v).error, `${v} should be refused`)
    }
  })
})

describe('requestedDocNumber', () => {
  test('absent means "draw the next one in the series"', () => {
    assert.deepEqual(requestedDocNumber(undefined), { value: null })
    assert.deepEqual(requestedDocNumber(''), { value: null })
  })

  test('a whole number is taken as the document number', () => {
    assert.deepEqual(requestedDocNumber(19), { value: 19 })
    assert.deepEqual(requestedDocNumber('19'), { value: 19 }) // JSON from a text input
  })

  // 0 would render as A001 (blockNumber clamps), i.e. silently the FIRST
  // document of the series rather than the one asked for.
  test('zero, negatives and fractions are refused', () => {
    for (const v of [0, -1, 1.5, '2.5']) assert.ok(requestedDocNumber(v).error, `${v} should be refused`)
  })

  test('the ceiling is where the short id runs out of letters', () => {
    assert.deepEqual(requestedDocNumber(26 * 999), { value: 25974 }) // Z999
    assert.ok(requestedDocNumber(26 * 999 + 1).error)
  })

  test('anything not a number is refused', () => {
    for (const v of ['A019', 'nineteen', {}]) assert.ok(requestedDocNumber(v).error, `${v} should be refused`)
  })
})
