import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasRtoAction,
  isRtoAction,
  resolveInventoryUsage,
  seriesFor,
  requestedDate,
  requestedDocNumber,
} from '../src/routes/savedReports.js'
import { CODEMAP_SEED } from '../src/codemapSeed.js'

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
      seriesFor('report', false),
      seriesFor('report', true),
      seriesFor('transmittal', false),
      seriesFor('transmittal', true),
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

// ---------------------------------------------------------------------------
// Which shelf a fault draws from.
//
// The bug this closes: "Speaker (45A)" on an SRG3900 Carkit and the same words
// on a TH1n are two different physical items with two different counts, and
// matching on the name alone drew one model's usage out of the other model's
// box — inside the save transaction, with a document number already printed
// against it.
// ---------------------------------------------------------------------------
describe('resolveInventoryUsage', () => {
  const VOCAB = {
    equipmentCodes: CODEMAP_SEED.equipmentCodes,
    issueTypes: [
      { name: 'SPEAKER LOW', parts: '45', variant: 'A' },
      'CUR3 DISPLAY FOR TMR880I - HT10280AA', // named, no parts code yet
    ],
  }

  const item = (id, sku, itemCode, pairCode = '') => ({ id, sku, itemCode, pairCode, begin: 10, out: 0 })
  const entry = (model, ...faults) => ({
    model,
    faults: faults.map((f) => (typeof f === 'string' ? { issue: f, quantity: 1, action: 'CHANGE' } : f)),
  })
  const drawn = (usage) => usage.map((u) => [u.item.sku, u.qty, u.pairCode])

  test('a fault draws the row coded for its own model', () => {
    const items = [
      item(1, 'TH1N-SPK', 'SPEAKER LOW', 'H45A'),
      item(2, 'CARKIT-SPK', 'SPEAKER LOW', 'C45A'),
      item(3, 'DESK-SPK', 'SPEAKER LOW', 'D45A'),
    ]
    assert.deepEqual(drawn(resolveInventoryUsage([entry('TH1N', 'SPEAKER LOW')], items, VOCAB)), [
      ['TH1N-SPK', 1, 'H45A'],
    ])
    assert.deepEqual(drawn(resolveInventoryUsage([entry('SRG3900 CARKIT', 'SPEAKER LOW')], items, VOCAB)), [
      ['CARKIT-SPK', 1, 'C45A'],
    ])
  })

  // The heart of it: one report, two models, one part name — and each model
  // comes off its own shelf.
  test('two models in one report draw the same part from two shelves', () => {
    const items = [item(1, 'TH1N-SPK', 'SPEAKER LOW', 'H45A'), item(2, 'CARKIT-SPK', 'SPEAKER LOW', 'C45A')]
    const snapshot = [entry('TH1N', 'SPEAKER LOW'), entry('SRG3900 CARKIT', 'SPEAKER LOW')]
    assert.deepEqual(drawn(resolveInventoryUsage(snapshot, items, VOCAB)), [
      ['TH1N-SPK', 1, 'H45A'],
      ['CARKIT-SPK', 1, 'C45A'],
    ])
  })

  // Most of the store genuinely is shared, which is why a blank Model Code
  // keeps working exactly as it did before any of this existed — and why the
  // migration needed no backfill.
  test('an uncoded row is shared, and still matches by name', () => {
    const items = [item(1, 'ANY-SPK', 'SPEAKER LOW')]
    assert.deepEqual(drawn(resolveInventoryUsage([entry('TH1N', 'SPEAKER LOW')], items, VOCAB)), [['ANY-SPK', 1, '']])
  })

  test('a coded row wins over a shared one', () => {
    const items = [item(1, 'ANY-SPK', 'SPEAKER LOW'), item(2, 'TH1N-SPK', 'SPEAKER LOW', 'H45A')]
    assert.deepEqual(drawn(resolveInventoryUsage([entry('TH1N', 'SPEAKER LOW')], items, VOCAB)), [
      ['TH1N-SPK', 1, 'H45A'],
    ])
  })

  // A coded row belongs to ONE model. Letting it also answer to the bare name
  // is exactly the hole this closes, so a Carkit-coded speaker must not be
  // reachable by a TH1n fault even when nothing else stocks it.
  test('a row coded for another model is not reachable by name', () => {
    const items = [item(2, 'CARKIT-SPK', 'SPEAKER LOW', 'C45A')]
    assert.deepEqual(resolveInventoryUsage([entry('TH1N', 'SPEAKER LOW')], items, VOCAB), [])
  })

  test('an item with no parts code is drawn by its provisional code', () => {
    const items = [
      item(1, 'TMR-CUR3', 'CUR3 DISPLAY FOR TMR880I - HT10280AA', 'M:CUR3 DISPLAY FOR TMR880I - HT10280AA'),
    ]
    const snapshot = [entry('TMR 880i', 'CUR3 Display for TMR880i - HT10280AA')]
    assert.deepEqual(drawn(resolveInventoryUsage(snapshot, items, VOCAB)), [
      ['TMR-CUR3', 1, 'M:CUR3 DISPLAY FOR TMR880I - HT10280AA'],
    ])
  })

  test('a model the code map does not name falls back to the shared shelf', () => {
    const items = [item(1, 'ANY-SPK', 'SPEAKER LOW'), item(2, 'TH1N-SPK', 'SPEAKER LOW', 'H45A')]
    const snapshot = [entry('For Record Purpose Only.', 'SPEAKER LOW')]
    assert.deepEqual(drawn(resolveInventoryUsage(snapshot, items, VOCAB)), [['ANY-SPK', 1, '']])
  })

  test('quantities for one item accumulate across entries', () => {
    const items = [item(1, 'TH1N-SPK', 'SPEAKER LOW', 'H45A')]
    const snapshot = [
      entry('TH1N', { issue: 'SPEAKER LOW', quantity: 2, action: 'CHANGE' }),
      entry('TH1n', { issue: 'SPEAKER LOW', quantity: 3, action: 'REPAIR' }),
    ]
    assert.deepEqual(drawn(resolveInventoryUsage(snapshot, items, VOCAB)), [['TH1N-SPK', 5, 'H45A']])
  })

  // RTO = the device went back untouched. Skipped per FAULT, so a report that
  // also records real usage still deducts for those parts.
  test('an RTO fault draws nothing, and does not stop the rest of the report', () => {
    const items = [item(1, 'TH1N-SPK', 'SPEAKER LOW', 'H45A')]
    const snapshot = [
      entry('TH1N', { issue: 'SPEAKER LOW', quantity: 1, action: 'RTO' }),
      entry('TH1N', { issue: 'SPEAKER LOW', quantity: 2, action: 'CHANGE' }),
    ]
    assert.deepEqual(drawn(resolveInventoryUsage(snapshot, items, VOCAB)), [['TH1N-SPK', 2, 'H45A']])
  })

  test('a fault nothing stocks is ignored, as it always was', () => {
    assert.deepEqual(resolveInventoryUsage([entry('TH1N', 'ANTENNA')], [item(1, 'X', 'SPEAKER LOW')], VOCAB), [])
  })

  // Refused rather than guessed at: this runs inside the save transaction, so
  // picking one of the two would move stock off the wrong shelf under a
  // document number that is already printed.
  test('two rows answering one fault fail the save and name both', () => {
    const items = [item(1, 'TH1N-SPK-A', 'SPEAKER LOW', 'H45A'), item(2, 'TH1N-SPK-B', 'SPEAKER LOW', 'H45A')]
    assert.throws(() => resolveInventoryUsage([entry('TH1N', 'SPEAKER LOW')], items, VOCAB), (err) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /H45A/)
      assert.match(err.message, /TH1N-SPK-A, TH1N-SPK-B/)
      return true
    })
  })

  test('two shared rows under one item code are refused the same way', () => {
    const items = [item(1, 'SPK-A', 'SPEAKER LOW'), item(2, 'SPK-B', 'SPEAKER LOW')]
    assert.throws(() => resolveInventoryUsage([entry('TH1N', 'SPEAKER LOW')], items, VOCAB), /SPK-A, SPK-B/)
  })

  test('tolerates an empty snapshot, empty stock and missing faults', () => {
    assert.deepEqual(resolveInventoryUsage([], [], VOCAB), [])
    assert.deepEqual(resolveInventoryUsage(undefined, undefined, VOCAB), [])
    assert.deepEqual(resolveInventoryUsage([{ model: 'TH1N' }], [item(1, 'X', 'SPEAKER LOW')], VOCAB), [])
  })
})
