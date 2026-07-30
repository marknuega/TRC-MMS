import { useState } from 'react'
import { CATEGORIES } from './options'

// Add / edit / delete the dropdown option lists. Changes are pushed up via
// onChange(categoryKey, newList); the parent persists them to the backend.
export default function ManageInputs({ options, onChange }) {
  const [open, setOpen] = useState(false)
  const [cat, setCat] = useState(CATEGORIES[0].key)
  const [newValue, setNewValue] = useState('')
  const [editIndex, setEditIndex] = useState(-1)
  const [editValue, setEditValue] = useState('')
  const [notice, setNotice] = useState('')

  const list = options[cat] ?? []
  const exists = (value, exceptIndex = -1) =>
    list.some((v, i) => i !== exceptIndex && v.toLowerCase() === value.toLowerCase())

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
    onChange(cat, [...list, value])
    setNewValue('')
  }

  function startEdit(i) {
    setEditIndex(i)
    setEditValue(list[i])
  }

  function saveEdit() {
    const value = editValue.trim()
    if (!value) return
    if (exists(value, editIndex)) {
      flash(`"${value}" is already in the list.`)
      return
    }
    onChange(cat, list.map((v, i) => (i === editIndex ? value : v)))
    setEditIndex(-1)
    setEditValue('')
  }

  function remove(i) {
    onChange(cat, list.filter((_, idx) => idx !== i))
    if (editIndex === i) setEditIndex(-1)
  }

  return (
    <section className="manage">
      <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>⚙️ Manage inputs</span>
        <span className="chev">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="manage-body">
          <p className="manage-hint">
            Add, rename, or remove the choices that appear in the dropdowns. Changes save automatically and apply
            everywhere. Existing entries keep whatever value they were saved with.
          </p>

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
                  placeholder="Type a value and press Add"
                />
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
              <li key={`${value}-${i}`}>
                {editIndex === i ? (
                  <>
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
                      autoFocus
                    />
                    <div className="manage-item-actions">
                      <button type="button" onClick={saveEdit}>Save</button>
                      <button type="button" className="ghost" onClick={() => setEditIndex(-1)}>Cancel</button>
                      {/* Delete lives inside Edit so it can't be hit by accident. */}
                      <button type="button" className="danger" onClick={() => remove(i)}>Delete</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span>{value}</span>
                    <div className="manage-item-actions">
                      <button type="button" className="ghost" onClick={() => startEdit(i)}>Edit</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
