import { useState } from 'react'
import {
  CATEGORIES,
  CHART_TOGGLES,
  PARTS_RE,
  VARIANT_RE,
  TECH_ID_RE,
  TECH_INITIALS2_RE,
  TECH_INITIALS3_RE,
  issueCode,
  issueName,
  issueParts,
  issueVariant,
  materialName,
  materialDesc,
  technicianName,
  technicianId,
  technicianInitials2,
  technicianInitials3,
} from './options'
import { FALLBACK, useCodeMap } from './codes'
import SearchSelect from './SearchSelect'
import { advanceOnEnter } from './focusNav'

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
  const [newInitials2, setNewInitials2] = useState('')
  const [newInitials3, setNewInitials3] = useState('')
  const [editIndex, setEditIndex] = useState(-1)
  const [editValue, setEditValue] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editParts, setEditParts] = useState('')
  const [editVariant, setEditVariant] = useState('')
  const [editId, setEditId] = useState('')
  const [editInitials2, setEditInitials2] = useState('')
  const [editInitials3, setEditInitials3] = useState('')
  const [notice, setNotice] = useState('')
  // Which field the current notice is about, so it can be outlined in red
  // rather than leaving the reader to match a message to a box themselves.
  const [noticeField, setNoticeField] = useState('')

  // Only to describe what a code already means in the shared vocabulary — the
  // issue type itself carries no device.
  const { map } = useCodeMap()

  // Materials carry a separate Description; Issue types carry a parts code +
  // variant, and their description IS their name; every other list is a string.
  const isMaterials = cat === 'materials'
  const isIssues = cat === 'issueTypes'
  const isTechnicians = cat === 'technicians'
  const list = options[cat] ?? []
  // Issue types with a claimed CDS code display in ascending code order
  // (parts number, then variant letter) — reading order left to right,
  // top to bottom, not the order they happened to be added in. Uncoded
  // items sort after every coded one, keeping their original relative
  // order among themselves (stable sort). Every other category keeps its
  // stored order, unchanged. `i` stays the item's real index into `list`
  // — edit/save/delete are index-based — only the display order changes.
  const displayList = isIssues
    ? list
        .map((value, i) => ({ value, i }))
        .sort((a, b) => {
          const ca = issueCode(a.value)
          const cb = issueCode(b.value)
          if (ca && cb) {
            const partsDiff = Number(issueParts(a.value)) - Number(issueParts(b.value))
            return partsDiff !== 0 ? partsDiff : issueVariant(a.value).localeCompare(issueVariant(b.value))
          }
          if (ca) return -1
          if (cb) return 1
          return 0
        })
    : list.map((value, i) => ({ value, i }))
  const nameOf = (v) => (isMaterials ? materialName(v) : isIssues ? issueName(v) : isTechnicians ? technicianName(v) : String(v))
  const descOf = (v) => (isMaterials ? materialDesc(v) : '')
  const makeItem = (name, desc, parts, variant, id, initials2, initials3) => {
    if (isIssues) return { name, parts: parts.trim(), variant: variant.trim().toUpperCase() }
    if (isMaterials) return { name, description: desc.trim() }
    if (isTechnicians) {
      const idT = id.trim()
      const i2 = initials2.trim().toUpperCase()
      const i3 = initials3.trim().toUpperCase()
      if (!idT && !i2 && !i3) return name
      return { name, ...(idT && { id: idT }), ...(i2 && { initials2: i2 }), ...(i3 && { initials3: i3 }) }
    }
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

  // Same shape of check as techIdProblem, for the two initials fields.
  function initialsProblem(re, getter, label, example, value, exceptIndex = -1) {
    if (!isTechnicians) return ''
    const v = value.trim().toUpperCase()
    if (!v) return ''
    if (!re.test(v)) return `"${v}" is not a valid ${label} — exactly ${example.length} letters, e.g. ${example}.`
    const clash = list.findIndex((it, idx) => idx !== exceptIndex && getter(it) === v)
    if (clash >= 0) return `${label} ${v} is already used by "${nameOf(list[clash])}".`
    return ''
  }
  const initials2Problem = (v, exceptIndex = -1) =>
    initialsProblem(TECH_INITIALS2_RE, technicianInitials2, '2-letter initial', 'MA', v, exceptIndex)
  const initials3Problem = (v, exceptIndex = -1) =>
    initialsProblem(TECH_INITIALS3_RE, technicianInitials3, '3-letter initial', 'MRA', v, exceptIndex)

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

  // Whether the parts number being typed already means something, so defining
  // it as something else is a visible decision rather than a silent one — a
  // number in use decodes technicians' existing reports.
  function codeInUseHint(parts) {
    const p = parts.trim()
    if (!PARTS_RE.test(p)) return ''
    const part = (map?.components ?? FALLBACK.components)[p]
    if (!part) return `${p} is free — nothing uses it yet.`
    return `${p} is already in use for ${part} — defining it here replaces that.`
  }

  function flash(msg, field = '') {
    setNotice(msg)
    setNoticeField(field)
    setTimeout(() => {
      setNotice('')
      setNoticeField('')
    }, 4000)
  }

  // Which input a validation message belongs to. The checks return prose, so
  // the field is derived from which check produced it rather than parsed back
  // out of the sentence.
  const problemFor = (parts, variant, id, i2, i3, exceptIndex = -1) => {
    const code = codeProblem(parts, variant, exceptIndex)
    if (code) return [code, 'code']
    const tech = techIdProblem(id, exceptIndex)
    if (tech) return [tech, 'id']
    const a = initials2Problem(i2, exceptIndex)
    if (a) return [a, 'initials2']
    const b = initials3Problem(i3, exceptIndex)
    if (b) return [b, 'initials3']
    return ['', '']
  }

  function add() {
    const value = newValue.trim()
    if (!value) return
    if (exists(value)) {
      flash(`"${value}" is already in the list.`, 'name')
      return
    }
    const [problem, field] = problemFor(newParts, newVariant, newId, newInitials2, newInitials3)
    if (problem) {
      flash(problem, field)
      return
    }
    onChange(cat, [...list, makeItem(value, newDesc, newParts, newVariant, newId, newInitials2, newInitials3)])
    setNewValue('')
    setNewDesc('')
    setNewParts('')
    setNewVariant('')
    setNewId('')
    setNewInitials2('')
    setNewInitials3('')
  }

  function startEdit(i) {
    setEditIndex(i)
    setEditValue(nameOf(list[i]))
    setEditDesc(descOf(list[i]))
    setEditParts(isIssues ? issueParts(list[i]) : '')
    setEditVariant(isIssues ? issueVariant(list[i]) : '')
    setEditId(isTechnicians ? technicianId(list[i]) : '')
    setEditInitials2(isTechnicians ? technicianInitials2(list[i]) : '')
    setEditInitials3(isTechnicians ? technicianInitials3(list[i]) : '')
  }

  function saveEdit() {
    const value = editValue.trim()
    if (!value) return
    if (exists(value, editIndex)) {
      flash(`"${value}" is already in the list.`, 'name')
      return
    }
    const [problem, field] = problemFor(editParts, editVariant, editId, editInitials2, editInitials3, editIndex)
    if (problem) {
      flash(problem, field)
      return
    }
    onChange(
      cat,
      list.map((v, i) => (i === editIndex ? makeItem(value, editDesc, editParts, editVariant, editId, editInitials2, editInitials3) : v)),
    )
    setEditIndex(-1)
    setEditValue('')
    setEditDesc('')
    setEditParts('')
    setEditVariant('')
    setEditId('')
    setEditInitials2('')
    setEditInitials3('')
  }

  // Escape abandons the open edit. Enter is NOT handled per input any more —
  // the row container steps focus forward and saves from the last field.
  const cancelOnEscape = (e) => {
    if (e.key === 'Escape') setEditIndex(-1)
  }

  function remove(i) {
    onChange(cat, list.filter((_, idx) => idx !== i))
    if (editIndex === i) setEditIndex(-1)
  }

  return (
    // manage-inputs scopes this page's own layout. .manage-controls,
    // .manage-list and .field-code are shared with Code Reference and Admin
    // users, so nothing below may restyle them unscoped.
    <section className="manage manage-inputs">
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


          {/* The category modifier tells the stylesheet how many extra fields
              are on the row, which is what decides how they reflow on a
              tablet — two code fields stack, three initials pair up. */}
          <div
            className={`manage-controls${isIssues ? ' cat-issues' : ''}${isTechnicians ? ' cat-tech' : ''}${
              isMaterials ? ' cat-materials' : ''
            }`}
            /* Enter walks Category -> the code fields -> Name -> Description,
               and adds from the last one. */
            onKeyDown={(e) => advanceOnEnter(e, add)}
          >
            <label className="field-category">
              Category
              <SearchSelect
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value)
                  setEditIndex(-1)
                  // The extra fields belong to the category that showed them.
                  setNewDesc('')
                  setNewParts('')
                  setNewVariant('')
                  setNewId('')
                  setNewInitials2('')
                  setNewInitials3('')
                }}
                options={CATEGORIES.map((c) => ({ value: c.key, label: `${c.label} (${(options[c.key] ?? []).length})` }))}
              />
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
                    placeholder="19"
                    aria-invalid={noticeField === 'code' || undefined}
                    className={noticeField === 'code' ? 'invalid' : undefined}
                    inputMode="numeric"
                    title="The component number — exactly 2 digits, e.g. 19"
                  />
                </label>
                <label className="field-code">
                  Variant
                  <input
                    value={newVariant}
                    onChange={(e) => setNewVariant(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase())}
                    placeholder="B"
                    aria-invalid={noticeField === 'code' || undefined}
                    className={noticeField === 'code' ? 'invalid' : undefined}
                    title="Which build or version of that part — 1 letter, e.g. B"
                  />
                </label>
              </>
            )}
            {isTechnicians && (
              <>
                <label className="field-code">
                  Tech ID
                  <input
                    value={newId}
                    onChange={(e) => setNewId(e.target.value.replace(/\D/g, ''))}
                    placeholder="1"
                    aria-invalid={noticeField === 'id' || undefined}
                    className={noticeField === 'id' ? 'invalid' : undefined}
                    inputMode="numeric"
                    title="The number this technician texts as the last part of a WhatsApp report, e.g. 1. Optional."
                  />
                </label>
                <label className="field-code">
                  2-Letter Initial
                  <input
                    value={newInitials2}
                    onChange={(e) => setNewInitials2(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())}
                    placeholder="MA"
                    aria-invalid={noticeField === 'initials2' || undefined}
                    className={noticeField === 'initials2' ? 'invalid' : undefined}
                    title="An alternative to the ID above — exactly 2 letters, e.g. MA for Muhammad Amir. Optional."
                  />
                </label>
                <label className="field-code">
                  3-Letter Initial
                  <input
                    value={newInitials3}
                    onChange={(e) => setNewInitials3(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase())}
                    placeholder="MRA"
                    aria-invalid={noticeField === 'initials3' || undefined}
                    className={noticeField === 'initials3' ? 'invalid' : undefined}
                    title="A second alternative to the ID above — exactly 3 letters, e.g. MRA. Optional."
                  />
                </label>
              </>
            )}
            {/* Name, Description and Add are siblings of Category rather than
                nested under it, so each breakpoint can place them independently
                — on a tablet the description drops to its own full-width line
                while Category and Name stay paired above it. */}
            <label className="field-name">
              {isIssues ? 'Description' : isMaterials ? 'Material name' : isTechnicians ? 'Technician name' : 'Add new'}
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                aria-invalid={noticeField === 'name' || undefined}
                className={noticeField === 'name' ? 'invalid' : undefined}
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
            </label>
            {isMaterials && (
              <label className="field-desc">
                Description (optional)
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                />
              </label>
            )}
            <div className="add-action">
              <button type="button" onClick={add} disabled={!newValue.trim()}>
                Add
              </button>
            </div>
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
              A technician identifies themselves by ending a WhatsApp fault report in one of up to three things set
              here: the numeric <strong>Tech ID</strong> (e.g. <code>1</code>), a <strong>2-Letter Initial</strong>{' '}
              (e.g. <code>MA</code> for Muhammad Amir), or a <strong>3-Letter Initial</strong> (e.g. <code>MRA</code>{' '}
              for a middle initial too) — any combination, or none. Leave all three blank for a technician who only
              appears in the app's own dropdowns. This is where a technician's IDs are defined; what is set here is
              what a report resolves to.
            </p>
          )}
          {isIssues && (
            <p className="manage-hint">
              This is the primary code reference for the app: a code defined here is the authoritative
              meaning of that code, and nothing else is consulted for it. Everything defined here appears
              on the <strong>Code Reference</strong> under <em>Claimed Codes</em>, which is what technicians
              read.
              {newParts.trim() && (
                <span className="manage-code-hint"> {codeInUseHint(newParts)}</span>
              )}
            </p>
          )}

          {notice && <p className="manage-notice">{notice}</p>}

          <ul className="manage-list">
            {list.length === 0 && <li className="manage-empty">No values yet — add one above.</li>}
            {/* An item being edited takes the whole grid row: the description is
                the longest field and the one that must stay readable. */}
            {displayList.map(({ value, i }) => (
              <li key={`${nameOf(value)}-${i}`} className={editIndex === i ? 'editing' : undefined}>
                {editIndex === i ? (
                  <>
                    {/* Enter walks this row's fields and saves from the last. */}
                    <div className="edit-fields" onKeyDown={(e) => advanceOnEnter(e, saveEdit)}>
                      {isIssues && (
                        <div className="edit-code-row">
                          <label className="field-code">
                            Parts Code
                            <input
                              className="edit-input"
                              value={editParts}
                              onChange={(e) => setEditParts(e.target.value.replace(/\D/g, '').slice(0, 2))}
                              onKeyDown={cancelOnEscape}
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
                              onKeyDown={cancelOnEscape}
                              placeholder="B"
                            />
                          </label>
                        </div>
                      )}
                      {isTechnicians && (
                        <div className="edit-code-row">
                          <label className="field-code">
                            Tech ID
                            <input
                              className="edit-input"
                              value={editId}
                              onChange={(e) => setEditId(e.target.value.replace(/\D/g, ''))}
                              onKeyDown={cancelOnEscape}
                              placeholder="1"
                              inputMode="numeric"
                            />
                          </label>
                          <label className="field-code">
                            2-Letter Initial
                            <input
                              className="edit-input"
                              value={editInitials2}
                              onChange={(e) => setEditInitials2(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())}
                              onKeyDown={cancelOnEscape}
                              placeholder="MA"
                            />
                          </label>
                          <label className="field-code">
                            3-Letter Initial
                            <input
                              className="edit-input"
                              value={editInitials3}
                              onChange={(e) => setEditInitials3(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase())}
                              onKeyDown={cancelOnEscape}
                              placeholder="MRA"
                            />
                          </label>
                        </div>
                      )}
                      <input
                        className="edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={cancelOnEscape}
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
                          onKeyDown={cancelOnEscape}
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
                      {isTechnicians &&
                        [technicianId(value), technicianInitials2(value), technicianInitials3(value)].filter(Boolean).length > 0 && (
                          <span className="manage-item-code">
                            {[technicianId(value), technicianInitials2(value), technicianInitials3(value)].filter(Boolean).join(' / ')}
                          </span>
                        )}
                      {nameOf(value)}
                      {isMaterials && descOf(value) && <span className="manage-item-desc">{descOf(value)}</span>}
                    </span>
                    <div className="manage-item-actions">
                      {/* One edit at a time: a second open row would quietly
                          discard the first one's unsaved changes. */}
                      <button
                        type="button"
                        className="icon-edit"
                        onClick={() => startEdit(i)}
                        disabled={editIndex !== -1}
                        aria-label={`Edit ${nameOf(value)}`}
                        title={editIndex === -1 ? `Edit ${nameOf(value)}` : 'Finish the open edit first'}
                      >
                        ✎
                      </button>
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
