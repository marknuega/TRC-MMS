import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listEntries,
  createEntry,
  deleteEntry,
  clearEntries,
  getOptions,
  saveOptions,
  getSavedReports,
  saveReport,
  loadSavedReport,
  deleteSavedReport,
} from './api'
import { DEFAULT_OPTIONS, mergeOptions, MODEL_TYPE, BRANCHES } from './options'
import ManageInputs from './ManageInputs'
import {
  groupReports,
  buildDateReport,
  buildTxt,
  issueActionCell,
  entryQty,
  materialBlocksByType,
  deviceBlocksByType,
  TYPE_ORDER,
} from './report'
import './App.css'

// Actions whose "fault" is the whole device — no component issue needed.
const DEVICE_LEVEL = new Set(['PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE'])
const faultIsMeaningful = (f) => f.issue.trim() !== '' || DEVICE_LEVEL.has(String(f.action).toUpperCase())
const today = () => new Date().toISOString().slice(0, 10)
const emptyFault = () => ({ issue: '', quantity: 1, action: 'CHANGE', company: 'PROJECT 2', status: 'New' })

// Remember the last Model/Type/Agency so the next entry (and next visit) pre-selects them.
const LAST_KEY = 'trc_last_selection'
const loadLast = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY)) || {}
  } catch {
    return {}
  }
}
const saveLast = (v) => {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(v))
  } catch {
    /* ignore storage errors */
  }
}

// Report number with the branch prefixed, e.g. "MAKKAH-REP-0001".
// In transmittal mode the "REP" series reads "TRANS" (e.g. "TAIF-TRANS-0003").
const repLabel = (baseId, branch, mode) => {
  const id = mode === 'transmittal' ? String(baseId ?? '-').replace('REP-', 'TRANS-') : baseId ?? '-'
  return `${branch ? `${branch.toUpperCase()}-` : ''}${id}`
}

const BRANCH_KEY = 'trc_branch'
const loadBranch = () => {
  try {
    return localStorage.getItem(BRANCH_KEY) || BRANCHES[0]
  } catch {
    return BRANCHES[0]
  }
}

