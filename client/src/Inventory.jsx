import { useEffect, useMemo, useState } from 'react'
import { getInventory, createInventory, updateInventory, deleteInventory, importInventory } from './api'

const BLANK = { sku: '', store: '', shelf: '', itemCode: '', begin: 0, out: 0, lowStock: 0, remarks: '' }

// Expected paste columns (Excel TSV / CSV), matching the inventory sheet:
// SKU, Store, Shelf, Item Code, Begin, Out, Avail(ignored), Remarks
function parsePaste(text) {
  const rows = []
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const f = line.includes('\t') ? line.split('\t') : line.split(',')
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

const isLow = (i) => i.lowStock > 0 && i.avail <= i.lowStock

export default function Inventory({ embedded = false }) {
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

  async function refresh() {
    try {
      setItems(await getInventory())
      setLoaded(true)
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => {
    if (open && !loaded) refresh()
  }, [open, loaded])

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
    setForm({ sku: it.sku, store: it.store, shelf: it.shelf, itemCode: it.itemCode, begin: it.begin, out: it.out, lowStock: it.lowStock, remarks: it.remarks })
    setEdit(it.id)
    setError(null)
  }
  async function save(e) {
    e.preventDefault()
    try {
      if (edit === 'new') await createInventory(form)
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
  async function doImport() {
    const rows = parsePaste(pasteText)
    if (!rows.length) {
      setError('No rows recognised — paste SKU, Store, Shelf, Item Code, Begin, Out, Avail, Remarks (tab-separated).')
      return
    }
    try {
      const r = await importInventory(rows)
      setNotice(`Imported: ${r.created} new, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped` : ''}.`)
      setPasteText('')
      setPasteOpen(false)
      setError(null)
      refresh()
      setTimeout(() => setNotice(''), 6000)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="inventory">
      {embedded ? (
        <h2 className="page-title">
          📦 Inventory {loaded && <span className="hint">({items.length}{lowCount ? ` · ${lowCount} low` : ''})</span>}
        </h2>
      ) : (
        <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>
            📦 Inventory {loaded && <span className="hint">({items.length}{lowCount ? ` · ${lowCount} low` : ''})</span>}
          </span>
          <span className="chev">{open ? '▲' : '▼'}</span>
        </button>
      )}

      {open && (
        <div className="inventory-body">
          {error && <p className="manage-notice">{error}</p>}
          {notice && <p className="saved-hint">✅ {notice}</p>}

          <div className="inv-toolbar">
            <select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Store filter">
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
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
            <button type="button" className="add-fault" onClick={() => setPasteOpen((o) => !o)}>
              📋 Import
            </button>
            <button type="button" className="btn-txt" onClick={() => downloadCsv('inventory.csv', filtered)} disabled={!filtered.length}>
              ⭳ CSV
            </button>
          </div>

          {pasteOpen && (
            <div className="paste-box">
              <p className="saved-hint">
                Paste rows (Excel = tab-separated): <strong>SKU, Store, Shelf, Item Code, Begin, Out, Avail, Remarks</strong>.
                Existing SKUs are updated, new ones added.
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
              <div className="inv-form-grid">
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
                      <td>
                        <button type="button" className="inv-edit" onClick={() => openEdit(i)}>
                          Edit
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
    </section>
  )
}
