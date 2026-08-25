/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Reading and writing the inventory sheet. An importer that shifts one column
 * silently refiles a whole store, so the round trip is pinned here.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { CSV_COLUMNS, parseDelimited, parsePaste } from './inventoryCsv.js'

// The same writer downloadCsv uses, so the test exercises the real column order
// rather than a copy of it that could drift.
const toCsv = (items) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [
    CSV_COLUMNS.map(([label]) => esc(label)).join(','),
    ...items.map((i) => CSV_COLUMNS.map(([, read]) => esc(read(i))).join(',')),
  ].join('\n')
}

describe('the export writes the page order', () => {
  test('header reads store, room, shelf, then the names, then the counts', () => {
    assert.deepEqual(
      CSV_COLUMNS.map(([label]) => label),
      [
        'SKU',
        'Company',
        'Store',
        'Room ID',
        'Shelf',
        'Item Code',
        'Description',
        'Alias',
        'Model Code',
        'Begin',
        'Out',
        'Avail',
        'Remarks',
      ],
    )
  })
})

describe('export → import round trip', () => {
  const item = {
    sku: 'MOT-MAK-1112',
    store: 'MOT-MAK',
    roomId: '1',
    shelf: 'A',
    itemCode: 'HT11002AA',
    description: 'B Cover, black',
    alias: 'B Cover',
    pairCode: 'H12B',
    begin: 12,
    out: 5,
    avail: 7,
    remarks: 'BATTERY, 8 PCS',
  }

  // The export order is not the positional order, so this only works because a
  // header is written and read back by name. If either half stops doing that,
  // every column after Store lands in the wrong field.
  test('every field comes back where it started', () => {
    const [row] = parsePaste(toCsv([item]))
    assert.equal(row.sku, item.sku)
    assert.equal(row.store, item.store)
    assert.equal(row.roomId, item.roomId)
    assert.equal(row.shelf, item.shelf)
    assert.equal(row.itemCode, item.itemCode)
    assert.equal(row.description, item.description)
    assert.equal(row.alias, item.alias)
    assert.equal(row.pairCode, item.pairCode)
    assert.equal(row.begin, 12)
    assert.equal(row.out, 5)
    assert.equal(row.remarks, item.remarks)
  })

  // Avail is begin - out and is written for the reader, never read back: a
  // pasted value would let a sheet contradict its own arithmetic.
  test('Avail is exported but not imported', () => {
    const [row] = parsePaste(toCsv([{ ...item, avail: 999 }]))
    assert.equal(row.avail, undefined)
  })

  test('a quoted field carrying the delimiter survives', () => {
    const [row] = parsePaste(toCsv([{ ...item, description: 'B Cover, black, 2nd batch' }]))
    assert.equal(row.description, 'B Cover, black, 2nd batch')
  })
})

// The original workbook's columns have not moved, and a paste out of it carries
// no header. That order is frozen for exactly that reason.
describe('a headerless paste keeps the original order', () => {
  test('reads SKU, Store, Shelf, Item Code, Begin, Out, Avail, Remarks', () => {
    const [row] = parsePaste('X1-MAK-1111\tX1 - MAK\tB\tBLN-10 BATTERY 1590 MAH\t88\t0\t88\tspare')
    assert.equal(row.sku, 'X1-MAK-1111')
    assert.equal(row.store, 'X1 - MAK')
    assert.equal(row.shelf, 'B')
    assert.equal(row.itemCode, 'BLN-10 BATTERY 1590 MAH')
    assert.equal(row.begin, 88)
    assert.equal(row.out, 0)
    assert.equal(row.remarks, 'spare')
    // Columns that did not exist when that sheet was written stay blank rather
    // than picking up whatever happened to be in that position.
    assert.equal(row.roomId, '')
    assert.equal(row.description, '')
    assert.equal(row.pairCode, '')
  })

  // A header only counts if EVERY cell in it is a column this understands —
  // half-recognised means it is a data row that happens to start with "SKU".
  test('a row starting with SKU that is not a header is still read positionally', () => {
    const rows = parsePaste('SKU-123\tMOT-MAK\tA\tHT11002AA\t1\t0\t1\t')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sku, 'SKU-123')
  })

  test('the header row itself is never imported as an item', () => {
    const rows = parsePaste(toCsv([{ sku: 'ONE' }, { sku: 'TWO' }]))
    assert.deepEqual(
      rows.map((r) => r.sku),
      ['ONE', 'TWO'],
    )
  })
})

describe('parseDelimited', () => {
  test('a doubled quote inside a quoted field is one literal quote', () => {
    assert.deepEqual(parseDelimited('"he said ""hi""",b'), [['he said "hi"', 'b']])
  })

  test('tabs win over commas when the sheet uses them', () => {
    assert.deepEqual(parseDelimited('a,1\tb,2'), [['a,1', 'b,2']])
  })

  test('blank lines are dropped', () => {
    assert.deepEqual(parseDelimited('a,b\n\n\nc,d'), [
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})
