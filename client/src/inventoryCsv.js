/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Reading and writing the inventory sheet.
 *
 * Kept apart from the page it serves so it can be tested on its own: an
 * importer that shifts one column silently refiles a whole store, and that is
 * not a thing to find out from a listing months later.
 *
 * The two orders in here are deliberately different and must stay that way.
 * CSV_COLUMNS is what an export WRITES, in the order the page shows — a sheet
 * opened beside the app reads the same way down the row. POSITIONAL is what a
 * headerless paste is READ in, and it is the original workbook's order,
 * unchanged since before any of the later columns existed. An export always
 * writes a header, and a header is always read by name, so the two never have
 * to agree.
 */

// Tab if the data actually uses tabs (an Excel copy-paste), else comma. Decided
// from the whole text, not the first line, because a leading header row can look
// tab-free while the rows below are not.
const pickDelimiter = (src) => (src.includes('\t') ? '\t' : ',')

// Full CSV/TSV reader: honours "quoted fields", which may themselves contain the
// delimiter, a newline, or a doubled "" escape. This is the dialect Excel writes
// AND the one the export writes, so an Export → Import round-trip only
// survives a remark like `BATTERY, 8 PCS` if the quotes are respected. A naive
// split on "," silently shifts every column after such a field.
export function parseDelimited(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n')
  const delim = pickDelimiter(src)
  const rows = []
  let row = []
  let cur = ''
  let quoted = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch !== '"') {
        cur += ch
      } else if (src[i + 1] === '"') {
        cur += '"' // "" inside a quoted field is one literal quote
        i += 1
      } else {
        quoted = false
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === delim) {
      row.push(cur)
      cur = ''
    } else if (ch === '\n') {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else {
      cur += ch
    }
  }
  row.push(cur)
  rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim()))
}

// Expected columns (Excel TSV / CSV), matching the inventory sheet:
// SKU, Store, Shelf, Item Code, Begin, Out, Avail(ignored — it is derived),
// Remarks, Model Code
//
// Model Code is LAST rather than next to Item Code, where it belongs on screen.
// Reading is positional, so slotting it in the middle would shift every column
// after it and quietly re-import a year of exports into the wrong fields. A
// header row is honoured when there is one, which is what lets a hand-made
// sheet put the columns in any order it likes.
const COLUMN_KEYS = {
  SKU: 'sku',
  STORE: 'store',
  SHELF: 'shelf',
  'ITEM CODE': 'itemCode',
  BEGIN: 'begin',
  OUT: 'out',
  AVAIL: null, // derived from begin - out; a pasted value is ignored
  REMARKS: 'remarks',
  'MODEL CODE': 'pairCode',
  ALIAS: 'alias',
  DESCRIPTION: 'description',
  'ROOM ID': 'roomId',
}
const POSITIONAL = [
  'sku',
  'store',
  'shelf',
  'itemCode',
  'begin',
  'out',
  null,
  'remarks',
  'pairCode',
  'alias',
  'description',
  'roomId',
]
const NUMERIC = new Set(['begin', 'out'])

const columnKey = (cell) => {
  const k = String(cell ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
  return Object.prototype.hasOwnProperty.call(COLUMN_KEYS, k) ? COLUMN_KEYS[k] : undefined
}

export function parsePaste(text) {
  const lines = parseDelimited(text)
  // A header only counts if EVERY cell in it is a column this understands —
  // half-recognised means it is a data row that happens to start with "SKU".
  let layout = POSITIONAL
  if (lines.length && columnKey(lines[0][0]) === 'sku') {
    const named = lines[0].map(columnKey)
    if (named.every((k) => k !== undefined)) layout = named
  }
  const rows = []
  for (const f of lines) {
    const sku = (f[0] || '').trim()
    if (!sku || sku.toUpperCase() === 'SKU') continue // skip header / blanks
    const row = {
      sku: '',
      store: '',
      roomId: '',
      shelf: '',
      itemCode: '',
      description: '',
      alias: '',
      pairCode: '',
      begin: 0,
      out: 0,
      remarks: '',
    }
    layout.forEach((key, i) => {
      if (!key) return
      const cell = (f[i] || '').trim()
      row[key] = NUMERIC.has(key) ? Number(cell) || 0 : cell
    })
    if (!row.sku) continue
    rows.push(row)
  }
  return rows
}

// The export is written in the order the page shows, so a sheet opened next to
// the app reads the same way down the row — store, room, shelf, then the names,
// then the counts. It can be, because it always writes a header and the reader
// maps by header when there is one (see COLUMN_KEYS). The POSITIONAL order is a
// different thing and stays where it is: it is for a headerless paste out of
// the original workbook, whose columns have not moved.
export const CSV_COLUMNS = [
  ['SKU', (i) => i.sku],
  ['Store', (i) => i.store],
  ['Room ID', (i) => i.roomId],
  ['Shelf', (i) => i.shelf],
  ['Item Code', (i) => i.itemCode],
  ['Description', (i) => i.description],
  ['Alias', (i) => i.alias],
  ['Model Code', (i) => i.pairCode],
  ['Begin', (i) => i.begin],
  ['Out', (i) => i.out],
  ['Avail', (i) => i.avail],
  ['Remarks', (i) => i.remarks],
]
