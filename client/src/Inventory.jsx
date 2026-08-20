import { useEffect, useMemo, useState } from 'react'
import {
  getInventory,
  createInventory,
  updateInventory,
  deleteInventory,
  importInventory,
  getInventoryTxns,
} from './api'
import { COPYRIGHT_HTML } from './copyright'
import SearchSelect from './SearchSelect'
import { advanceOnEnter } from './focusNav'

const TYPE_LABEL = { usage: 'Usage', adjustment: 'Adjustment', import: 'Import' }
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
const signed = (n) => (n > 0 ? `+${n}` : String(n))
const stamp = (d) => new Date(d).toLocaleString('en-GB')

const BLANK = { sku: '', store: '', shelf: '', itemCode: '', begin: 0, out: 0, lowStock: 0, remarks: '' }

// Tab if the data actually uses tabs (an Excel copy-paste), else comma. Decided
// from the whole text, not the first line, because a leading header row can look
// tab-free while the rows below are not.
const pickDelimiter = (src) => (src.includes('\t') ? '\t' : ',')

// Full CSV/TSV reader: honours "quoted fields", which may themselves contain the
// delimiter, a newline, or a doubled "" escape. This is the dialect Excel writes
// AND the one downloadCsv below emits, so an Export → Import round-trip only
// survives a remark like `BATTERY, 8 PCS` if the quotes are respected. A naive
// split on "," silently shifts every column after such a field.
function parseDelimited(text) {
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
// SKU, Store, Shelf, Item Code, Begin, Out, Avail(ignored — it is derived), Remarks
function parsePaste(text) {
  const rows = []
  for (const f of parseDelimited(text)) {
    const sku = (f[0] || '').trim()
    if (!sku || sku.toUpperCase() === 'SKU') continue // skip header / blanks
    rows.push({
      sku,
      store: (f[1] || '').trim(),
      shelf: (f[2] || '').trim(),
      itemCode: (f[3] || '').trim(),
      begin: Number((f[4] || '').trim()) || 0,
      out: Number((f[5] || '').trim()) || 0,
      remarks: (f[7] || '').trim(),
    })
  }
  return rows
}

function downloadCsv(filename, items) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['SKU', 'Store', 'Shelf', 'Item Code', 'Begin', 'Out', 'Avail', 'Remarks']
  const lines = [head.map(esc).join(',')]
  for (const i of items) {
    lines.push([i.sku, i.store, i.shelf, i.itemCode, i.begin, i.out, i.avail, i.remarks].map(esc).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportInventoryPdf(items, branch, store) {
  const w = window.open('', '_blank')
  if (!w) return
  const title = `TRC ${branch || 'All'} - Inventory`
  const scope = store ? ` · ${store}` : ''
  const head = ['SKU', 'Store', 'Shelf', 'Item Code', 'Begin', 'Out', 'Avail', 'Remarks']
  const body = items
    .map(
      (i) =>
        `<tr><td>${esc(i.sku)}</td><td>${esc(i.store)}</td><td>${esc(i.shelf)}</td><td>${esc(i.itemCode)}</td>` +
        `<td class="c">${esc(i.begin)}</td><td class="c">${esc(i.out)}</td><td class="c">${esc(i.avail)}</td><td>${esc(i.remarks)}</td></tr>`,
    )
    .join('')
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
      `<style>body{font-family:Arial,sans-serif;color:#111;margin:24px}h1{font-size:16px;margin:0 0 2px}p{margin:0 0 14px;color:#555;font-size:12px}` +
      `table{border-collapse:collapse;width:100%;font-size:10.5px}th,td{border:1px solid #999;padding:4px 6px;text-align:left}` +
      `th{background:#dfe3ee}td.c,th.c{text-align:center}tfoot{color:#777}` +
      `@media print{tr{page-break-inside:avoid}}</style></head><body>` +
      `<h1>${esc(title)}</h1><p>${esc(scope)} · ${items.length} item${items.length === 1 ? '' : 's'} · printed ${esc(stamp(Date.now()))}</p>` +
      `<table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>` +
      `<p style="margin-top:14px">${COPYRIGHT_HTML}</p>` +
      `</body></html>`,
  )
  w.document.close()
  w.focus()
  w.print()
}

const isLow = (i) => i.lowStock > 0 && i.avail <= i.lowStock

export default function Inventory({ embedded = false, branch = '', region = '' }) {
  const [items, setItems] = useState([])
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [loaded, setLoaded] = useState(false)
  const [store, setStore] = useState('')
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState(null) // null | 'new' | id
  const [form, setForm] = useState(BLANK)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [hist, setHist] = useState(null) // { item, txns } — transaction-history modal

  async function openHistory(item) {
    setHist({ item, txns: null })
    try {
      setHist({ item, txns: await getInventoryTxns(item.id) })
    } catch (e) {
      setError(e.message)
      setHist(null)
    }
  }

  function histRows(h) {
    return (h.txns ?? []).map((t, i) => [
      i + 1,
      stamp(t.createdAt),
      TYPE_LABEL[t.type] || t.type,
      signed(t.change),
      t.availAfter,
      t.reference,
      t.branch,
      t.material,
    ])
  }

  function exportHistExcel(h) {
    const b = 'border:1px solid #999;padding:4px;'
    const hb = `${b}background:#dfe3ee;font-weight:bold;text-align:center;`
    const head = ['#', 'Date', 'Type', 'Change', 'Avail', 'Reference', 'Branch', 'Material']
    let html = `<meta charset="utf-8"><table style="border-collapse:collapse;font-family:Arial;font-size:11px;">`
    html += `<tr><td colspan="8" style="${b}background:#2563eb;color:#fff;font-weight:bold;font-size:14px;">Transaction history — ${esc(h.item.sku)} · ${esc(h.item.itemCode)}</td></tr>`
    if (h.item.remarks)
      html += `<tr><td colspan="8" style="${b}background:#eef2ff;"><b>Remarks:</b> ${esc(h.item.remarks)}</td></tr>`
    html += `<tr>${head.map((x) => `<th style="${hb}">${esc(x)}</th>`).join('')}</tr>`
    for (const r of histRows(h))
      html += `<tr>${r.map((c, i) => `<td style="${b}${i === 0 || (i >= 3 && i <= 4) ? 'text-align:center;' : ''}">${esc(c)}</td>`).join('')}</tr>`
    html += '</table>'
    const url = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/vnd.ms-excel;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `Inventory-History-${h.item.sku}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportHistPdf(h) {
    const w = window.open('', '_blank')
    if (!w) return
    const head = ['#', 'Date', 'Type', 'Change', 'Avail', 'Reference', 'Branch', 'Material']
    const body = histRows(h)
      .map(
        (r) =>
          `<tr>${r.map((c, i) => `<td class="${i === 0 || (i >= 3 && i <= 4) ? 'c' : ''}">${esc(c)}</td>`).join('')}</tr>`,
      )
      .join('')
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Inventory History ${esc(h.item.sku)}</title>` +
        `<style>body{font-family:Arial,sans-serif;color:#111;margin:24px}h1{font-size:16px;margin:0 0 2px}p{margin:0 0 14px;color:#555;font-size:12px}` +
        `table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #999;padding:5px 7px;text-align:left}` +
        `th{background:#dfe3ee}td.c{text-align:center}tfoot{color:#777}</style></head><body>` +
        `<h1>Transaction history — ${esc(h.item.sku)}</h1><p>${esc(h.item.itemCode)} · printed ${esc(stamp(Date.now()))}</p>` +
        (h.item.remarks ? `<p style="margin:-8px 0 14px;color:#111"><b>Remarks:</b> ${esc(h.item.remarks)}</p>` : '') +
        `<table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>` +
        `<p style="margin-top:14px">${COPYRIGHT_HTML}</p>` +
        `</body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }

  async function refresh() {
    try {
      setItems(await getInventory(branch, region))
      setLoaded(true)
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => {
    if (open && !loaded) refresh()
  }, [open, loaded])
  // Admin switching the branch OR region selector re-scopes the list. Region
  // matters even when the branch has not changed: "all branches" under a region
  // is that region's stock only, and stale rows from outside it would be listed
  // and totalled as if they were the region's own.
  useEffect(() => {
    if (open) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, region])

  const stores = useMemo(() => [...new Set(items.map((i) => i.store).filter(Boolean))].sort(), [items])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(
      (i) =>
        (!store || i.store === store) &&
        (!q || `${i.sku} ${i.store} ${i.shelf} ${i.itemCode} ${i.remarks}`.toLowerCase().includes(q)),
    )
  }, [items, store, search])
  const lowCount = useMemo(() => items.filter(isLow).length, [items])

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: ['begin', 'out', 'lowStock'].includes(k) ? Number(e.target.value) : e.target.value }))

  function openAdd() {
    setForm(BLANK)
    setEdit('new')
    setError(null)
  }
  function openEdit(it) {
    setForm({
      sku: it.sku,
      store: it.store,
      shelf: it.shelf,
      itemCode: it.itemCode,
      begin: it.begin,
      out: it.out,
      lowStock: it.lowStock,
      remarks: it.remarks,
    })
    setEdit(it.id)
    setError(null)
  }
  async function save(e) {
    e.preventDefault()
    try {
      if (edit === 'new') await createInventory({ ...form, branch })
      else await updateInventory(edit, form)
      setEdit(null)
      setError(null)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }
  async function remove() {
    if (!window.confirm(`Delete ${form.sku}?`)) return
    try {
      await deleteInventory(edit)
      setEdit(null)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }
  // Shared by both import routes (pasted text and a picked .csv file) so the two
  // can never drift apart in how they parse or report.
  async function importText(text, source) {
    const rows = parsePaste(text)
    if (!rows.length) {
      setError(`No rows recognised in ${source} — expected SKU, Store, Shelf, Item Code, Begin, Out, Avail, Remarks.`)
      return
    }
    try {
      const r = await importInventory(rows, branch)
      setNotice(
        `Imported ${rows.length} row${rows.length === 1 ? '' : 's'} from ${source}: ${r.created} new, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped` : ''}.`,
      )
      setPasteText('')
      setPasteOpen(false)
      setError(null)
      refresh()
      setTimeout(() => setNotice(''), 6000)
    } catch (err) {
      setError(err.message)
    }
  }

  const doImport = () => importText(pasteText, 'the pasted rows')

  async function importFile(e) {
    const file = e.target.files?.[0]
    // Reset first: picking the SAME file twice in a row fires no change event
    // otherwise, which looks like a broken button.
    e.target.value = ''
    if (!file) return
    try {
      await importText(await file.text(), file.name)
    } catch {
      setError('Could not read that file — pick a .csv or .txt export.')
    }
  }

  return (
    <section className="inventory">
      {embedded ? (
        <h2 className="page-title">
          📦 Inventory{' '}
          {loaded && (
            <span className="hint">
              ({items.length}
              {lowCount ? ` · ${lowCount} low` : ''})
            </span>
          )}
        </h2>
      ) : (
        <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>
            📦 Inventory{' '}
            {loaded && (
              <span className="hint">
                ({items.length}
                {lowCount ? ` · ${lowCount} low` : ''})
              </span>
            )}
          </span>
          <span className="chev">{open ? '▲' : '▼'}</span>
        </button>
      )}

      {open && (
        <div className="inventory-body">
          {error && <p className="manage-notice">{error}</p>}
          {notice && <p className="saved-hint">✅ {notice}</p>}

          <div className="inv-toolbar">
            <SearchSelect
              value={store}
              onChange={(e) => setStore(e.target.value)}
              options={[{ value: '', label: 'All stores' }, ...stores]}
              ariaLabel="Store filter"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔎 Search SKU, item, remarks…"
              className="inv-search"
            />
            <button type="button" className="submit" onClick={openAdd}>
              + Add item
            </button>
            {/* CSV in, CSV out. The label on the file input is a <label>, not a
                button, because a hidden file input is the only way to style the
                browser's picker consistently with the rest of the toolbar. */}
            <label className="add-fault inv-file-btn">
              ⭱ Import CSV
              <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={importFile} />
            </label>
            <button type="button" className="add-fault" onClick={() => setPasteOpen((o) => !o)}>
              📋 Paste
            </button>
            <button
              type="button"
              className="btn-txt"
              onClick={() =>
                downloadCsv(`inventory-${branch || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, filtered)
              }
              disabled={!filtered.length}
            >
              ⭳ Export CSV
            </button>
            <button
              type="button"
              className="btn-pdf"
              onClick={() => exportInventoryPdf(filtered, branch, store)}
              disabled={!filtered.length}
            >
              ⭳ Export PDF
            </button>
          </div>

          {pasteOpen && (
            <div className="paste-box">
              <p className="saved-hint">
                Paste rows (Excel = tab-separated):{' '}
                <strong>SKU, Store, Shelf, Item Code, Begin, Out, Avail, Remarks</strong>. Existing SKUs are updated,
                new ones added.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder={'X1-MAKKAH-1121\tX1 - MAKKAH\t\tBLN-10 BATTERY 1590 MAH 8 PCS - HT9980AA\t88\t0\t88\t'}
              />
              <div className="paste-actions">
                <button type="button" className="submit" onClick={doImport} disabled={!pasteText.trim()}>
                  Import
                </button>
                <button type="button" className="add-fault" onClick={() => setPasteOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {edit !== null && (
            <form className="inv-form" onSubmit={save}>
              <h3>{edit === 'new' ? 'Add item' : `Edit ${form.sku}`}</h3>
              {/* Enter steps through the fields; the last one saves. */}
              <div className="inv-form-grid" onKeyDown={(e) => advanceOnEnter(e, save)}>
                <label>
                  SKU
                  <input value={form.sku} onChange={set('sku')} required />
                </label>
                <label>
                  Store
                  <input value={form.store} onChange={set('store')} list="inv-stores" />
                </label>
                <label>
                  Shelf
                  <input value={form.shelf} onChange={set('shelf')} />
                </label>
                <label className="wide">
                  Item Code
                  <input value={form.itemCode} onChange={set('itemCode')} />
                </label>
                <label>
                  Begin
                  <input type="number" min="0" value={form.begin} onChange={set('begin')} />
                </label>
                <label>
                  Out
                  <input type="number" min="0" value={form.out} onChange={set('out')} />
                </label>
                <label>
                  Low-stock at
                  <input type="number" min="0" value={form.lowStock} onChange={set('lowStock')} />
                </label>
                <label className="wide">
                  Remarks
                  <input value={form.remarks} onChange={set('remarks')} />
                </label>
              </div>
              <div className="inv-form-actions">
                <button type="submit" className="submit">
                  Save
                </button>
                <button type="button" className="add-fault" onClick={() => setEdit(null)}>
                  Cancel
                </button>
                {edit !== 'new' && (
                  <button type="button" className="clear-all" onClick={remove}>
                    Delete
                  </button>
                )}
              </div>
            </form>
          )}

          <datalist id="inv-stores">
            {stores.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          {!loaded ? (
            <p className="empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="empty">No inventory yet — click “+ Add item” or “Import”.</p>
          ) : (
            <div className="inv-scroll">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Store</th>
                    <th>Shelf</th>
                    <th>Item Code</th>
                    <th className="num">Begin</th>
                    <th className="num">Out</th>
                    <th className="num">Avail</th>
                    <th>Remarks</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr key={i.id} className={isLow(i) ? 'low' : ''}>
                      <td className="nowrap">{i.sku}</td>
                      <td className="nowrap">{i.store}</td>
                      <td>{i.shelf}</td>
                      <td className="item">{i.itemCode}</td>
                      <td className="num">{i.begin}</td>
                      <td className="num">{i.out}</td>
                      <td className="num avail">{i.avail}</td>
                      <td className="rem">{i.remarks}</td>
                      <td className="inv-row-actions">
                        <button type="button" className="inv-hist" onClick={() => openHistory(i)}>
                          History
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={9} className="empty">
                        No items match the filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {hist && (
        <div className="modal-backdrop" onClick={() => setHist(null)}>
          <div className="modal hist-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Transaction history</h3>
                <p className="saved-hint">
                  {hist.item.sku} · {hist.item.itemCode}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setHist(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="hist-actions">
              <button
                type="button"
                className="submit"
                onClick={() => {
                  const item = hist.item
                  setHist(null)
                  openEdit(item)
                }}
              >
                ✎ Edit item
              </button>
              <button
                type="button"
                className="btn-txt"
                onClick={() => exportHistExcel(hist)}
                disabled={!hist.txns?.length}
              >
                ⭳ Excel
              </button>
              <button
                type="button"
                className="btn-pdf"
                onClick={() => exportHistPdf(hist)}
                disabled={!hist.txns?.length}
              >
                ⭳ PDF
              </button>
            </div>
            {hist.txns === null ? (
              <p className="empty">Loading…</p>
            ) : hist.txns.length === 0 ? (
              <p className="empty">
                No transactions yet — stock moves when a report/transmittal using this item is saved, or when you edit
                it.
              </p>
            ) : (
              <div className="inv-scroll">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="num">Change</th>
                      <th className="num">Avail</th>
                      <th>Reference</th>
                      <th>Branch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hist.txns.map((t, idx) => (
                      <tr key={t.id}>
                        <td className="num idx">{idx + 1}</td>
                        <td className="nowrap">{stamp(t.createdAt)}</td>
                        <td>{TYPE_LABEL[t.type] || t.type}</td>
                        <td className={`num ${t.change < 0 ? 'txn-out' : 'txn-in'}`}>{signed(t.change)}</td>
                        <td className="num avail">{t.availAfter}</td>
                        <td className="nowrap">{t.reference}</td>
                        <td>{t.branch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
