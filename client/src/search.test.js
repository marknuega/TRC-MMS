/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { searchInside, tallyItems } from './search.js'

// One saved snapshot, shaped the way the app stores them.
const rep = (entries, extra = {}) => ({
  branch: 'Makkah',
  dateLabel: '16/08/2026',
  reportId: 'REP-0021',
  docNumber: 21,
  series: 'REP',
  entries,
  ...extra,
})

// The entry from the report that started this: one device, one visit, a new PCB
// number written in the note, and two faults on it.
const pcbEntry = {
  model: 'TH1N',
  type: 'AIRBUS',
  agency: 'PRI',
  technician: '',
  telNumber: '355060581010',
  issiNumber: '1960901',
  comment: 'New pCB number.88888888',
  faults: [
    { issue: 'PCB', quantity: 1, action: 'CHANGE', company: 'MOI' },
    { issue: 'Program', quantity: 1, action: 'PROGRAM', company: '' },
  ],
}

test('a note is a fact about the ENTRY, so it answers with one row', () => {
  const out = searchInside([rep([pcbEntry])], '88888888')
  assert.equal(out.length, 1)
  assert.equal(out[0].reportId, 'MAK-REP-A021')
  // Its faults are named together — the entry is one visit to one device.
  assert.equal(out[0].item, 'TH1N · PCB + Program')
  // The quantity the report sheet prints for that entry: 1 maintenance + 1 programming.
  assert.equal(out[0].qty, 2)
})

test('tel, ISSI, technician, model and branch answer the same way', () => {
  for (const q of ['355060581010', '1960901', 'TH1N', 'AIRBUS', 'Makkah', '16/08/2026']) {
    assert.equal(searchInside([rep([pcbEntry])], q).length, 1, q)
  }
})

test('a part names a LINE, so it still answers per fault', () => {
  const out = searchInside([rep([pcbEntry])], 'pcb')
  assert.equal(out.length, 1)
  assert.equal(out[0].item, 'TH1N · PCB')
  assert.equal(out[0].qty, 1)
})

test('a part on several lines returns every line it is on', () => {
  const entry = {
    model: 'CARKIT',
    type: 'SEPURA',
    telNumber: '0333',
    faults: [
      { issue: 'FUSE COVER', quantity: 1, action: 'CHANGE', company: 'MOT' },
      { issue: 'FUSE10', quantity: 2, action: 'CHANGE', company: 'MOT' },
    ],
  }
  const out = searchInside([rep([entry])], 'fuse')
  assert.equal(out.length, 2)
  assert.deepEqual(
    out.map((r) => r.qty),
    [1, 2],
  )
})

test('a company matches only the lines that name it', () => {
  const out = searchInside([rep([pcbEntry])], 'moi')
  assert.equal(out.length, 1)
  assert.equal(out[0].item, 'TH1N · PCB')
})

// Two entries that both match are two devices, not one — the collapsing is per
// entry, never per report, or a second radio's work would vanish from the list.
test('two matching entries in one report stay two rows', () => {
  const other = { ...pcbEntry, telNumber: '355060581011', issiNumber: '1960902' }
  const out = searchInside([rep([pcbEntry, other])], '88888888')
  assert.equal(out.length, 2)
  assert.deepEqual(new Set(out.map((r) => r.reportId)), new Set(['MAK-REP-A021']))
})

test('a device-level fault with no issue is named by its action', () => {
  const entry = {
    model: 'CARKIT',
    type: 'SEPURA',
    comment: 'fitted today',
    faults: [{ issue: '', quantity: 1, action: 'INSTALL', company: 'MOT' }],
  }
  const out = searchInside([rep([entry])], 'fitted')
  assert.equal(out[0].item, 'CARKIT · INSTALL')
})

test('an entry with no faults has no line to show', () => {
  const out = searchInside([rep([{ model: 'TH1N', type: 'AIRBUS', comment: 'note', faults: [] }])], 'note')
  assert.equal(out.length, 0)
})

test('an empty query matches nothing at all', () => {
  assert.deepEqual(searchInside([rep([pcbEntry])], '   '), [])
})

test('the tally sums quantities per item, biggest first', () => {
  const rows = [
    { item: 'TH1N · Sidegrip', qty: 2 },
    { item: 'TH1N · Sidegrip3D', qty: 1 },
    { item: 'TH1N · Sidegrip', qty: 3 },
  ]
  assert.deepEqual(tallyItems(rows), [
    { item: 'TH1N · Sidegrip', qty: 5 },
    { item: 'TH1N · Sidegrip3D', qty: 1 },
  ])
})

test('the tally keeps two models of one part apart', () => {
  const out = tallyItems([
    { item: 'TH1N · Sidegrip', qty: 1 },
    { item: 'SRG3900 · Sidegrip', qty: 1 },
  ])
  assert.equal(out.length, 2)
})

// The badges answer "how many of each part went out", so they count PARTS, not
// rows. A row can be a whole visit to a device, and a badge reading
// "TH1N · Battery 3180 + Sidegrip + PTT — 1" counts nothing anybody can use.
describe('the tally counts parts, whatever shape the rows are', () => {
  const visit = (model, faults, comment = 'seen on the 6th') => ({
    model,
    type: 'AIRBUS',
    telNumber: '355060581010',
    comment,
    faults,
  })
  const change = (issue, quantity) => ({ issue, quantity, action: 'CHANGE', company: 'MOT' })

  test('an entry matched as a whole is still counted part by part', () => {
    const rows = searchInside(
      [rep([visit('TH1N', [change('Battery 3180', 1), change('Sidegrip', 2), change('PTT', 1)])])],
      'seen on the 6th',
    )
    // One row for the visit…
    assert.equal(rows.length, 1)
    assert.equal(rows[0].item, 'TH1N · Battery 3180 + Sidegrip + PTT')
    // …and one badge per part, each with its own quantity.
    assert.deepEqual(tallyItems(rows), [
      { item: 'TH1N · Sidegrip', qty: 2 },
      { item: 'TH1N · Battery 3180', qty: 1 },
      { item: 'TH1N · PTT', qty: 1 },
    ])
  })

  test('the same part on two devices adds up across them', () => {
    const rows = searchInside(
      [rep([visit('TH1N', [change('Sidegrip', 1)]), visit('TH1N', [change('Sidegrip', 3), change('B Cover', 1)])])],
      'seen on the 6th',
    )
    assert.deepEqual(tallyItems(rows), [
      { item: 'TH1N · Sidegrip', qty: 4 },
      { item: 'TH1N · B Cover', qty: 1 },
    ])
  })

  test('searching a part counts that part alone, not its neighbours', () => {
    const rows = searchInside([rep([visit('TH1N', [change('Sidegrip', 2), change('PTT', 1)])])], 'sidegrip')
    assert.deepEqual(tallyItems(rows), [{ item: 'TH1N · Sidegrip', qty: 2 }])
  })

  test('a device-level action is counted by its action name', () => {
    const rows = searchInside(
      [rep([visit('SRG3900 CARKIT', [{ issue: '', quantity: 6, action: 'DISMANTLE', company: '' }])])],
      'seen on the 6th',
    )
    assert.deepEqual(tallyItems(rows), [{ item: 'SRG3900 CARKIT · DISMANTLE', qty: 6 }])
  })

  test('a day nothing was done on has no part to count', () => {
    const rows = searchInside(
      [rep([visit('TH1N', [{ issue: 'No Activity', quantity: 0, action: '', company: '' }])])],
      'seen on the 6th',
    )
    assert.equal(rows.length, 1)
    assert.deepEqual(tallyItems(rows), [])
  })
})
