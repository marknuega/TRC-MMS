import { useState } from 'react'
import { CATEGORIES, CHART_TOGGLES, materialName, materialDesc } from './options'

// Add / edit / delete the dropdown option lists. Changes are pushed up via
// onChange(categoryKey, newList); the parent persists them to the backend.
// onToggleChart(key, bool) flips a pie-chart's visibility.
export default function ManageInputs({ options, onChange, onToggleChart, embedded = false }) {
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [cat, setCat] = useState(CATEGORIES[0].key)
  const [newValue, setNewValue] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editIndex, setEditIndex] = useState(-1)
  const [editValue, setEditValue] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [notice, setNotice] = useState('')

  // Materials carry an extra Description; every other list is a plain string.
  const isMaterials = cat === 'materials'
  const list = options[cat] ?? []
  const nameOf = (v) => (isMaterials ? materialName(v) : String(v))
  const makeItem = (name, desc) => (isMaterials ? { name, description: desc.trim() } : name)
  const exists = (value, exceptIndex = -1) =>
    list.some((v, i) => i !== exceptIndex && nameOf(v).toLowerCase() === value.toLowerCase())

  function flash(msg) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }

  function add() {
    const value = newValue.trim()
    if (!value) return
    if (exists(value)) {
      flash(`"${value}" is already in the list.`)
      return
    }
    onChange(cat, [...list, makeItem(value, newDesc)])
    setNewValue('')
    setNewDesc('')
  }

  function startEdit(i) {
    setEditIndex(i)
    setEditValue(nameOf(list[i]))
    setEditDesc(isMaterials ? materialDesc(list[i]) : '')
  }

  function saveEdit() {
    const value = editValue.trim()
    if (!value) return
    if (exists(value, editIndex)) {
      flash(`"${value}" is already in the list.`)
      return
    }
    onChange(cat, list.map((v, i) => (i === editIndex ? makeItem(value, editDesc) : v)))
    setEditIndex(-1)
    setEditValue('')
    setEditDesc('')
  }

  function remove(i) {
    onChange(cat, list.filter((_, idx) => idx !== i))
    if (editIndex === i) setEditIndex(-1)
  }

  return (
    <section className="manage">
      {embedded ? (
        <h2 className="page-title">⚙️ Manage inputs</h2>
      ) : (
        <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>⚙️ Manage inputs</span>
          <span className="chev">{open ? '▲' : '▼'}</span>
        </button>
      )}

      {open && (
        <div className="manage-body">
          <p className="manage-hint">
            Add, rename, or remove the choices that appear in the dropdowns. Changes save automatically and apply
            everywhere. Existing entries keep whatever value they were saved with.
          </p>

          <div className="manage-links">
            <a
              className="manage-link-btn"
              href="https://trcmmswhatsapp-production.up.railway.app/admin.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              🔗 WhatsApp Code Map Admin
            </a>
          </div>

          <div className="manage-controls">
            <label>
              Category
              <select
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value)
                  setEditIndex(-1)
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label} ({(options[c.key] ?? []).length})
                  </option>
                ))}
              </select>
            </label>
            <label className="grow">
              Add new
              <div className="add-row">
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                  placeholder={isMaterials ? 'Material name' : 'Type a value and press Add'}
                />
                {isMaterials && (
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                    placeholder="Description (optional)"
                  />
                )}
                <button type="button" onClick={add} disabled={!newValue.trim()}>
                  Add
                </button>
              </div>
            </label>
          </div>

          {notice && <p className="manage-notice">{notice}</p>}

          <ul className="manage-list">
            {list.length === 0 && <li className="manage-empty">No values yet — add one above.</li>}
            {list.map((value, i) => (
              <li key={`${nameOf(value)}-${i}`}>
                {editIndex === i ? (
                  <>
                    <div className="edit-fields">
                      <input
                        className="edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveEdit()
                          }
                          if (e.key === 'Escape') setEditIndex(-1)
                        }}
                        placeholder={isMaterials ? 'Material name' : undefined}
                        autoFocus
                      />
                      {isMaterials && (
                        <input
                          className="edit-input"
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEdit()
                            }
                            if (e.key === 'Escape') setEditIndex(-1)
                          }}
                          placeholder="Description (optional)"
                        />
                      )}
                    </div>
                    <div className="manage-item-actions">
                      <button type="button" onClick={saveEdit}>Save</button>
                      <button type="button" className="ghost" onClick={() => setEditIndex(-1)}>Cancel</button>
                      {/* Delete lives inside Edit so it can't be hit by accident. */}
                      <button type="button" className="danger" onClick={() => remove(i)}>Delete</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="manage-item-label">
                      {nameOf(value)}
                      {isMaterials && materialDesc(value) && (
                        <span className="manage-item-desc">{materialDesc(value)}</span>
                      )}
                    </span>
                    <div className="manage-item-actions">
                      <button type="button" className="ghost" onClick={() => startEdit(i)}>Edit</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          {onToggleChart && (
            <div className="manage-charts">
              <h3 className="manage-charts-h">Charts</h3>
              <p className="manage-hint">Show or hide the pie charts on the Dashboard and Spare Parts pages.</p>
              <ul className="chart-toggle-list">
                {CHART_TOGGLES.map(({ key, label }) => {
                  const on = (options.charts ?? {})[key] !== false
                  return (
                    <li key={key}>
                      <label className="chart-toggle">
                        <input type="checkbox" checked={on} onChange={(e) => onToggleChart(key, e.target.checked)} />
                        <span>{label}</span>
                      </label>
                      <span className={`chart-toggle-state ${on ? 'on' : 'off'}`}>{on ? 'Shown' : 'Hidden'}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
