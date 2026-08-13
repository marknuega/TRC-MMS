/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Editor for the CDS code map — the vocabulary a short code resolves through.
 *
 * This replaces the WhatsApp bridge's admin.html. That page was the only way to
 * edit the map, so retiring the bridge without this would leave the app able to
 * edit its Issue types but not the vocabulary underneath them.
 *
 * Two things make this different from Manage Inputs, which edits the app's own
 * dropdown lists:
 *
 *   1. It saves on a button, not on every keystroke. This map is published
 *      unauthenticated at /codemap and polled every few seconds by the app and
 *      the WhatsApp bot, so an auto-saved half-typed entry is one a technician
 *      can decode against. Edits are staged and land in one PUT.
 *   2. It is admin-only. Every technician's decode resolves through this map,
 *      so a bad edit misfiles reports app-wide rather than for one user.
 */

import { useEffect, useMemo, useState } from 'react'
import { getCodeMap, saveCodeMap } from './api'

// The categories the server accepts, in the order they appear in a code, then
// the ones sent separately. `blankOk` marks the one place where an empty name
// is a real value rather than an unfinished entry.
const CATS = [
  {
    key: 'equipmentCodes',
    label: 'Device letters',
    codeLabel: 'Letter',
    hint: 'The first character of a code — which radio it is. H = Airbus TH1n.',
  },
  {
    key: 'components',
    label: 'Parts numbers',
    codeLabel: 'Number',
    hint: 'The 2 digits after the device letter. 43 = Side Grip.',
  },
  {
    key: 'variants',
    label: 'Variants',
    codeLabel: 'Letter',
    blankOk: true,
    hint:
      'The letter after the parts number, added to the part name as a suffix. A is blank on purpose — an empty suffix is what makes A the default build, so leaving it empty is a real entry, not an unfinished one.',
  },
  { key: 'actions', label: 'Actions', codeLabel: 'Letter', hint: 'What was done. C = Change.' },
  { key: 'companies', label: 'Companies', codeLabel: 'Code', hint: 'Who owns or funds the work. MT = MOTECO.' },
  {
    key: 'agencies',
    label: 'Agencies',
    codeLabel: 'Code',
    hint: 'Sent on its own after a report to verify it. PSD = Public Security Department.',
  },
  { key: 'technicians', label: 'Technician IDs', codeLabel: 'ID', hint: 'The last number in a report. 1 = Amir.' },
]

const normCode = (v) => String(v ?? '').trim().toUpperCase()

