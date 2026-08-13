import { useState } from 'react'
import {
  BASE_CODE_RE,
  CATEGORIES,
  CHART_TOGGLES,
  issueBase,
  issueCode,
  issueDesc,
  issueDevice,
  issueName,
  materialName,
  materialDesc,
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
  const [newDevice, setNewDevice] = useState('')
  const [newBase, setNewBase] = useState('')
  const [editIndex, setEditIndex] = useState(-1)
  const [editValue, setEditValue] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDevice, setEditDevice] = useState('')
  const [editBase, setEditBase] = useState('')
  const [notice, setNotice] = useState('')

  // The device letters come from the live code map, so the Type offered here is
  // exactly the Type the decoder will read out of an incoming code.
  const { map } = useCodeMap()
  const devices = map?.equipmentCodes ?? FALLBACK.equipmentCodes

  // Materials carry a Description, Issue types a Type + base code + Description;
  // every other list is a plain string.
  const isMaterials = cat === 'materials'
  const isIssues = cat === 'issueTypes'
  const hasDesc = isMaterials || isIssues
  const list = options[cat] ?? []
  const nameOf = (v) => (isMaterials ? materialName(v) : isIssues ? issueName(v) : String(v))
  const descOf = (v) => (isMaterials ? materialDesc(v) : isIssues ? issueDesc(v) : '')
  const makeItem = (name, desc, device, base) => {
    if (isIssues) {
      return { name, device: device.trim().toUpperCase(), base: base.trim().toUpperCase(), description: desc.trim() }
    }
    return isMaterials ? { name, description: desc.trim() } : name
  }
  const exists = (value, exceptIndex = -1) =>
    list.some((v, i) => i !== exceptIndex && nameOf(v).toLowerCase() === value.toLowerCase())

  // What is wrong with a Type + base code pair, or '' when it is usable. Both
  // halves or neither: half a code decodes to nothing, so storing one is a trap.
  function codeProblem(device, base, exceptIndex = -1) {
    if (!isIssues) return ''
    const d = device.trim().toUpperCase()
    const b = base.trim().toUpperCase()
    if (!d && !b) return ''
    if (!d) return 'Pick the device Type for this code, or clear the base code.'
    if (!b) return 'Add the base code (2 digits + 1 letter, e.g. 43A), or clear the Type.'
    if (!BASE_CODE_RE.test(b)) return `"${b}" is not a base code — it must be 2 digits then 1 letter, e.g. 43A.`
    const code = d + b
    const clash = list.findIndex((v, i) => i !== exceptIndex && issueCode(v) === code)
    if (clash >= 0) return `${code} is already used by "${nameOf(list[clash])}".`
    return ''
  }

  // What the code map already reads a base code as, e.g. 43A -> "43 Side Grip
  // · A Original". Shown while typing so a code that is about to be claimed for
  // something else is visible BEFORE it starts decoding that way.
  function codeMapHint(base) {
    const b = base.trim().toUpperCase()
    if (!BASE_CODE_RE.test(b)) return ''
    const part = (map?.components ?? FALLBACK.components)[b.slice(0, 2)]
    const variant = variantsOf(map)[b.slice(2)]
    if (!part) return 'New part number — nothing in the code map uses it yet.'
    return `Code map: ${b.slice(0, 2)} = ${part}${variant ? ` · ${b.slice(2)} = ${variant.label}` : ''}`
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
    const problem = codeProblem(newDevice, newBase)
    if (problem) {
      flash(problem)
      return
    }
    onChange(cat, [...list, makeItem(value, newDesc, newDevice, newBase)])
    setNewValue('')
    setNewDesc('')
    setNewBase('')
    // The device is deliberately kept — issue types are usually added in runs
    // for the same radio.
  }

  function startEdit(i) {
    setEditIndex(i)
    setEditValue(nameOf(list[i]))
    setEditDesc(descOf(list[i]))
    setEditDevice(isIssues ? issueDevice(list[i]) : '')
    setEditBase(isIssues ? issueBase(list[i]) : '')
  }

  function saveEdit() {
    const value = editValue.trim()
    if (!value) return
    if (exists(value, editIndex)) {
      flash(`"${value}" is already in the list.`)
      return
    }
    const problem = codeProblem(editDevice, editBase, editIndex)
    if (problem) {
      flash(problem)
      return
    }
    onChange(cat, list.map((v, i) => (i === editIndex ? makeItem(value, editDesc, editDevice, editBase) : v)))
    setEditIndex(-1)
    setEditValue('')
    setEditDesc('')
    setEditDevice('')
    setEditBase('')
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

          <div className="manage-links touch-only">
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
                  // The extra fields belong to the category that showed them.
                  setNewDesc('')
                  setNewDevice('')
                  setNewBase('')
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
                  placeholder={isMaterials ? 'Material name' : isIssues ? 'Issue name' : 'Type a value and press Add'}
                />
                {isIssues && (
                  <>
                    <select
                      className="code-device"
                      value={newDevice}
                      onChange={(e) => setNewDevice(e.target.value)}
                      title="Device type — the first character of the CDS code"
                    >
                      <option value="">Type</option>
                      {Object.entries(devices).map(([letter, name]) => (
                        <option key={letter} value={letter}>
                          {letter} — {name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="code-base"
                      value={newBase}
                      onChange={(e) => setNewBase(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                      placeholder="43A"
                      maxLength={3}
                      title="Base code — 2 digits then 1 letter"
                    />
                  </>
                )}
                {hasDesc && (
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
              An issue type can own a CDS code: pick the device <strong>Type</strong> and give it a{' '}
              <strong>base code</strong> of 2 digits + 1 letter. Together they make the 4-character code the
              decoder reads — <code>H</code> + <code>43A</code> = <code>H43A</code>. The trailing letter is part
              of the part's identity, not a build, so <code>H99A</code> can be the Charger-818 and{' '}
              <code>H99B</code> the Charger-DEY. Leave both blank for an issue that has no code.
              {newBase.trim() && <span className="manage-code-hint"> {codeMapHint(newBase)}</span>}
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
                        placeholder={isMaterials ? 'Material name' : isIssues ? 'Issue name' : undefined}
                        autoFocus
                      />
                      {isIssues && (
                        <>
                          <select
                            className="edit-input code-device"
                            value={editDevice}
                            onChange={(e) => setEditDevice(e.target.value)}
                            title="Device type — the first character of the CDS code"
                          >
                            <option value="">Type</option>
                            {Object.entries(devices).map(([letter, name]) => (
                              <option key={letter} value={letter}>
                                {letter} — {name}
                              </option>
                            ))}
                          </select>
                          <input
                            className="edit-input code-base"
                            value={editBase}
                            onChange={(e) => setEditBase(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                saveEdit()
                              }
                              if (e.key === 'Escape') setEditIndex(-1)
                            }}
                            placeholder="43A"
                            maxLength={3}
                            title="Base code — 2 digits then 1 letter"
                          />
                        </>
                      )}
                      {hasDesc && (
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
                      {nameOf(value)}
                      {hasDesc && descOf(value) && <span className="manage-item-desc">{descOf(value)}</span>}
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
