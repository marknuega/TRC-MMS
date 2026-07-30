import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listEntries,
  createEntry,
  deleteEntry,
  getOptions,
  saveOptions,
  getSavedReports,
  saveReport,
  loadSavedReport,
  deleteSavedReport,
} from './api'
import { DEFAULT_OPTIONS, mergeOptions, MODEL_TYPE } from './options'
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

const MAX_FAULTS = 6
// Actions whose "fault" is the whole device — no component issue needed.
const DEVICE_LEVEL = new Set(['PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE'])
const faultIsMeaningful = (f) => f.issue.trim() !== '' || DEVICE_LEVEL.has(String(f.action).toUpperCase())
const today = () => new Date().toISOString().slice(0, 10)
const emptyFault = () => ({ issue: '', quantity: 1, action: 'CHANGE', company: 'PROJECT 2' })

const emptyForm = () => ({
  reportDate: today(),
  technician: '',
  agency: '',
  telNumber: '',
  issiNumber: '',
  type: '',
  model: '',
  faults: [emptyFault()],
})

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
  const [nextReportId, setNextReportId] = useState('REP-0001')
  const [busy, setBusy] = useState(false)
  const saveTimer = useRef(null)

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
      const rep = await saveReport()
      setError(null)
      await refreshSaved()
      window.alert(`Saved as ${rep.reportId}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleLoadReport(rep) {
    if (!window.confirm(`Load ${rep.reportId} into the form? This replaces the entries currently listed.`)) return
    setBusy(true)
    try {
      await loadSavedReport(rep.id)
      await refresh()
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteSaved(rep) {
    if (!window.confirm(`Delete ${rep.reportId}? This cannot be undone.`)) return
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
  const addFault = () =>
    setForm((f) => (f.faults.length >= MAX_FAULTS ? f : { ...f, faults: [...f.faults, emptyFault()] }))
  const removeFault = (i) =>
    setForm((f) => ({ ...f, faults: f.faults.length === 1 ? f.faults : f.faults.filter((_, idx) => idx !== i) }))

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const payload = {
        ...form,
        faults: form.faults
          .filter(faultIsMeaningful)
          .map((f) => ({ ...f, quantity: Math.max(1, Number(f.quantity) || 1) })),
      }
      if (payload.faults.length === 0) {
        setError('Add at least one fault — pick an issue, or an action like PROGRAM/INSTALL/DISMANTLE.')
        return
      }
      await createEntry(payload)
      setForm((f) => ({ ...emptyForm(), reportDate: f.reportDate, technician: f.technician, agency: f.agency }))
      setError(null)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteEntry(id)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  // One report per date, newest first. The live view uses the draft (next) id
  // until you Save, which mints the real REP-#### number.
  const reports = useMemo(
    () => groupReports(entries).map((g) => buildDateReport(g.dateLabel, nextReportId, g.entries)),
    [entries, nextReportId],
  )
  const combinedTxt = useMemo(() => reports.map(buildTxt).join('\n\n\n'), [reports])

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
              Report date
              <input type="date" value={form.reportDate} onChange={set('reportDate')} required />
            </label>
            <div className="actions">
              <button type="button" className="btn-txt" onClick={handleDownloadTxt} disabled={!reports.length}>
                ⭳ Text
              </button>
              <button type="button" className="btn-pdf" onClick={() => window.print()} disabled={!reports.length}>
                ⭳ PDF
              </button>
            </div>
          </div>
        </header>

        {error && <p className="error">{error}</p>}

        <form onSubmit={handleSubmit} className="entry-form">
          <fieldset>
            <legend>Device</legend>
            <div className="grid">
              <label>
                Model
                <select value={form.model} onChange={setModel} required>
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
              <label>
                <span className="cap">Tel number <span className="opt">(optional)</span></span>
                <input value={form.telNumber} onChange={set('telNumber')} placeholder="e.g. 0462260" />
              </label>
              <label>
                <span className="cap">ISSI number <span className="opt">(optional)</span></span>
                <input value={form.issiNumber} onChange={set('issiNumber')} placeholder="e.g. 1839517" />
              </label>
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

          <fieldset>
            <legend>
              Faults <span className="hint">({form.faults.length}/{MAX_FAULTS})</span>
            </legend>
            <div className="faults">
              <div className="fault-row fault-head">
                <span>Issue</span>
                <span>Qty</span>
                <span>Action</span>
                <span>Company / material</span>
                <span />
              </div>
              {form.faults.map((fault, i) => (
                <div className="fault-row" key={i}>
                  <input
                    list="issue-types"
                    value={fault.issue}
                    onChange={setFault(i, 'issue')}
                    placeholder="e.g. A COVER"
                    aria-label="Issue"
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={fault.quantity}
                    onChange={setFault(i, 'quantity')}
                    aria-label="Quantity"
                  />
                  <select value={fault.action} onChange={setFault(i, 'action')} aria-label="Action">
                    {options.actions.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <select value={fault.company} onChange={setFault(i, 'company')} aria-label="Company">
                    <option value="">— none —</option>
                    {options.companies.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
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
            <button type="button" className="add-fault" onClick={addFault} disabled={form.faults.length >= MAX_FAULTS}>
              + Add fault
            </button>
          </fieldset>

          <button type="submit" className="submit">
            Add entry
          </button>
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
              <button type="button" onClick={handleDownloadTxt} disabled={!reports.length}>
                Download .txt
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
              {saved.length === 0 ? (
                <p className="empty">No saved reports yet — click “Save report” above.</p>
              ) : (
                <ul className="saved-list">
                  {saved.map((r) => (
                    <li key={r.id}>
                      <div>
                        <strong>{r.reportId}</strong>{' '}
                        <span className="muted small">
                          · {r.dateLabel} · {r.entryCount} {r.entryCount === 1 ? 'entry' : 'entries'} · saved{' '}
                          {new Date(r.savedAt).toLocaleString('en-GB')}
                        </span>
                      </div>
                      <div className="saved-actions">
                        <button type="button" onClick={() => handleLoadReport(r)} disabled={busy}>
                          Load
                        </button>
                        <button type="button" className="danger" onClick={() => handleDeleteSaved(r)}>
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="entries">
          <h2>Entries {entries.length > 0 && <span className="hint">({entries.length})</span>}</h2>
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
                    <strong>
                      {e.type} {e.model}
                    </strong>{' '}
                    <span className="muted small">
                      · {e.agency} · {e.technician} · TEL {e.telNumber} · ISSI {e.issiNumber}
                    </span>
                    <p>{issueActionCell(e)}</p>
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
