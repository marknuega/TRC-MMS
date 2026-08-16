/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// Short-Code Reference Card.
//
// A printable cheat-sheet for the CDS fault-reporting short codes. A fault token
// is [TYPE][PARTS][VARIANT] + [ACTION][QTY][COMPANY], e.g. "H43AC1MT" = type H
// (Airbus TH1n), parts 43 (Side Grip), variant A (Original), action C (Change),
// qty 1, company MT (MOTECO).
//
// The first FOUR characters are the CDS code proper. This replaced the older
// 3-character "26HC1MT" form, which led with the component number and had no
// variant, so it could not tell an original side grip from a 3D-printed one.
//
// The lists below are pulled LIVE from this app's own /codemap, so the page
// stays in step with edits made in the "Edit Code Map" section further down
// this same page. The bundled constants are only a fallback for when that
// fetch fails (offline). Both the map and the fallback live in codes.js,
// shared with the decoder that actually parses these codes — one vocabulary,
// described in exactly one place.
//
// TWO sections describe how a code resolves, and their order is the resolution
// order: a Claimed Code (an Issue type in Manage inputs) wins outright, and only
// where there is no claim do Parts Numbers + Variants apply. The card used to
// show the second without the first, which made it a partial description of a
// vocabulary technicians rely on being complete.
//
// Editing used to be a separate admin-only "Code Map" page. It moved here —
// as an admin-only collapsible section (CodeMapEditor, below) — because every
// technician's decode resolves through this map, so an admin editing it
// should see how the edit reads on the same page a technician consults,
// rather than switching pages to check.

import { useEffect, useMemo, useState } from 'react'
import { COPYRIGHT_HTML } from './copyright'
import { FALLBACK, useCodeMap } from './codes'
import { issueCodeIndex } from './options'
import { groupComponents, PARTS_RE, COMPONENT_BUCKETS } from './refGroups'
import { getCodeMap, saveCodeMap } from './api'
import SearchSelect from './SearchSelect'

const numericSort = ([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
// Split a list into n roughly equal columns, keeping reading order down each one.
const chunk = (rows, n) => {
  const size = Math.ceil(rows.length / n) || 1
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size))
}
// Preserve the curated brand grouping from the source map (insertion order).
const asPairs = (obj) => Object.entries(obj || {}).map(([k, v]) => [String(k), String(v)])
const sortedPairs = (obj) => asPairs(obj).sort(numericSort)


