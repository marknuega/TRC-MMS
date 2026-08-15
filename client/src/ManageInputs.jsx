import { useState } from 'react'
import {
  CATEGORIES,
  CHART_TOGGLES,
  PARTS_RE,
  VARIANT_RE,
  TECH_ID_RE,
  issueCode,
  issueName,
  issueParts,
  issueVariant,
  materialName,
  materialDesc,
  technicianName,
  technicianId,
} from './options'
import { FALLBACK, useCodeMap, variantsOf } from './codes'

// Add / edit / delete the dropdown option lists. Changes are pushed up via
// onChange(categoryKey, newList); the parent persists them to the backend.
// onToggleChart(key, bool) flips a pie-chart's visibility.
export default function ManageInputs({ options, onChange, onToggleChart, embedded = false }) {
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [cat, setCat] = useState(CATEGORIES[0].key)
  const [newValue, setNewValue] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newParts, setNewParts] = useState('')
  const [newVariant, setNewVariant] = useState('')
  const [newId, setNewId] = useState('')
  const [editIndex, setEditIndex] = useState(-1)
  const [editValue, setEditValue] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editParts, setEditParts] = useState('')
  const [editVariant, setEditVariant] = useState('')
  const [editId, setEditId] = useState('')
  const [notice, setNotice] = useState('')

  // Only to describe what a code already means in the shared vocabulary — the
  // issue type itself carries no device.
  const { map } = useCodeMap()

  // Materials carry a separate Description; Issue types carry a parts code +
  // variant, and their description IS their name; every other list is a string.
  const isMaterials = cat === 'materials'
  const isIssues = cat === 'issueTypes'
  const isTechnicians = cat === 'technicians'
  const list = options[cat] ?? []
  const nameOf = (v) => (isMaterials ? materialName(v) : isIssues ? issueName(v) : isTechnicians ? technicianName(v) : String(v))
  const descOf = (v) => (isMaterials ? materialDesc(v) : '')
  const makeItem = (name, desc, parts, variant, id) => {
    if (isIssues) return { name, parts: parts.trim(), variant: variant.trim().toUpperCase() }
    if (isMaterials) return { name, description: desc.trim() }
    if (isTechnicians) return id.trim() ? { name, id: id.trim() } : name
    return name
  }
  const exists = (value, exceptIndex = -1) =>
    list.some((v, i) => i !== exceptIndex && nameOf(v).toLowerCase() === value.toLowerCase())

  // What is wrong with a technician ID, or '' when it is usable (or blank —
  // blank is allowed, for a technician who never files by WhatsApp).
  function techIdProblem(id, exceptIndex = -1) {
    if (!isTechnicians) return ''
    const v = id.trim()
    if (!v) return ''
    if (!TECH_ID_RE.test(v)) return `"${v}" is not a valid ID — digits only, e.g. 3.`
    const clash = list.findIndex((it, idx) => idx !== exceptIndex && technicianId(it) === v)
    if (clash >= 0) return `ID ${v} is already used by "${nameOf(list[clash])}".`
    return ''
  }

  // What is wrong with a parts + variant pair, or '' when it is usable. Both
  // halves or neither: half a code decodes to nothing, so storing one is a trap.
  function codeProblem(parts, variant, exceptIndex = -1) {
    if (!isIssues) return ''
    const p = parts.trim()
    const v = variant.trim().toUpperCase()
    if (!p && !v) return ''
    if (!p) return 'Add the Parts Code (2 digits, e.g. 19), or clear the Variant.'
    if (!v) return 'Add the Variant (1 letter, e.g. B), or clear the Parts Code.'
    if (!PARTS_RE.test(p)) return `"${p}" is not a parts code — it must be exactly 2 digits, e.g. 19.`
    if (!VARIANT_RE.test(v)) return `"${v}" is not a variant — it must be a single letter, e.g. B.`
    const code = p + v
    const clash = list.findIndex((i, idx) => idx !== exceptIndex && issueCode(i) === code)
    if (clash >= 0) return `${code} is already used by "${nameOf(list[clash])}".`
    return ''
  }

  // What the code map already reads a code as, e.g. 19 + B -> "19 Fistmic · B
  // 3D". Shown while typing so a code about to be claimed for something else is
  // visible BEFORE it starts decoding that way.
  function codeMapHint(parts, variant) {
    const p = parts.trim()
    if (!PARTS_RE.test(p)) return ''
    const part = (map?.components ?? FALLBACK.components)[p]
    const v = variantsOf(map)[variant.trim().toUpperCase()]
    if (!part) return 'New parts number — nothing in the code map uses it yet.'
    return `Code map: ${p} = ${part}${v ? ` · ${variant.trim().toUpperCase()} = ${v.label}` : ''}`
  }

  function flash(msg) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 4000)
  }

  function add() {
    const value = newValue.trim()
    if (!value) return
    if (exists(value)) {
      flash(`"${value}" is already in the list.`)
      return
    }
    const problem = codeProblem(newParts, newVariant) || techIdProblem(newId)
    if (problem) {
      flash(problem)
      return
    }
    onChange(cat, [...list, makeItem(value, newDesc, newParts, newVariant, newId)])
    setNewValue('')
    setNewDesc('')
    setNewParts('')
    setNewVariant('')
    setNewId('')
  }

  function startEdit(i) {
    setEditIndex(i)
    setEditValue(nameOf(list[i]))
    setEditDesc(descOf(list[i]))
    setEditParts(isIssues ? issueParts(list[i]) : '')
    setEditVariant(isIssues ? issueVariant(list[i]) : '')
    setEditId(isTechnicians ? technicianId(list[i]) : '')
  }

  function saveEdit() {
    const value = editValue.trim()
    if (!value) return
    if (exists(value, editIndex)) {
      flash(`"${value}" is already in the list.`)
      return
    }
    const problem = codeProblem(editParts, editVariant, editIndex) || techIdProblem(editId, editIndex)
    if (problem) {
      flash(problem)
      return
    }
    onChange(cat, list.map((v, i) => (i === editIndex ? makeItem(value, editDesc, editParts, editVariant, editId) : v)))
    setEditIndex(-1)
    setEditValue('')
    setEditDesc('')
    setEditParts('')
    setEditVariant('')
    setEditId('')
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


          <div className="manage-controls">
            <label>
              Category
              <select
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value)
                  setEditIndex(-1)
                  // The extra fields belong to the category that showed them.
                  setNewDesc('')
                  setNewParts('')
                  setNewVariant('')
                  setNewId('')
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label} ({(options[c.key] ?? []).length})
                  </option>
                ))}
              </select>
            </label>
            {/* Each field is its own label — one "Add new" over a row of boxes
                left you guessing which box was which. */}
            {isIssues && (
              <>
                <label className="field-code">
                  Parts Code
                  <input
                    value={newParts}
                    onChange={(e) => setNewParts(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                    placeholder="19"
                    inputMode="numeric"
                    title="The component number — exactly 2 digits, e.g. 19"
                  />
                </label>
                <label className="field-code">
                  Variant
                  <input
                    value={newVariant}
                    onChange={(e) => setNewVariant(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                    placeholder="B"
                    title="Which build or version of that part — 1 letter, e.g. B"
                  />
                </label>
              </>
            )}
            {isTechnicians && (
              <label className="field-code">
                ID
                <input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                  placeholder="1"
                  inputMode="numeric"
                  title="The number this technician texts as the last part of a WhatsApp report, e.g. 1. Optional."
                />
              </label>
            )}
            <label className="grow">
              {isIssues ? 'Description' : isMaterials ? 'Material name' : isTechnicians ? 'Technician name' : 'Add new'}
              <div className="add-row">
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                  placeholder={
                    isIssues
                      ? 'Belt Clip'
                      : isMaterials
                        ? 'Material name'
                        : isTechnicians
                          ? 'Muhammad Amir'
                          : 'Type a value and press Add'
                  }
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

          {isIssues && (
            <p className="manage-hint">
              The <strong>Description</strong> is the issue type — it is what gets written on the entry. Give it a{' '}
              <strong>Parts Code</strong> (2 digits) and a <strong>Variant</strong> (1 letter) and the decoder
              resolves that fault straight to it: <code>19</code> + <code>B</code> = <code>19B</code>. No device
              here — the technician's code supplies that, so <code>H19B</code> and <code>T19B</code> both land on
              this one entry. The variant is part of the part's identity, not just a build, so two variants of
              one parts number can be two genuinely different items rather than two builds of one. Leave both
              blank for an issue with no code.
            </p>
          )}
          {isTechnicians && (
            <p className="manage-hint">
              The <strong>ID</strong> is the number a technician types as the LAST part of a WhatsApp fault report
              to identify themselves — e.g. ending a report in <code>1</code> files it under whoever has ID 1
              here. Leave it blank for a technician who only appears in the app's own dropdowns. An ID set here{' '}
              <strong>outranks</strong> the same ID in Code Map's older Technician IDs list, so moving one over is
              a safe, incremental edit.
            </p>
          )}
          {isIssues && (
            <p className="manage-hint">
              A code given here <strong>outranks</strong> the Parts Numbers and Variants lists in{' '}
              <strong>Code Map</strong>: where a claim exists, those are not consulted at all. That is what makes
              this the place to define a code, and Code Map the place for the shared vocabulary underneath it.
              Everything claimed here appears on the <strong>Code Reference</strong> under{' '}
              <em>Claimed Codes</em>, which is what technicians read.
              {newParts.trim() && (
                <span className="manage-code-hint"> {codeMapHint(newParts, newVariant)}</span>
              )}
            </p>
          )}

          {notice && <p className="manage-notice">{notice}</p>}

          <ul className="manage-list">
            {list.length === 0 && <li className="manage-empty">No values yet — add one above.</li>}
            {list.map((value, i) => (
              <li key={`${nameOf(value)}-${i}`}>
                {editIndex === i ? (
                  <>
                    <div className="edit-fields">
                      {isIssues && (
                        <div className="edit-code-row">
                          <label className="field-code">
                            Parts Code
                            <input
                              className="edit-input"
                              value={editParts}
                              onChange={(e) => setEditParts(e.target.value.replace(/\D/g, '').slice(0, 2))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  saveEdit()
                                }
                                if (e.key === 'Escape') setEditIndex(-1)
                              }}
                              placeholder="19"
                              inputMode="numeric"
                            />
                          </label>
                          <label className="field-code">
                            Variant
                            <input
                              className="edit-input"
                              value={editVariant}
                              onChange={(e) =>
                                setEditVariant(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase())
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  saveEdit()
                                }
                                if (e.key === 'Escape') setEditIndex(-1)
                              }}
                              placeholder="B"
                            />
                          </label>
                        </div>
                      )}
                      {isTechnicians && (
                        <label className="field-code">
                          ID
                          <input
                            className="edit-input"
                            value={editId}
                            onChange={(e) => setEditId(e.target.value.replace(/\D/g, ''))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                saveEdit()
                              }
                              if (e.key === 'Escape') setEditIndex(-1)
                            }}
                            placeholder="1"
                            inputMode="numeric"
                          />
                        </label>
                      )}
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
                        placeholder={
                          isMaterials ? 'Material name' : isIssues ? 'Description' : isTechnicians ? 'Technician name' : undefined
                        }
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
                      {isIssues && issueCode(value) && (
                        <span className="manage-item-code">{issueCode(value)}</span>
                      )}
                      {isTechnicians && technicianId(value) && (
                        <span className="manage-item-code">{technicianId(value)}</span>
                      )}
                      {nameOf(value)}
                      {isMaterials && descOf(value) && <span className="manage-item-desc">{descOf(value)}</span>}
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