const THEME_KEY = 'trc_theme'
const loadTheme = () => {
  try {
    const t = localStorage.getItem(THEME_KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* fall through to system preference */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const lsGet = (k, d = '') => {
  try {
    return localStorage.getItem(k) ?? d
  } catch {
    return d
  }
}
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore storage errors */
  }
}
const MODE_KEY = 'trc_mode'
const loadMode = () => (lsGet(MODE_KEY) === 'transmittal' ? 'transmittal' : 'report')

const emptyForm = () => {
  const last = loadLast()
  return {
    reportDate: today(),
    technician: '',
    agency: last.agency ?? '',
    telNumber: '',
    issiNumber: '',
    type: last.type ?? '',
    model: last.model ?? '',
    comment: '',
    faults: [emptyFault()],
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function App() {
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [saved, setSaved] = useState([])
  const [savedOpen, setSavedOpen] = useState(false)
  const [savedSearch, setSavedSearch] = useState('')
  const [editSavedId, setEditSavedId] = useState(null) // which saved row shows Load/Delete
  const [nextReportId, setNextReportId] = useState('REP-0001')
  const [busy, setBusy] = useState(false)
  const [branch, setBranch] = useState(loadBranch)
  const [theme, setTheme] = useState(loadTheme)
  const [mode, setMode] = useState(loadMode)
  const [transmittedBy, setTransmittedBy] = useState(() => lsGet('trc_tx'))
  const [receivedBy, setReceivedBy] = useState(() => lsGet('trc_rx'))
  const saveTimer = useRef(null)
  const isTransmittal = mode === 'transmittal'

  function changeMode(e) {
    const m = e.target.value === 'transmittal' ? 'transmittal' : 'report'
    setMode(m)
    lsSet(MODE_KEY, m)
  }
  const changeTransmittedBy = (e) => {
    setTransmittedBy(e.target.value)
    lsSet('trc_tx', e.target.value)
  }
  const changeReceivedBy = (e) => {
    setReceivedBy(e.target.value)
    lsSet('trc_rx', e.target.value)
  }

  // Apply + persist the day/night theme on the root element.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore storage errors */
    }
  }, [theme])

  function changeBranch(e) {
    const b = e.target.value
    setBranch(b)
    try {
      localStorage.setItem(BRANCH_KEY, b)
    } catch {
      /* ignore storage errors */
    }
  }

  async function refresh() {
    try {
      setEntries(await listEntries())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshSaved() {
    try {
      const data = await getSavedReports()
      setSaved(data.reports)
      setNextReportId(data.nextReportId)
    } catch {
      /* leave the saved list as-is if the endpoint is unavailable */
    }
  }

  useEffect(() => {
    refresh()
    refreshSaved()
    getOptions()
      .then((stored) => setOptions(mergeOptions(stored)))
      .catch(() => {}) // keep defaults if the options endpoint is unavailable
  }, [])

  async function handleSaveReport() {
    setBusy(true)
    try {
      const rep = await saveReport({ branch, mode, transmittedBy, receivedBy })
      setError(null)
      await refreshSaved()
      window.alert(`Saved as ${repLabel(rep.reportId, rep.branch, rep.mode)}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleLoadReport(rep) {
    if (!window.confirm(`Load ${repLabel(rep.reportId, rep.branch, rep.mode)} into the form? This replaces the entries currently listed.`)) return
    setBusy(true)
    try {
      await loadSavedReport(rep.id)
      await refresh()
      // Restore the document's mode / branch / handover so it re-generates identically.
      if (rep.branch) {
        setBranch(rep.branch)
        lsSet(BRANCH_KEY, rep.branch)
      }
      const m = rep.mode === 'transmittal' ? 'transmittal' : 'report'
      setMode(m)
      lsSet(MODE_KEY, m)
      setTransmittedBy(rep.transmittedBy ?? '')
      setReceivedBy(rep.receivedBy ?? '')
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteSaved(rep) {
    if (!window.confirm(`Delete ${repLabel(rep.reportId, rep.branch, rep.mode)}? This cannot be undone.`)) return
    try {
      await deleteSavedReport(rep.id)
      await refreshSaved()
    } catch (err) {
      setError(err.message)
    }
  }

  // Update one category and persist the whole set (debounced).
  function setCategory(key, list) {
    setOptions((prev) => {
      const next = { ...prev, [key]: list }
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveOptions(next).catch((err) => setError(`Could not save inputs: ${err.message}`))
      }, 400)
      return next
    })
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  // Choosing a model auto-fills Type from the model→type map (if the model is mapped).
  const setModel = (e) => {
    const model = e.target.value
    setForm((f) => ({ ...f, model, type: MODEL_TYPE[model.toUpperCase()] ?? f.type }))
  }
  const setFault = (i, field) => (e) =>
    setForm((f) => ({
      ...f,
      faults: f.faults.map((fault, idx) => {
        if (idx !== i) return fault
        const next = { ...fault, [field]: field === 'quantity' ? Number(e.target.value) : e.target.value }
        // Typing/picking an action name in the Issue field auto-selects that Action.
        if (field === 'issue') {
          const matched = options.actions.find((a) => a.toUpperCase() === String(e.target.value).trim().toUpperCase())
          if (matched) next.action = matched
        }
        return next
      }),
    }))
  const addFault = () => setForm((f) => ({ ...f, faults: [...f.faults, emptyFault()] }))
  const removeFault = (i) =>
    setForm((f) => ({ ...f, faults: f.faults.length === 1 ? f.faults : f.faults.filter((_, idx) => idx !== i) }))

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const payload = {
        ...form,
        // Transmittal has no device card: items are "OTHER", no model/agency.
        ...(isTransmittal ? { type: 'OTHER', model: '', agency: '' } : {}),
        // Transmittal lines are Material + Qty + Company + Status (Action hidden, defaults harmlessly).
        faults: form.faults
          .filter(faultIsMeaningful)
          .map((f) => ({ ...f, quantity: Math.max(1, Number(f.quantity) || 1) })),
      }
      if (payload.faults.length === 0) {
        setError('Add at least one fault — pick an issue, or an action like PROGRAM/INSTALL/DISMANTLE.')
        return
      }
      await createEntry(payload)
      // Remember Model/Type/Agency so the next entry pre-selects them.
      saveLast({ model: form.model, type: form.type, agency: form.agency })
      setForm((f) => ({ ...emptyForm(), reportDate: f.reportDate, technician: f.technician }))
      setError(null)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this entry?')) return
    try {
      await deleteEntry(id)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleClearAll() {
    if (!window.confirm(`Clear all ${entries.length} entries? This can't be undone (Save first to keep a copy).`)) {
      return
    }
    try {
      await clearEntries()
      setError(null)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  // One report per date, newest first. The live view uses the draft (next) id
  // until you Save, which mints the real REP-#### number.
  const reports = useMemo(
    () =>
      groupReports(entries).map((g) =>
        buildDateReport(g.dateLabel, repLabel(nextReportId, branch, mode), g.entries, {
          branch,
          mode,
          transmittedBy,
          receivedBy,
        }),
      ),
    [entries, nextReportId, branch, mode, transmittedBy, receivedBy],
  )
  const combinedTxt = useMemo(() => reports.map(buildTxt).join('\n\n\n'), [reports])

  // Live-filter saved reports by id / branch / date / mode.
  const filteredSaved = useMemo(() => {
    const q = savedSearch.trim().toLowerCase()
    if (!q) return saved
    return saved.filter((r) =>
      `${repLabel(r.reportId, r.branch, r.mode)} ${r.branch} ${r.dateLabel} ${r.mode} ${r.entryCount}`
        .toLowerCase()
        .includes(q),
    )
  }, [saved, savedSearch])

  function handleDownloadTxt() {
    if (!reports.length) return
    // Name after the newest report, like the MOTECO export.
    const top = reports[0]
    const id = top.reportId ?? 'REP'
    const stamp = top.dateLabel.replace(/\//g, '')
    downloadText(`REP-Daily-${id}-${stamp}.txt`, combinedTxt)
  }

  return (
    <>
      <main className="app no-print">
        <header className="topbar">
          <h1>TRC Daily Report</h1>
          <div className="topbar-right">
            <label className="date-field">
              Mode
              <select value={mode} onChange={changeMode}>
                <option value="report">Report</option>
                <option value="transmittal">Transmittal</option>
              </select>
            </label>
            <label className="date-field">
              Branch
              <select value={branch} onChange={changeBranch}>
                {BRANCHES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="date-field">
              Report date
              <input type="date" value={form.reportDate} onChange={set('reportDate')} required />
            </label>
            <div className="actions">
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                aria-label={theme === 'dark' ? 'Switch to day theme' : 'Switch to night theme'}
                title={theme === 'dark' ? 'Day mode' : 'Night mode'}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
        </header>

        {error && <p className="error">{error}</p>}

        {isTransmittal && (
          <section className="handover">
            <h2>Handover</h2>
            <div className="handover-grid">
              <label>
                Transmitted by
                <select value={transmittedBy} onChange={changeTransmittedBy}>
                  <option value="">— select —</option>
                  {options.technicians.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Received by
                <select value={receivedBy} onChange={changeReceivedBy}>
                  <option value="">— select —</option>
                  {options.technicians.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}

        <form onSubmit={handleSubmit} className="entry-form">
          {!isTransmittal && (
          <fieldset>
            <legend>Device</legend>
            <div className="grid">
              <label>
                Model {form.type === 'OTHER' && <span className="opt">(optional)</span>}
                <select value={form.model} onChange={setModel} required={form.type !== 'OTHER'}>
                  <option value="">— select —</option>
                  {options.models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select value={form.type} onChange={set('type')} required>
                  <option value="">— select —</option>
                  {options.types.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Agency
                <select value={form.agency} onChange={set('agency')} required>
                  <option value="">— select —</option>
                  {options.agencies.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              {!isTransmittal && (
                <>
                  <label>
                    <span className="cap">Tel number <span className="opt">(optional)</span></span>
                    <input value={form.telNumber} onChange={set('telNumber')} placeholder="e.g. 0462260" />
                  </label>
                  <label>
                    <span className="cap">ISSI number <span className="opt">(optional)</span></span>
                    <input value={form.issiNumber} onChange={set('issiNumber')} placeholder="e.g. 1839517" />
                  </label>
                </>
              )}
              <label>
                <span className="cap">Technician <span className="opt">(optional)</span></span>
                <select value={form.technician} onChange={set('technician')}>
                  <option value="">— select —</option>
                  {options.technicians.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          )}

          <fieldset>
            <legend>{isTransmittal ? 'Transmittal' : 'Faults'}</legend>
            <div className="faults">
              <div className={`fault-row fault-head${isTransmittal ? ' fault-row--tx' : ''}`}>
                <span>{isTransmittal ? 'Material' : 'Issue'}</span>
                <span>Qty</span>
                {!isTransmittal && <span>Action</span>}
                <span>Company</span>
                {isTransmittal && <span>Status</span>}
                <span />
              </div>
              {form.faults.map((fault, i) => (
                <div className={`fault-row${isTransmittal ? ' fault-row--tx' : ''}`} key={i}>
                  <input
                    list={isTransmittal ? 'materials-list' : 'issue-types'}
                    value={fault.issue}
                    onChange={setFault(i, 'issue')}
                    placeholder={isTransmittal ? 'e.g. A COVER' : 'e.g. A COVER'}
                    aria-label={isTransmittal ? 'Material' : 'Issue'}
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={fault.quantity}
                    onChange={setFault(i, 'quantity')}
                    aria-label="Quantity"
                  />
                  {!isTransmittal && (
                    <select value={fault.action} onChange={setFault(i, 'action')} aria-label="Action">
                      {options.actions.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  )}
                  <select value={fault.company} onChange={setFault(i, 'company')} aria-label="Company">
                    <option value="">— none —</option>
                    {options.companies.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  {isTransmittal && (
                    <select value={fault.status} onChange={setFault(i, 'status')} aria-label="Item status">
                      {options.statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="fault-remove"
                    onClick={() => removeFault(i)}
                    disabled={form.faults.length === 1}
                    aria-label="Remove fault"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <datalist id="issue-types">
              {/* Standalone actions usable directly as an issue (auto-set the Action). */}
              {options.actions
                .filter((a) => !['CHANGE', 'REPAIR', 'NEW'].includes(a.toUpperCase()))
                .map((a) => (
                  <option key={`act-${a}`} value={a} />
                ))}
              {options.issueTypes.map((it) => (
                <option key={it} value={it} />
              ))}
            </datalist>
            <datalist id="materials-list">
              {options.materials.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>

            <label className="comment-field">
              <span className="cap">Comment <span className="opt">(optional)</span></span>
              <textarea
                value={form.comment}
                onChange={set('comment')}
                rows={2}
                placeholder={isTransmittal ? 'Note for this transmittal entry…' : 'Note for this entry…'}
              />
            </label>

            <div className="faults-footer">
              <button type="button" className="add-fault" onClick={addFault}>
                {isTransmittal ? '+ Add material' : '+ Add fault'}
              </button>
              <button type="submit" className="submit">
                Add entry
              </button>
            </div>
          </fieldset>
        </form>

        <section className="breakdown">
          <div className="breakdown-head">
            <h2>
              Report text{' '}
              {reports.length > 0 && <span className="hint">(next: {nextReportId} · unsaved)</span>}
            </h2>
            <div className="breakdown-actions">
              <button type="button" className="save-report" onClick={handleSaveReport} disabled={!reports.length || busy}>
                💾 Save report
              </button>
              <button type="button" className="btn-txt" onClick={handleDownloadTxt} disabled={!reports.length}>
                ⭳ Text
              </button>
              <button type="button" className="btn-pdf" onClick={() => window.print()} disabled={!reports.length}>
                ⭳ PDF
              </button>
            </div>
          </div>
          <textarea readOnly value={combinedTxt || 'No entries yet.'} rows={18} />
        </section>

        <section className="saved">
          <button
            type="button"
            className="manage-toggle"
            onClick={() => setSavedOpen((o) => !o)}
            aria-expanded={savedOpen}
          >
            <span>☰ Saved reports {saved.length > 0 && <span className="hint">({saved.length})</span>}</span>
            <span className="chev">{savedOpen ? '▲' : '▼'}</span>
          </button>

          {savedOpen && (
            <div className="saved-body">
              <p className="saved-hint">
                Save snapshots the entries below under a unique {`REP-####`} number. Load one back to review or edit
                it, then Save again to store it as a new report.
              </p>
              {saved.length > 0 && (
                <input
                  type="search"
                  className="saved-search"
                  value={savedSearch}
                  onChange={(e) => setSavedSearch(e.target.value)}
                  placeholder="🔎 Search saved reports (id, branch, date)…"
                />
              )}
              {saved.length === 0 ? (
                <p className="empty">No saved reports yet — click “Save report” above.</p>
              ) : filteredSaved.length === 0 ? (
                <p className="empty">No saved reports match “{savedSearch}”.</p>
              ) : (
                <ul className="saved-list">
                  {filteredSaved.map((r) => (
                    <li key={r.id}>
                      <div>
                        <strong>{repLabel(r.reportId, r.branch, r.mode)}</strong>{' '}
                        <span className="muted small">
                          · {r.dateLabel} · {r.entryCount} {r.entryCount === 1 ? 'entry' : 'entries'} · saved{' '}
                          {new Date(r.savedAt).toLocaleString('en-GB')}
                        </span>
                      </div>
                      <div className="saved-actions">
                        {editSavedId === r.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                handleLoadReport(r)
                                setEditSavedId(null)
                              }}
                              disabled={busy}
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                handleDeleteSaved(r)
                                setEditSavedId(null)
                              }}
                            >
                              Delete
                            </button>
                            <button type="button" className="ghost" onClick={() => setEditSavedId(null)}>
                              Close
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setEditSavedId(r.id)}>
                            Edit
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="entries">
          <div className="entries-head">
            <h2>Entries {entries.length > 0 && <span className="hint">({entries.length})</span>}</h2>
            {entries.length > 0 && (
              <button type="button" className="clear-all" onClick={handleClearAll}>
                Clear all
              </button>
            )}
          </div>
          {loading ? (
            <p>Loading…</p>
          ) : entries.length === 0 ? (
            <p className="empty">No entries yet.</p>
          ) : (
            <ul className="entry-list">
              {entries.map((e, i) => (
                <li key={e.id}>
                  <span className="entry-num">{i + 1}</span>
                  <div>
                    {isTransmittal ? (
                      <p>
                        <strong>
                          {e.faults
                            .map((f) => `${f.issue} (${f.quantity})${f.status ? ` · ${f.status}` : ''}`)
                            .join(', ')}
                        </strong>
                      </p>
                    ) : (
                      <>
                        <strong>
                          {e.type} {e.model}
                        </strong>{' '}
                        <span className="muted small">
                          · {e.agency}
                          {e.technician ? ` · ${e.technician}` : ''} · TEL {e.telNumber} · ISSI {e.issiNumber}
                        </span>
                        <p>{issueActionCell(e)}</p>
                      </>
                    )}
                    {e.comment && <p className="entry-comment muted small">💬 {e.comment}</p>}
                  </div>
                  <button onClick={() => handleDelete(e.id)} aria-label="Delete entry">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ManageInputs options={options} onChange={setCategory} />

        <footer className="app-footer">
          Software Developed by Muhammad Amir MT# MT1063 © 2026 Muhammad Amir. All rights reserved.
        </footer>
      </main>

      {/* Printable view — hidden on screen, shown only when printing (Save as PDF). */}
      <div className="print-only print-report">
        {reports.map((r) => (
          <PrintDate key={r.reportId ?? r.dateLabel} report={r} />
        ))}
      </div>
    </>
  )
}

// One printed page per report date, laid out like the MOTECO REP-0004 sheet.
function PrintDate({ report }) {
  const t = report.totals
  const materials = materialBlocksByType(report.entries)
  const devices = deviceBlocksByType(report.entries)

  return (
    <section className="print-day">
      <div className="print-meta">
        <div><span>REPORT DATE</span><b>{report.dateLabel}</b></div>
        <div><span>BRANCH</span><b>{report.branch || '-'}</b></div>
        <div><span>REPORT ID</span><b>{report.reportId ?? '-'}</b></div>
        <div><span>TOTAL ENTRIES</span><b>{t.totalEntries}</b></div>
        <div><span>ALL DEVICE TOTAL PROGRAMMING</span><b>{t.programming}</b></div>
        <div><span>ALL DEVICE TOTAL MAINTENANCE</span><b>{t.maintenance}</b></div>
        <div><span>ALL DEVICE TOTAL INSTALL</span><b>{t.install}</b></div>
        <div><span>ALL DEVICE TOTAL DISMANTLE</span><b>{t.dismantle}</b></div>
      </div>

      <table className="print-main">
        <thead>
          <tr>
            <th>#</th><th>TEL#</th><th>ISSI#</th><th>MODEL</th>
            <th>ISSUE &amp; ACTION</th><th>QTY</th><th>AGENCY</th><th>TECH</th>
          </tr>
        </thead>
        <tbody>
          {report.entries.map((e, i) => (
            <tr key={e.id}>
              <td>{i + 1}</td>
              <td>{e.telNumber}</td>
              <td>{e.issiNumber}</td>
              <td>{e.model}</td>
              <td className="ia">{issueActionCell(e)}</td>
              <td>{entryQty(e)}</td>
              <td>{e.agency}</td>
              <td>{e.technician}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="print-split-title">Split Format (Airbus / Sepura / Hytera) — Materials Summary</h4>
      <SplitColumns byType={materials} />

      <h4 className="print-split-title">Split Format (Airbus / Sepura / Hytera) — Device Summary</h4>
      <SplitColumns byType={devices} />

      <p className="print-footer">
        Software Developed by Muhammad Amir MT# MT1063 © 2026 Muhammad Amir. All rights reserved.
      </p>
    </section>
  )
}

function SplitColumns({ byType }) {
  return (
    <div className="print-split">
      {TYPE_ORDER.map((type) => {
        const blocks = byType[type] ?? []
        return (
          <div className="split-col" key={type}>
            <div className="split-col-head">{type}</div>
            {blocks.length === 0 ? (
              <div className="split-empty">NO ENTRY</div>
            ) : (
              blocks.map((b) => (
                <div className="split-block" key={b.header}>
                  <div className="split-block-head">{b.header}</div>
                  {b.lines.map((line, idx) => (
                    <div className="split-line" key={idx}>
                      {line}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}

export default App