const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Build a clean, standalone printable document (independent of the app layout)
// and print it through a hidden iframe — reliable for Chrome "Save as PDF".
function printReference(data) {
  const { devices, claims, actions, companies, agencies, technicians } = data
  const codeRows = (pairs) =>
    pairs.map(([c, n]) => `<tr><td class="c">${esc(c)}</td><td>${esc(n)}</td></tr>`).join('')
  // Device rows bold the source char in the model name and add an explanation column.
  const deviceRows = (pairs) =>
    pairs
      .map(([c, n]) => {
        const p = deviceSource(c, n)
        const name = `${esc(p.before)}<b>${esc(p.hit)}</b>${esc(p.after)}`
        return `<tr><td class="c">${esc(c)}</td><td>${name}</td><td class="note">${esc(p.note)}</td></tr>`
      })
      .join('')
  const half = Math.ceil(devices.length / 2)

  // Parts numbers claimed by an Issue type — printed as plain columns, one
  // flat list rather than bucketed, since what groups them is the issue they
  // name, not a part-number range.
  const claimTables = chunk(claims, 3)
    .map((rows) => `<div class="grp"><table>${codeRows(rows)}</table></div>`)
    .join('')

  const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>TRC-MMS Short-Code Reference</title>
<style>
  * { box-sizing: border-box; }
  /* Page margins live on @page, not body — a margin on body only wraps the
     very first and very last page of the flow, so a continuation page (page
     2+) would otherwise start flush against the physical edge with no
     top margin at all. */
  body { font: 12px/1.4 -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 {
    font-size: 13px;
    margin: 0 0 6px;
    padding-bottom: 3px;
    border-bottom: 2px solid #222;
    break-after: avoid;
    page-break-after: avoid; /* Safari/older Chromium still key off this */
  }
  h3 { font-size: 11px; margin: 0 0 4px; color: #444; text-transform: uppercase; letter-spacing: .04em; }
  .sub { color: #555; margin: 0 0 4px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 3px 6px; text-align: left; vertical-align: top; }
  td.c, th.c { font-weight: 700; font-family: ui-monospace, Consolas, monospace; white-space: nowrap; width: 3.2em; }
  /* Wraps on purpose — one line per note made the 3-column device table wider
     than its half of the page. */
  td.note { color: #555; font-size: 10px; }
  td b { color: #111; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
  .grp { break-inside: avoid; page-break-inside: avoid; margin-bottom: 8px; }
  td.grp { background: #eef; font-weight: 700; margin: 0; }
  .syntax { font-family: ui-monospace, Consolas, monospace; font-size: 14px; font-weight: 700; }
  .ex {
    background: #f4f4f4;
    border: 1px solid #ddd;
    padding: 8px 10px;
    border-radius: 6px;
    margin: 6px 0 16px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  code { font-family: ui-monospace, Consolas, monospace; font-weight: 700; }
  .ex code { font-family: ui-monospace, Consolas, monospace; font-weight: 700; }
  /* Each report section (heading + its table/cards) is one fragmentation
     unit: the browser keeps it whole and, if it won't fit in what's left of
     the page, starts it fresh on the next one instead of splitting it or
     stranding the heading behind. */
  .sec { break-inside: avoid; page-break-inside: avoid; margin: 0 0 16px; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #ccc; color: #666; font-size: 10px; break-inside: avoid; page-break-inside: avoid; }
  @page { size: A4 portrait; margin: 14mm; }
</style></head><body>
  <h1>TRC-MMS · CDS Short-Code Reference</h1>
  <p class="sub">Fault-reporting codes. A fault = <b>[Type][Parts][Variant]</b> + <b>[Action][Qty][Company]</b>.</p>

  <div class="ex">
    <div class="syntax">H&nbsp;·&nbsp;43&nbsp;·&nbsp;A&nbsp;&nbsp;·&nbsp;&nbsp;C&nbsp;·&nbsp;1&nbsp;·&nbsp;MT&nbsp;&nbsp;→&nbsp;&nbsp;<code>H43AC1MT</code></div>
    <div>H (Airbus TH1n) + 43 (Side Grip) + A (Original) + C (Change) + 1 (qty) + MT (MOTECO)</div>
    <div class="sub">Full report: <code>H43A C 1 MT 2221 6575 1</code> &nbsp;(code · action · qty · company · last 4 of tel · last 4 of ISSI · technician&nbsp;ID). Then send the agency code alone, e.g. <code>PSD</code>, to verify.</div>
    <div class="sub">Separators are free: <code>H43AC1MT222165751</code>, <code>H43A-C-1-MT-2221-6575-1</code>, <code>H43A_C_1_MT_2221_6575_1</code> and <code>H43A:C:1:MT:2221:6575:1</code> all read the same.</div>
    <div class="sub"><b>Short cuts.</b> Leave the <b>quantity</b> out for 1: <code>H43ACMT</code>. Leave the <b>type letter</b> off every code after the first — one report is one radio, so it carries down: <code>H11AC1MT 11AC1MI 2221 6666 1</code>. Write the <b>company</b> with one letter: <code>T</code> = MOTECO, <code>I</code> = MOI, so <code>H11AC1T</code>. All three together: <code>H11ACT 11ACI 2221 6666 1</code>.</div>
    <div class="sub"><b>Technician ID.</b> A number or a 2/3-letter initials claim (Manage Inputs &rarr; Technicians) — both work anywhere. Tel and ISSI are <b>optional</b>: give the last 4 of both, together, right before the technician, or leave both off — <code>H43ACT MA</code> needs no tel/ISSI at all. State the technician once — right after any fault's company works too, not just at the end: <code>H43ACT1 43BNI 48ACI</code> reads the same as <code>H43ACT 43BNI 48ACI 1</code>.</div>
  </div>

  ${
    claims.length
      ? `<section class="sec">
    <h2>Parts Number Catalog</h2>
    <p class="sub">Parts numbers claimed by an Issue type in Manage Inputs → Faulty / Parts.</p>
    <div class="cols">${claimTables}</div>
  </section>`
      : ''
  }

  <section class="sec">
    <h2>Type Letters</h2>
    <div class="cols">
      <table>${deviceRows(devices.slice(0, half))}</table>
      <table>${deviceRows(devices.slice(half))}</table>
    </div>
  </section>

  <section class="sec">
    <h2>Actions</h2>
    <div class="cols">
      <table>${codeRows(actions.slice(0, Math.ceil(actions.length / 2)))}</table>
      <table>${codeRows(actions.slice(Math.ceil(actions.length / 2)))}</table>
    </div>
  </section>

  <section class="sec">
    <h2>Companies</h2>
    <table>${codeRows(companies)}</table>
  </section>

  <section class="sec">
    <h2>Technician ID</h2>
    <table>${codeRows(technicians)}</table>
  </section>

  <section class="sec">
    <h2>Agencies (verification)</h2>
    <table>${codeRows(agencies)}</table>
  </section>

  <div class="foot">${COPYRIGHT_HTML}</div>
</body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()
  const cleanup = () => setTimeout(() => iframe.remove(), 1500)
  iframe.contentWindow.onafterprint = cleanup
  setTimeout(() => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    cleanup()
  }, 250)
}

// Actions, Companies, Technician ID, Agencies — same card design as the
// Parts Number Catalog: a blue code badge beside its plain-text meaning.
function CodeCards({ rows }) {
  return (
    <div className="catalog-grid">
      {rows.map(([code, name]) => (
        <div className="catalog-card code-card" key={code}>
          <span className="catalog-badge">{code}</span>
          <span className="catalog-name">{name}</span>
        </div>
      ))}
    </div>
  )
}

// Whitespace-delimited word of `s` that contains index `i`.
function wordAt(s, i) {
  let a = i
  let b = i
  while (a > 0 && !/\s/.test(s[a - 1])) a -= 1
  while (b < s.length - 1 && !/\s/.test(s[b + 1])) b += 1
  return s.slice(a, b + 1)
}

// Letters not spelled in the model name come from a spoken digit instead.
const DEVICE_DERIV = {
  S: { char: '6', note: '“Six” — 6 in 680' },
  E: { char: '8', note: '“Eight” — 8 in 580' },
  N: { char: '9', note: '“Nine” — 9 in 590' },
}

// Where a device letter is taken from: the char to bold in the model name and a
// short explanation. Searches after the brand word (so "Airbus TH[R]9" wins over
// the R in "Airbus"); falls back to the spoken-digit map for S/E/N.
function deviceSource(code, name) {
  const c = String(code).trim().toUpperCase()
  const s = String(name)
  const sp = s.indexOf(' ')
  let idx = s.toUpperCase().indexOf(c, sp >= 0 ? sp + 1 : 0)
  let note = ''
  if (idx >= 0) note = `${c} in ${wordAt(s, idx)}`
  else if (DEVICE_DERIV[c]) {
    idx = s.indexOf(DEVICE_DERIV[c].char)
    note = DEVICE_DERIV[c].note
  }
  if (idx < 0) return { before: s, hit: '', after: '', note: note || '—' }
  return { before: s.slice(0, idx), hit: s[idx], after: s.slice(idx + 1), note }
}

// Device Letters: same card design as the Parts Number Catalog — a blue
// letter badge, the model name with its source char bolded, and a muted
// one-line explanation of where that letter comes from.
function DeviceCards({ rows }) {
  return (
    <div className="catalog-grid">
      {rows.map(([code, name]) => {
        const p = deviceSource(code, name)
        return (
          <div className="catalog-card device-card" key={code}>
            <span className="catalog-badge">{code}</span>
            <span className="catalog-name">
              {p.before}
              <strong className="device-card-hit">{p.hit}</strong>
              {p.after}
            </span>
            <span className="device-card-note">{p.note}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---- Admin editor for the code map (formerly its own "Code Map" page) ----
//
// Lives here, not on a separate page, because every technician's decode
// resolves through this map — an admin editing it should see straight away
// how that edit reads on the same page a technician consults. The read-only
// tables below pick a save up on their own next poll (useCodeMap, every few
// seconds); this editor keeps its own copy so in-progress edits aren't
// clobbered mid-type by that poll.
//
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
      'The letter after the parts number. It belongs to the code itself, not to the part before it — 12A is an A Cover and 12B a B Cover. Nothing decodes through this list any more; a code means whatever the issue type claiming it says, so these entries are left blank.',
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

function CodeMapEditor() {
  const [map, setMap] = useState(null)
  const [cat, setCat] = useState(CATS[0].key)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  // Only used for the 'components' category — which group a parts number
  // prints under on the Code Reference page (Housing & Antenna, etc.), or
  // blank to keep the automatic by-number grouping.
  const [newCategory, setNewCategory] = useState('')
  const [editKey, setEditKey] = useState('') // the code currently open for edit
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
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
  const isComponents = cat === 'components'
  // Every category name already in use, so the free-text Category field can
  // suggest reusing one instead of a near-duplicate ("Power" vs "Power &
  // Charging") — includes the built-in number buckets even before any part
  // has been assigned to them explicitly.
  const categoryChoices = useMemo(() => {
    if (!isComponents) return []
    const used = new Set(Object.values(map?.componentCategories ?? {}).map((v) => String(v).trim()).filter(Boolean))
    for (const b of COMPONENT_BUCKETS) used.add(b.title)
    return [...used].sort()
  }, [map, isComponents])

  function flash(msg) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 3000)
  }

  // The category override for one components code, or undefined for every
  // other category (nothing to patch). `oldCode` lets a rename move the
  // override to its new key instead of orphaning it under the old one.
  function categoryPatch(newCodeKey, value, oldCode = newCodeKey) {
    if (!isComponents) return undefined
    const cats = { ...(map?.componentCategories ?? {}) }
    if (oldCode !== newCodeKey) delete cats[oldCode]
    const c = value.trim()
    if (c) cats[newCodeKey] = c
    else delete cats[newCodeKey]
    return { componentCategories: cats }
  }

  // Rebuild the category from a list of pairs, so an edit keeps its position
  // instead of being deleted and re-appended to the bottom. `extra` merges in
  // any sibling map that changed alongside it (componentCategories).
  function commit(pairs, extra) {
    setMap((m) => ({ ...m, [cat]: Object.fromEntries(pairs), ...extra }))
    setDirty(true)
    setError('')
  }

  // What is wrong with a code, or '' when it is usable.
  function codeProblem(code, exceptKey = '') {
    if (!code) return `Enter the ${meta.codeLabel.toLowerCase()}.`
    if (isComponents && !PARTS_RE.test(code)) {
      return `"${code}" is not a parts number — it must be exactly two digits, e.g. 43.`
    }
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
    commit([...entries, [code, name]], categoryPatch(code, newCategory))
    setNewCode('')
    setNewName('')
    setNewCategory('')
  }

  function startEdit(code, name) {
    setEditKey(code)
    setEditCategory(isComponents ? String(map?.componentCategories?.[code] ?? '') : '')
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
    commit(
      entries.map(([k, v]) => (k === editKey ? [code, name] : [k, v])),
      categoryPatch(code, editCategory, editKey),
    )
    setEditKey('')
  }

  function remove(code) {
    commit(entries.filter(([k]) => k !== code), categoryPatch(code, ''))
    setEditKey('')
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const saved = await saveCodeMap(map)
      setMap(saved)
      setDirty(false)
      flash('Saved — the tables below and the WhatsApp bot pick this up within seconds.')
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
              <SearchSelect
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value)
                  setEditKey('')
                  setNewCode('')
                  setNewName('')
                  setNewCategory('')
                  setError('')
                }}
                options={CATS.map((c) => ({ value: c.key, label: `${c.label} (${Object.keys(map[c.key] ?? {}).length})` }))}
              />
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
                  placeholder={meta.blankOk ? 'Leave empty — a variant carries no suffix' : 'What this code means'}
                />
                {isComponents && (
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                    placeholder="Category — blank = group by number"
                    list="component-categories"
                    aria-label="Category"
                    title="Which section this part prints under on Code Reference. Leave blank to group it automatically by number."
                  />
                )}
                <button type="button" onClick={add} disabled={!newCode.trim()}>
                  Add
                </button>
              </div>
            </label>
          </div>
          {isComponents && (
            <datalist id="component-categories">
              {categoryChoices.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          )}

          <p className="manage-hint">{meta.hint}</p>
          {isComponents && (
            <p className="manage-hint">
              Category is optional — leave it blank and the part groups by its number (10–19 Housing &amp;
              Antenna, 20–39 Electronics &amp; UI, 40–49 Audio &amp; Controls, 90–99 Power &amp; Charging, anything
              else under Other). Set it to put a part under a different heading on the Code Reference page.
            </p>
          )}

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
                      {isComponents && (
                        <input
                          className="edit-input"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEdit()
                            }
                            if (e.key === 'Escape') setEditKey('')
                          }}
                          placeholder="Category — blank = group by number"
                          list="component-categories"
                          aria-label="Category"
                        />
                      )}
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
                      {isComponents && map?.componentCategories?.[code] && (
                        <em className="muted"> — {map.componentCategories[code]}</em>
                      )}
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
  )
}

export default function ReferenceCard({ isAdmin = false, issueTypes = [] }) {
  const { map, status, updatedAt } = useCodeMap()

  // Derive display lists from the live map, falling back to bundled data.
  const data = useMemo(() => {
    const src = map || FALLBACK
    const { groups, unusable } = groupComponents(src.components || FALLBACK.components, src.componentCategories)
    return {
      devices: asPairs(src.equipmentCodes || FALLBACK.equipmentCodes),
      componentGroups: groups,
      unusableComponents: unusable,
      // Codes claimed by an Issue type (Manage Inputs -> Faulty / Parts) — this
      // IS the "Parts Number Catalog" below, seen from the technician's side.
      // Computed straight from the `issueTypes` prop (same `options` state
      // App.jsx already threads through Manage Inputs), not from the code-map
      // poll above, so an edit there shows up here the instant it lands in
      // that shared state — no poll delay.
      claims: sortedPairs(issueCodeIndex(issueTypes)),
      actions: asPairs(src.actions || FALLBACK.actions),
      companies: asPairs(src.companies || FALLBACK.companies),
      agencies: sortedPairs(src.agencies || FALLBACK.agencies),
      technicians: sortedPairs(src.technicians || FALLBACK.technicians),
    }
  }, [map, issueTypes])

  const statusLabel =
    status === 'live'
      ? `Live from admin${updatedAt ? ` · updated ${updatedAt.toLocaleTimeString('en-GB')}` : ''}`
      : status === 'loading'
        ? 'Loading live codes…'
        : 'Showing built-in defaults (couldn’t reach the code map)'

  return (
    <section className="ref-card">
      <div className="ref-head">
        <h2 className="page-title">🔤 Code Reference</h2>
        <button type="button" className="btn-pdf" onClick={() => printReference(data)}>
          🖨️ Print / Save PDF
        </button>
      </div>

      <p className="muted ref-intro">
        CDS fault-reporting short codes. A fault is{' '}
        <strong>[Type][Parts][Variant]</strong> — the 4-character CDS code — followed by{' '}
        <strong>[Action][Qty][Company]</strong>. Type, parts and variant are looked up separately, so
        one type letter is reused across every part.
      </p>

      <p className={`ref-status ${status}`}>
        <span className="ref-dot" aria-hidden="true" /> {statusLabel}
      </p>

      {isAdmin && (
        <details className="ref-sec">
          <summary className="ref-section">✏️ Edit Code Map (admin)</summary>
          <div className="ref-sec-body">
            <CodeMapEditor />
          </div>
        </details>
      )}

      <div className="ref-example">
        <div className="ref-syntax">
          H · 43 · A &nbsp;·&nbsp; C · 1 · MT &nbsp;→&nbsp; <code>H43AC1MT</code>
        </div>
        <div>
          H (Airbus TH1n) + 43 (Side Grip) + A (Original) + C (Change) + 1 (qty) + MT (MOTECO)
        </div>
        <div className="muted">
          Full report: <code>H43A C 1 MT 2221 6575 1</code> — code · action · qty · company · last 4
          of tel · last 4 of ISSI · technician ID. Then send the agency code alone (e.g.{' '}
          <code>PSD</code>) to verify.
        </div>
        <div className="muted">
          Separators are free — <code>H43AC1MT222165751</code>, <code>H43A-C-1-MT-2221-6575-1</code>,{' '}
          <code>H43A_C_1_MT_2221_6575_1</code> and <code>H43A:C:1:MT:2221:6575:1</code> all read the
          same.
        </div>
        <div className="muted">
          <strong>Short cuts.</strong> Leave the <strong>quantity</strong> out for 1 —{' '}
          <code>H43ACMT</code>. Leave the <strong>type letter</strong> off every code after the
          first; one report is one radio, so it carries down —{' '}
          <code>H11AC1MT 11AC1MI 2221 6666 1</code>. Write the <strong>company</strong> with one
          letter — <code>T</code> = MOTECO, <code>I</code> = MOI — so <code>H11AC1T</code>. All three
          together: <code>H11ACT 11ACI 2221 6666 1</code>.
        </div>
        <div className="muted">
          <strong>Technician ID.</strong> A number or a 2/3-letter initials claim (Manage Inputs →
          Technicians) — both work anywhere a technician ID is expected. Tel and ISSI are{' '}
          <strong>optional</strong>: give the last 4 of both, together, right before the technician,
          or leave both off if neither is known — <code>H43ACT MA</code> needs no tel/ISSI at all.
          The technician only needs stating <strong>once</strong>: give it right after any fault's
          company instead of waiting for the end — <code>H43ACT1 43BNI 48ACI</code> reads as
          technician <code>1</code> for both faults, exactly the same as{' '}
          <code>H43ACT 43BNI 48ACI 1</code>.
        </div>
      </div>

      <details className="ref-sec">
        <summary className="ref-section">
          Parts Number Catalog ({data.claims.length})
        </summary>
        <div className="ref-sec-body">
          <p className="muted catalog-hint">
            Parts numbers claimed by an <strong>Issue type</strong> in{' '}
            <strong>Manage Inputs → Faulty / Parts</strong> — the parts+variant code (e.g.{' '}
            <code>11A</code>) alongside what it names. This list updates the instant it changes in
            Manage Inputs.
          </p>
          {data.claims.length === 0 ? (
            <p className="muted">
              No parts numbers yet — give an issue type a Parts Code + Variant in Manage Inputs →
              Faulty / Parts.
            </p>
          ) : (
            <div className="catalog-grid">
              {data.claims.map(([code, name]) => (
                <div className="catalog-card parts-card" key={code}>
                  <div className="parts-card-info">
                    <span className="catalog-badge">{code}</span>
                    <span className="catalog-name">{name}</span>
                  </div>
                  <button type="button" className="parts-card-edit">
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Type Letters</summary>
        <div className="ref-sec-body">
          <DeviceCards rows={data.devices} />
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Actions</summary>
        <div className="ref-sec-body">
          <CodeCards rows={data.actions} />
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Companies</summary>
        <div className="ref-sec-body">
          <CodeCards rows={data.companies} />
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Technician ID</summary>
        <div className="ref-sec-body">
          <CodeCards rows={data.technicians} />
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Agencies (verification)</summary>
        <div className="ref-sec-body">
          <CodeCards rows={data.agencies} />
        </div>
      </details>
    </section>
  )
}