export default function CodeMap({ embedded = false }) {
  const [map, setMap] = useState(null)
  const [cat, setCat] = useState(CATS[0].key)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [editKey, setEditKey] = useState('') // the code currently open for edit
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    getCodeMap()
      .then(setMap)
      .catch((e) => setError(e.message))
  }, [])

  // Staged edits live only in this tab until saved, and switching pages unmounts
  // the component without warning. The browser can at least catch a tab close.
  useEffect(() => {
    if (!dirty) return
    const warn = (e) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const meta = CATS.find((c) => c.key === cat) ?? CATS[0]
  const entries = useMemo(() => Object.entries(map?.[cat] ?? {}), [map, cat])

  function flash(msg) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 3000)
  }

  // Rebuild the category from a list of pairs, so an edit keeps its position
  // instead of being deleted and re-appended to the bottom.
  function commit(pairs) {
    setMap((m) => ({ ...m, [cat]: Object.fromEntries(pairs) }))
    setDirty(true)
    setError('')
  }

  // What is wrong with a code, or '' when it is usable.
  function codeProblem(code, exceptKey = '') {
    if (!code) return `Enter the ${meta.codeLabel.toLowerCase()}.`
    const clash = entries.find(([k]) => k !== exceptKey && normCode(k) === code)
    if (clash) return `${code} is already used by "${clash[1] || '(blank)'}".`
    return ''
  }

  function add() {
    const code = normCode(newCode)
    const name = newName.trim()
    const problem = codeProblem(code)
    if (problem) return setError(problem)
    if (!name && !meta.blankOk) return setError('Enter what this code means.')
    commit([...entries, [code, name]])
    setNewCode('')
    setNewName('')
  }

  function startEdit(code, name) {
    setEditKey(code)
    setEditCode(code)
    setEditName(name)
    setError('')
  }

  function saveEdit() {
    const code = normCode(editCode)
    const name = editName.trim()
    const problem = codeProblem(code, editKey)
    if (problem) return setError(problem)
    if (!name && !meta.blankOk) return setError('Enter what this code means.')
    commit(entries.map(([k, v]) => (k === editKey ? [code, name] : [k, v])))
    setEditKey('')
  }

  function remove(code) {
    commit(entries.filter(([k]) => k !== code))
    setEditKey('')
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const saved = await saveCodeMap(map)
      setMap(saved)
      setDirty(false)
      flash('Saved — the app and the WhatsApp bot pick this up within seconds.')
    } catch (e) {
      // A non-admin reaching the PUT is the server refusing, not a bug here.
      setError(e.status === 403 ? 'Only an admin can change the code map.' : e.message)
    } finally {
      setSaving(false)
    }
  }

  async function discard() {
    try {
      setMap(await getCodeMap())
      setDirty(false)
      setEditKey('')
      setError('')
      flash('Reloaded the saved map.')
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className="manage">
      {embedded && <h2 className="page-title">🔡 Code Map</h2>}

      <div className="manage-body">
        <p className="manage-hint">
          The shared vocabulary a CDS code resolves through — <code>H43A</code> is a device letter, a parts number
          and a variant looked up here. It is published at <code>/codemap</code> for the WhatsApp bot, so an edit
          changes how every technician's codes decode. Changes are staged until you press Save.
        </p>

        {!map && !error && <p className="manage-hint">Loading…</p>}

        {map && (
          <>
            <div className="manage-controls">
              <label>
                Category
                <select
                  value={cat}
                  onChange={(e) => {
                    setCat(e.target.value)
                    setEditKey('')
                    setNewCode('')
                    setNewName('')
                    setError('')
                  }}
                >
                  {CATS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label} ({Object.keys(map[c.key] ?? {}).length})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-code">
                {meta.codeLabel}
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                  placeholder="H"
                />
              </label>
              <label className="grow">
                Means
                <div className="add-row">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                    placeholder={meta.blankOk ? 'Suffix — leave empty for the default build' : 'What this code means'}
                  />
                  <button type="button" onClick={add} disabled={!newCode.trim()}>
                    Add
                  </button>
                </div>
              </label>
            </div>

            <p className="manage-hint">{meta.hint}</p>

            {error && <p className="manage-notice error">{error}</p>}
            {notice && <p className="manage-notice">{notice}</p>}

            <div className="codemap-actions">
              <button type="button" className="submit" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
              </button>
              <button type="button" className="ghost" onClick={discard} disabled={!dirty || saving}>
                Discard
              </button>
              {dirty && <span className="codemap-dirty">Unsaved changes — nothing is published yet.</span>}
            </div>

            <ul className="manage-list">
              {entries.length === 0 && <li className="manage-empty">Nothing here yet — add one above.</li>}
              {entries.map(([code, name]) => (
                <li key={code}>
                  {editKey === code ? (
                    <>
                      <div className="edit-fields">
                        <div className="edit-code-row">
                          <label className="field-code">
                            {meta.codeLabel}
                            <input
                              className="edit-input"
                              value={editCode}
                              onChange={(e) => setEditCode(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  saveEdit()
                                }
                                if (e.key === 'Escape') setEditKey('')
                              }}
                              autoFocus
                            />
                          </label>
                        </div>
                        <input
                          className="edit-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEdit()
                            }
                            if (e.key === 'Escape') setEditKey('')
                          }}
                          placeholder={meta.blankOk ? 'Empty = the default build' : 'What this code means'}
                        />
                      </div>
                      <div className="manage-item-actions">
                        <button type="button" onClick={saveEdit}>Apply</button>
                        <button type="button" className="ghost" onClick={() => setEditKey('')}>Cancel</button>
                        {/* Delete lives inside Edit so it can't be hit by accident. */}
                        <button type="button" className="danger" onClick={() => remove(code)}>Delete</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="manage-item-label">
                        <span className="manage-item-code">{code}</span>
                        {name || <em className="muted">(blank — default build)</em>}
                      </span>
                      <div className="manage-item-actions">
                        <button type="button" className="ghost" onClick={() => startEdit(code, name)}>
                          Edit
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {error && !map && <p className="manage-notice error">{error}</p>}
      </div>
    </section>
  )
}
