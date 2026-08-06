/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

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
  getMonthly,
  saveMonthly,
  clearMonthly,
  getInventory,
} from './api'
import { DEFAULT_OPTIONS, mergeOptions, MODEL_TYPE, BRANCHES } from './options'
import ManageInputs from './ManageInputs'
import Inventory from './Inventory'
import AgencyTotals from './AgencyTotals'
import SparePartsReport from './SparePartsReport'
import Dashboard from './Dashboard'
import AdminUsers from './AdminUsers'
import {
  groupReports,
  buildDateReport,
  buildTxt,
  issueActionCell,
  entryQty,
  materialBlocksByType,
  deviceBlocksByType,
  transmittalRows,
  reportNotes,
  agencyComment,
  buildMonthlyMatrix,
  parseMonthlyPaste,
  TYPE_ORDER,
} from './report'
import './App.css'

// Actions whose "fault" is the whole device — no component issue needed.
const DEVICE_LEVEL = new Set(['PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE'])
const faultIsMeaningful = (f) => f.issue.trim() !== '' || DEVICE_LEVEL.has(String(f.action).toUpperCase())
const today = () => new Date().toISOString().slice(0, 10)
const ALL_BRANCHES = 'All Branches'
const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'report', icon: '📋', label: 'Report' },
  { id: 'monthly', icon: '📅', label: 'Monthly Report' },
  { id: 'spareparts', icon: '🧰', label: 'Spare Parts' },
  { id: 'agency', icon: '🏢', label: 'Agency Totals' },
  { id: 'inventory', icon: '📦', label: 'Inventory' },
  { id: 'manage', icon: '⚙️', label: 'Manage Inputs', adminOnly: true },
  { id: 'admin', icon: '🔐', label: 'Users & Access', adminOnly: true },
]
// Data-heavy pages fill the available width (tables/charts); form-style pages
// stay centred at a readable measure.
const WIDE_PAGES = new Set(['dashboard', 'monthly', 'spareparts', 'agency', 'inventory'])
const SIDEBAR_KEY = 'trc_sidebar'
const loadSidebar = () => {
  try {
    const s = localStorage.getItem(SIDEBAR_KEY)
    if (s === 'collapsed') return true
    if (s === 'expanded') return false
  } catch {
    /* ignore */
  }
  return typeof window !== 'undefined' && window.innerWidth < 1100 // auto-collapse on smaller screens
}
const dmyOf = (isoDate) => new Date(isoDate).toLocaleDateString('en-GB') // YYYY-MM-DD -> dd/mm/yyyy

// Render a matrix description: device tags like "(AIRBUS-TH1N)" in red, the
// issue/fault text (and quantities like "(6)") in normal colour.
function renderDesc(text) {
  if (!text) return null
  return String(text)
    .split(/(\([^)]*\))/g)
    .map((p, i) =>
      /^\([^)]*[A-Za-z][^)]*\)$/.test(p) ? (
        <span key={i} className="dev-tag">
          {p}
        </span>
      ) : (
        <span key={i}>{p}</span>
      ),
    )
}
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
const isTx = (r) => String(r?.mode ?? '').toUpperCase() === 'TRANSMITTAL'

// Deep search INSIDE a set of saved snapshots -> matching line items.
function searchInside(list, query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return []
  const out = []
  for (const r of list) {
    const entries = Array.isArray(r.entries) ? r.entries : []
    const label = repLabel(r.reportId, r.branch, r.mode) // e.g. "MAKKAH-REP-0004"
    for (const e of entries) {
      const model = e.model && e.model !== '-' ? e.model : ''
      for (const f of e.faults ?? []) {
        const hay = `${label} ${r.reportId} ${r.branch} ${r.dateLabel} ${e.technician ?? ''} ${e.type} ${e.model} ${f.issue} ${f.company} ${f.status} ${e.comment ?? ''}`
        if (hay.toLowerCase().includes(q)) {
          out.push({
            date: r.dateLabel,
            branch: r.branch,
            qty: f.quantity,
            technician: e.technician ?? '',
            item: `${model ? `${model} · ` : ''}${f.issue}`,
            reportId: label,
            rep: r,
          })
        }
      }
    }
  }
  return out.slice(0, 300)
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

// Comma-separated multi-select dropdown (checkboxes). Value/onChange use a
// single comma-joined string so the rest of the app keeps treating it as text.
function MultiSelect({ value, options, onChange, placeholder = '— select —' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const toggle = (opt) => {
    const set = new Set(selected)
    if (set.has(opt)) set.delete(opt)
    else set.add(opt)
    // Preserve the option list order for a stable, readable label.
    onChange(options.filter((o) => set.has(o)).join(', '))
  }
  return (
    <div className="multi" ref={ref}>
      <button type="button" className="multi-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={selected.length ? '' : 'multi-ph'}>{selected.length ? selected.join(', ') : placeholder}</span>
        <span className="chev">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="multi-menu">
          {options.length === 0 && <div className="multi-empty">No technicians</div>}
          {options.map((opt) => (
            <label key={opt} className="multi-opt">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
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

function App({ user, onLogout }) {
  const isAdmin = user?.role === 'admin'
  const lockBranch = isAdmin ? null : user?.branch || '' // non-admins are pinned to their branch
  const navItems = NAV.filter((n) => isAdmin || !n.adminOnly)
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [saved, setSaved] = useState([])
  const [savedOpen, setSavedOpen] = useState(false)
  const [savedSearch, setSavedSearch] = useState('')
  const [savedTxOpen, setSavedTxOpen] = useState(false)
  const [savedTxSearch, setSavedTxSearch] = useState('')
  const [page, setPage] = useState('report')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebar)
  const [monthExpanded, setMonthExpanded] = useState(false) // false = show 7 days only
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set()) // horizontally-collapsed groups
  const [monthValue, setMonthValue] = useState(() => today().slice(0, 7)) // YYYY-MM
  const [monthBranch, setMonthBranch] = useState('')
  const [manualSheet, setManualSheet] = useState(null) // pasted override for current month+branch
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [editSavedId, setEditSavedId] = useState(null) // which saved row shows Load/Delete
  const [nextReportId, setNextReportId] = useState('REP-0001')
  const [nextTransId, setNextTransId] = useState('TRANS-0001')
  const [inventory, setInventory] = useState([]) // for the issue/material suggestions + usage
  const [busy, setBusy] = useState(false)
  const [branch, setBranch] = useState(loadBranch)
  const [deviceOpen, setDeviceOpen] = useState(true)
  const [faultsOpen, setFaultsOpen] = useState(true)
  const isAllBranches = isAdmin && branch === ALL_BRANCHES
  const [theme, setTheme] = useState(loadTheme)
  const [mode, setMode] = useState(loadMode)

  // Non-admins are pinned to their own branch everywhere.
  useEffect(() => {
    if (lockBranch) {
      setBranch(lockBranch)
      setMonthBranch(lockBranch)
    }
  }, [lockBranch])
  // Keep non-admins off admin-only pages.
  useEffect(() => {
    if (!isAdmin && NAV.find((n) => n.id === page)?.adminOnly) setPage('report')
  }, [isAdmin, page])
  const [transmittedBy, setTransmittedBy] = useState(() => lsGet('trc_tx'))
  const [receivedBy, setReceivedBy] = useState(() => lsGet('trc_rx'))
  const saveTimer = useRef(null)
  const isTransmittal = mode === 'transmittal'
  // The next id a Save would mint, for the current document type.
  const nextDocId = isTransmittal ? nextTransId : nextReportId
  // Inventory item names, offered as suggestions in the issue/material fields.
  const inventoryNames = useMemo(
    () => [...new Set((inventory ?? []).map((i) => String(i.itemCode || '').trim()).filter(Boolean))].sort(),
    [inventory],
  )

  function changeMode(e) {
    const m = e.target.value === 'transmittal' ? 'transmittal' : 'report'
    setMode(m)
    lsSet(MODE_KEY, m)
    setEditSavedId(null)
    refresh(m) // load that document type's own working entries
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

  // Auto-collapse the sidebar when the window gets narrow (never auto-expands,
  // so a manual choice on a wide screen is respected).
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1100) setSidebarCollapsed(true)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // When the tab regains focus: if a newer build has shipped, reload to run it;
  // otherwise just refetch so calculations reflect the latest saved data —
  // without the user having to refresh the page manually.
  useEffect(() => {
    const currentBundle = document
      .querySelector('script[type="module"][src*="/assets/index-"]')
      ?.getAttribute('src')
    const onFocus = async () => {
      try {
        const html = await fetch('/', { cache: 'no-store' }).then((r) => r.text())
        const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
        if (currentBundle && m && !currentBundle.endsWith(m[0])) {
          window.location.reload()
          return
        }
      } catch {
        /* offline — fall through and just refetch what we can */
      }
      refreshSaved()
      refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const toggleSidebar = () =>
    setSidebarCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded')
      } catch {
        /* ignore */
      }
      return next
    })

  function changeBranch(e) {
    const b = e.target.value
    setBranch(b)
    try {
      localStorage.setItem(BRANCH_KEY, b)
    } catch {
      /* ignore storage errors */
    }
  }

  // Working entries are per document type; refresh the set for the given mode
  // (defaults to the current one).
  async function refresh(m = mode) {
    try {
      setEntries(await listEntries(m))
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
      setNextTransId(data.nextTransmittalId ?? 'TRANS-0001')
    } catch {
      /* leave the saved list as-is if the endpoint is unavailable */
    }
  }

  const refreshInventory = () => getInventory().then(setInventory).catch(() => {})

  useEffect(() => {
    refresh()
    refreshSaved()
    refreshInventory() // populate the issue/material suggestions
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
      refreshInventory() // stock was deducted server-side for matched items
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
      // Restore the document's mode / branch / handover so it re-generates identically.
      const m = rep.mode === 'transmittal' ? 'transmittal' : 'report'
      setMode(m)
      lsSet(MODE_KEY, m)
      await refresh(m) // the snapshot replaced only this mode's working set
      if (rep.branch) {
        setBranch(rep.branch)
        lsSet(BRANCH_KEY, rep.branch)
      }
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
        mode, // keep report vs transmittal working sets separate
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
      await clearEntries(mode)
      setError(null)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  // One report per date, newest first. The live view uses the draft (next) id
  // until you Save, which mints the real REP-#### number.
  const reports = useMemo(() => {
    // All Branches: merge every branch's saved report for the selected date into one.
    if (isAllBranches) {
      const dl = dmyOf(form.reportDate)
      const byBranch = new Map()
      for (const r of saved ?? []) {
        if (String(r.mode).toUpperCase() === 'TRANSMITTAL' || r.dateLabel !== dl) continue
        const prev = byBranch.get(r.branch || '')
        if (!prev || (r.seq ?? 0) > (prev.seq ?? 0)) byBranch.set(r.branch || '', r)
      }
      const merged = [...byBranch.values()].flatMap((r) => (Array.isArray(r.entries) ? r.entries : []))
      if (!merged.length) return []
      return [buildDateReport(dl, 'ALL-BRANCHES', merged, { branch: ALL_BRANCHES, mode: 'report' })]
    }
    return groupReports(entries).map((g) =>
      buildDateReport(g.dateLabel, repLabel(nextDocId, branch, mode), g.entries, {
        branch,
        mode,
        transmittedBy,
        receivedBy,
      }),
    )
  }, [isAllBranches, form.reportDate, saved, entries, nextDocId, branch, mode, transmittedBy, receivedBy])
  const combinedTxt = useMemo(() => reports.map(buildTxt).join('\n\n\n'), [reports])
  // Agency summary is a daily-report concept only — never on transmittals.
  const agencyCmt = useMemo(
    () => (isTransmittal ? '' : agencyComment(reports.flatMap((r) => r.entries))),
    [reports, isTransmittal],
  )

  // Collapse the Device/Faults cards in All-Branches (read-only merged) mode.
  useEffect(() => {
    setDeviceOpen(!isAllBranches)
    setFaultsOpen(!isAllBranches)
  }, [isAllBranches])

  // Monthly activity matrix (dates × terminal columns) from saved reports.
  const matrix = useMemo(() => {
    const [y, m] = monthValue.split('-').map(Number)
    if (!y || !m) return null
    return buildMonthlyMatrix(saved, { year: y, month: m - 1, branch: monthBranch, manual: manualSheet })
  }, [saved, monthValue, monthBranch, manualSheet])

  // Columns grouped by their brand header, for horizontal collapse.
  const groupCols = useMemo(
    () => (matrix ? matrix.groups.map((g) => ({ group: g.group, cols: matrix.columns.filter((c) => c.group === g.group) })) : []),
    [matrix],
  )
  const toggleGroup = (g) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  const sumCols = (cols, source) => cols.reduce((s, c) => s + (source[c.key] || 0), 0)

  // Collapsed matrix shows a 7-day window (the week of today when viewing the
  // current month, otherwise the first 7 days); expanded shows the whole month.
  const visibleRows = useMemo(() => {
    if (!matrix) return []
    if (monthExpanded) return matrix.rows
    const daysInMonth = matrix.rows.length
    let start = 1
    const t = new Date()
    if (t.getFullYear() === matrix.year && t.getMonth() === matrix.month) {
      const sunday = t.getDate() - t.getDay() // day-of-month of this week's Sunday
      start = Math.min(Math.max(sunday, 1), Math.max(1, daysInMonth - 6))
    }
    return matrix.rows.slice(start - 1, start - 1 + 7)
  }, [matrix, monthExpanded])

  // Load any pasted sheet for the selected month + branch.
  useEffect(() => {
    let active = true
    getMonthly(monthValue, monthBranch)
      .then((r) => active && setManualSheet(r?.data ?? null))
      .catch(() => active && setManualSheet(null))
    return () => {
      active = false
    }
  }, [monthValue, monthBranch])

  async function handleLoadPaste() {
    const data = parseMonthlyPaste(pasteText)
    if (Object.keys(data).length === 0) {
      setError('Nothing recognised — paste rows as Date, Day, the 18 columns, then Description (tab-separated).')
      return
    }
    try {
      await saveMonthly(monthValue, monthBranch, data)
      setManualSheet(data)
      setPasteText('')
      setPasteOpen(false)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleClearManual() {
    if (!window.confirm('Remove the pasted data for this month/branch and revert to live report data?')) return
    try {
      await clearMonthly(monthValue, monthBranch)
      setManualSheet(null)
    } catch (err) {
      setError(err.message)
    }
  }

  function handleExportMonthlyCsv() {
    if (!matrix) return
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = ['Date', 'Day', ...matrix.columns.map((c) => `${c.group} ${c.label}`), 'Activity / spare parts']
    const lines = [header.map(esc).join(',')]
    for (const r of matrix.rows) {
      lines.push([r.date, r.dayName, ...matrix.columns.map((c) => r.counts[c.key] || 0), r.description].map(esc).join(','))
    }
    lines.push(['Total', '', ...matrix.columns.map((c) => matrix.totals[c.key] || 0), ''].map(esc).join(','))
    downloadText(`Monthly-${matrix.monthName}-${matrix.year}${matrix.branch ? `-${matrix.branch}` : ''}.csv`, lines.join('\n'))
  }

  // Excel export that mirrors the on-screen table (grouped headers, green
  // weekends, red device tags) as an HTML table — shared by the Excel and PDF
  // exports so both match the desktop file (device labels like (AIRBUS-TH1N) red).
  function monthlyTableHtml(colgroupHtml = '') {
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const descHtml = (text) =>
      String(text ?? '')
        .split(/(\([^)]*\))/g)
        .map((p) => (/^\([^)]*[A-Za-z][^)]*\)$/.test(p) ? `<span style="color:#c81e1e">${esc(p)}</span>` : esc(p)))
        .join('')
    const b = 'border:1px solid #999;'
    const hb = `${b}background:#dfe3ee;font-weight:bold;text-align:center;padding:4px;`
    let h = `<table style="border-collapse:collapse;font-family:Arial;font-size:11px;">`
    h += colgroupHtml
    h += '<thead>'
    h += `<tr><th rowspan="2" colspan="2" style="${b}"></th>`
    for (const g of matrix.groups) h += `<th colspan="${g.span}" style="${hb}">${esc(g.group)}</th>`
    h += `<th rowspan="3" style="${hb}">Activity description and spare parts was used</th></tr>`
    h += '<tr>'
    for (const c of matrix.columns) h += `<th class="dev" style="${hb}"><div><span>${esc(c.label)}</span></div></th>`
    h += '</tr><tr>'
    h += `<th style="${hb}">Date</th><th style="${hb}">Day</th>`
    for (const _c of matrix.columns) h += `<th style="${b}background:#dfe3ee;"></th>`
    h += '</tr></thead><tbody>'
    for (const r of matrix.rows) {
      const bg = r.isWeekend ? 'background:#22c55e;' : ''
      h += '<tr>'
      h += `<td style="${b}${bg}padding:4px;mso-number-format:'\\@';">${esc(r.date)}</td>`
      h += `<td style="${b}${bg}padding:4px;">${esc(r.dayName)}</td>`
      for (const c of matrix.columns) h += `<td style="${b}${bg}text-align:center;padding:4px;">${r.counts[c.key] || ''}</td>`
      h += `<td style="${b}${bg}padding:4px;">${descHtml(r.description)}</td>`
      h += '</tr>'
    }
    h += `<tr><td colspan="2" style="${b}background:#eee;font-weight:bold;padding:4px;">Total</td>`
    for (const c of matrix.columns) h += `<td style="${b}background:#eee;font-weight:bold;text-align:center;padding:4px;">${matrix.totals[c.key] || 0}</td>`
    h += `<td style="${b}background:#eee;"></td></tr></tbody></table>`
    return h
  }

  function handleExportMonthlyExcel() {
    if (!matrix) return
    const full = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${monthlyTableHtml()}</body></html>`
    const blob = new Blob(['\ufeff', full], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Monthly-${matrix.monthName}-${matrix.year}${matrix.branch ? `-${matrix.branch}` : ''}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Formatted PDF (print window) of the monthly matrix — red device labels,
  // green weekends, grouped headers — matching the desktop exported file.
  function handleExportMonthlyPdf() {
    if (!matrix) return
    const w = window.open('', '_blank')
    if (!w) return
    const title = `Monthly ${matrix.monthName} ${matrix.year}${matrix.branch ? ` · ${matrix.branch}` : ''}`
    // Fixed column widths: Date/Day wide enough to read on one line, the terminal
    // columns stay slim (single digits — their names sit on a diagonal header), and
    // the activity description gets the remaining space.
    const n = matrix.columns.length
    const dev = (40 / Math.max(1, n)).toFixed(3)
    const colgroup =
      `<colgroup><col style="width:7%"/><col style="width:6%"/>` +
      matrix.columns.map(() => `<col style="width:${dev}%"/>`).join('') +
      `<col style="width:47%"/></colgroup>`
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
        `<style>@page{size:A4 landscape;margin:8mm}` +
        `body{font-family:Arial,sans-serif;color:#111;margin:10px}h1{font-size:14px;margin:0 0 6px}` +
        // Fill the landscape width and honour the colgroup widths exactly.
        `table{width:100%!important;border-collapse:collapse;table-layout:fixed}` +
        `td,th{font-size:9px}` +
        // Date & Day: read on a single line, never wrap.
        `td:nth-child(1),td:nth-child(2){white-space:nowrap;text-align:center}` +
        // Diagonal (135°) device-name headers so the slim columns stay readable.
        `th.dev{height:96px;padding:0;vertical-align:bottom}` +
        `th.dev>div{width:16px;margin:0 auto;transform:translateX(3px) rotate(-45deg)}` +
        `th.dev>div>span{display:inline-block;white-space:nowrap;font-size:8.5px;font-weight:bold}` +
        // Description keeps wrapping so long activity text fits.
        `td:last-child{text-align:left;word-break:break-word;overflow-wrap:anywhere}` +
        `p.foot{margin-top:8px;font-size:9px;color:#555}</style></head><body>` +
        `<h1>${title}</h1>${monthlyTableHtml(colgroup)}` +
        `<p class="foot">Software Developed by Muhammad Amir · MT# MT1063 · © 2026 Muhammad Amir. All rights reserved.</p>` +
        `</body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }

  // Keep daily reports and transmittals in separate lists (no mixing).
  const dailySaved = useMemo(() => saved.filter((r) => !isTx(r)), [saved])
  const txSaved = useMemo(() => saved.filter((r) => isTx(r)), [saved])
  const reportResults = useMemo(() => searchInside(dailySaved, savedSearch), [dailySaved, savedSearch])
  const txResults = useMemo(() => searchInside(txSaved, savedTxSearch), [txSaved, savedTxSearch])

  function handleDownloadTxt() {
    if (!reports.length) return
    // Name after the newest report, like the MOTECO export.
    const top = reports[0]
    const id = top.reportId ?? 'REP'
    const stamp = top.dateLabel.replace(/\//g, '')
    downloadText(`REP-Daily-${id}-${stamp}.txt`, combinedTxt)
  }

  // One saved-snapshot row (Edit -> Load / Delete).
  const savedRow = (r) => (
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
            <button type="button" onClick={() => { handleLoadReport(r); setEditSavedId(null) }} disabled={busy}>
              Load
            </button>
            <button type="button" className="danger" onClick={() => { handleDeleteSaved(r); setEditSavedId(null) }}>
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
  )

  const searchList = (results, query) =>
    results.length === 0 ? (
      <p className="empty">No items match “{query}”.</p>
    ) : (
      <ul className="search-results">
        <li className="search-results-head muted small">
          <span>Item</span>
          <span>Technician</span>
          <span>Date</span>
          <span>Branch</span>
          <span>Qty</span>
          <span>Report</span>
          <span></span>
        </li>
        {results.map((res, idx) => (
          <li key={idx}>
            <span className="res-item">{res.item}</span>
            <span className="muted small">{res.technician || '—'}</span>
            <span className="muted small">{res.date}</span>
            <span className="muted small">{res.branch || '—'}</span>
            <span className="muted small">{res.qty}</span>
            <span className="muted small">{res.reportId}</span>
            <button type="button" className="res-load" onClick={() => handleLoadReport(res.rep)} disabled={busy}>
              Load
            </button>
          </li>
        ))}
      </ul>
    )

  // A collapsible "Saved …" card (used for daily reports and transmittals).
  const savedCard = ({ icon, title, list, open, setOpen, search, setSearch, results, hint, empty, placeholder }) => (
    <section className="saved">
      <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          {icon} {title} {list.length > 0 && <span className="hint">({list.length})</span>}
        </span>
        <span className="chev">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="saved-body">
          <p className="saved-hint">{hint}</p>
          {list.length > 0 && (
            <input
              type="search"
              className="saved-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
            />
          )}
          {list.length === 0 ? (
            <p className="empty">{empty}</p>
          ) : search.trim() ? (
            searchList(results, search)
          ) : (
            <ul className="saved-list">{list.map(savedRow)}</ul>
          )}
        </div>
      )}
    </section>
  )

  return (
    <>
      <div className="layout no-print">
        <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
          <div className="brand">
            <button
              type="button"
              className="side-collapse"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              ☰
            </button>
            <span className="brand-ico">🛠️</span>
            <span className="brand-text">TRC-MMS</span>
            <button
              type="button"
              className="theme-toggle brand-theme"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch to day theme' : 'Switch to night theme'}
              title={theme === 'dark' ? 'Day mode' : 'Night mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
          <nav className="side-nav">
            {navItems.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`side-link${page === n.id ? ' active' : ''}`}
                onClick={() => setPage(n.id)}
                title={n.label}
              >
                <span className="side-ico">{n.icon}</span>
                <span className="side-label">{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="side-user">
            <span className="side-user-info" title={`${user?.username} · ${isAdmin ? 'admin' : user?.branch || 'user'}`}>
              <span className="side-ico">{isAdmin ? '👑' : '👤'}</span>
              <span className="side-label">
                {user?.username}
                <small>{isAdmin ? 'Admin · all branches' : user?.branch || 'User'}</small>
              </span>
            </span>
            <button type="button" className="side-logout" onClick={onLogout} title="Sign out">
              <span className="side-ico">⎋</span>
              <span className="side-label">Sign out</span>
            </button>
          </div>
        </aside>

        <main className={`page-main app${WIDE_PAGES.has(page) ? ' wide' : ''}`}>
          {error && <p className="error">{error}</p>}

          {page === 'report' && (
            <>
              <header className="topbar">
                <h1>TRC-MMS</h1>
          <div className="topbar-right">
            <label className="date-field">
              Mode
              <select value={mode} onChange={changeMode}>
                <option value="report">Maintenance Report</option>
                <option value="transmittal">Transmittal Report</option>
              </select>
            </label>
            <label className="date-field">
              Branch
              {isAdmin ? (
                <select value={branch} onChange={changeBranch}>
                  {BRANCHES.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                  <option value={ALL_BRANCHES}>{ALL_BRANCHES}</option>
                </select>
              ) : (
                <input value={branch} readOnly aria-label="Branch" />
              )}
            </label>
            <label className="date-field">
              Report date
              <input type="date" value={form.reportDate} onChange={set('reportDate')} required />
            </label>
          </div>
        </header>

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
          <div className="form-card">
            <button
              type="button"
              className="manage-toggle"
              onClick={() => setDeviceOpen((o) => !o)}
              aria-expanded={deviceOpen}
            >
              <span>Device</span>
              <span className="chev">{deviceOpen ? '▲' : '▼'}</span>
            </button>
            {deviceOpen && (
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
                <span className="cap">Technician <span className="opt">(optional · multiple)</span></span>
                <MultiSelect
                  value={form.technician}
                  options={options.technicians}
                  onChange={(v) => setForm((f) => ({ ...f, technician: v }))}
                />
              </label>
            </div>
            )}
          </div>
          )}

          <div className="form-card">
            <button
              type="button"
              className="manage-toggle"
              onClick={() => setFaultsOpen((o) => !o)}
              aria-expanded={faultsOpen}
            >
              <span>{isTransmittal ? 'Transmittal Report' : 'Faults'}</span>
              <span className="chev">{faultsOpen ? '▲' : '▼'}</span>
            </button>
            {faultsOpen && (
            <>
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
              {/* Inventory items — picking one links it for auto stock deduction. */}
              {inventoryNames.map((n) => (
                <option key={`inv-${n}`} value={n} />
              ))}
            </datalist>
            <datalist id="materials-list">
              {options.materials.map((m) => (
                <option key={m} value={m} />
              ))}
              {inventoryNames.map((n) => (
                <option key={`inv-${n}`} value={n} />
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
            </>
            )}
          </div>
        </form>

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

        <section className="breakdown">
          <div className="breakdown-head">
            <h2>
              Report text{' '}
              {reports.length > 0 && <span className="hint">(next: {nextDocId} · unsaved)</span>}
            </h2>
            <div className="breakdown-actions">
              <button
                type="button"
                className="save-report"
                onClick={handleSaveReport}
                disabled={!reports.length || busy || isAllBranches}
                title={isAllBranches ? 'All-Branches is a merged read-only view' : undefined}
              >
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
          {agencyCmt && (
            <div className="agency-comment">
              <div className="agency-comment-tag">comment · not exported</div>
              <pre>{agencyCmt}</pre>
            </div>
          )}
        </section>

        {/* Show only the saved card matching the current mode (no mixing). */}
        {!isTransmittal &&
          savedCard({
            icon: '☰',
            title: 'Saved reports',
            list: dailySaved,
            open: savedOpen,
            setOpen: setSavedOpen,
            search: savedSearch,
            setSearch: setSavedSearch,
            results: reportResults,
            hint: 'Daily-report snapshots, saved under a unique REP-#### number. Load one back to review or edit it, then Save again to store it as a new report.',
            empty: 'No saved reports yet — in Report mode, click “Save report” above.',
            placeholder: '🔎 Search inside reports (item, model, branch, date)…',
          })}

        {isTransmittal &&
          savedCard({
            icon: '📦',
            title: 'Saved transmittals',
            list: txSaved,
            open: savedTxOpen,
            setOpen: setSavedTxOpen,
            search: savedTxSearch,
            setSearch: setSavedTxSearch,
            results: txResults,
            hint: 'Transmittal snapshots, saved under a unique TRANS-#### number — kept separate from daily reports.',
            empty: 'No saved transmittals yet — switch to Transmittal mode and Save.',
            placeholder: '🔎 Search inside transmittals (item, model, branch, date)…',
          })}
            </>
          )}

          {page === 'monthly' && (
            <section className="monthly">
              <h2 className="page-title">📅 Monthly report</h2>

              {matrix && (
            <div className="monthly-body">
              <div className="monthly-controls">
                <label>
                  Month
                  <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
                </label>
                <label>
                  Branch
                  {isAdmin ? (
                    <select value={monthBranch} onChange={(e) => setMonthBranch(e.target.value)}>
                      <option value="">All branches</option>
                      {BRANCHES.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={monthBranch} readOnly aria-label="Branch" />
                  )}
                </label>
                <button type="button" className="submit" onClick={handleExportMonthlyExcel}>
                  ⭳ Excel
                </button>
                <button type="button" className="btn-pdf" onClick={handleExportMonthlyPdf}>
                  ⭳ PDF
                </button>
                <button type="button" className="btn-txt" onClick={handleExportMonthlyCsv}>
                  ⭳ CSV
                </button>
                <button type="button" className="add-fault" onClick={() => setPasteOpen((o) => !o)}>
                  📋 Paste data
                </button>
                {manualSheet && (
                  <button type="button" className="clear-all" onClick={handleClearManual}>
                    Clear pasted data
                  </button>
                )}
              </div>

              {pasteOpen && (
                <div className="paste-box">
                  <p className="saved-hint">
                    Paste rows from your sheet (copy from Excel = tab-separated): <strong>Date, Day, the 18 columns
                    in order, then Description</strong>. Empty cells stay blank. Saved for {matrix.monthName}{' '}
                    {matrix.year}
                    {monthBranch ? ` · ${monthBranch}` : ' · all branches'}.
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={6}
                    placeholder={'04/01/2026\tSunday\t12\t\t\t\t\t\t\t5\t4\t\t\t\t\t\t\t\t\t(Sepura-Carkit) …'}
                  />
                  <div className="paste-actions">
                    <button type="button" className="submit" onClick={handleLoadPaste} disabled={!pasteText.trim()}>
                      Load into {matrix.monthName} {matrix.year}
                    </button>
                    <button type="button" className="add-fault" onClick={() => setPasteOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <p className="saved-hint">
                {manualSheet ? (
                  <>
                    📌 Showing <strong>pasted data</strong> for {matrix.monthName} {matrix.year}
                    {monthBranch ? ` · ${monthBranch}` : ''}. Paste again to replace, or Clear to revert to live.
                  </>
                ) : (
                  <>
                    Activity counts per terminal, built from your saved <strong>reports</strong> for {matrix.monthName}{' '}
                    {matrix.year}. Model cells = total part quantity; Install/Dismantle are per brand.
                  </>
                )}
              </p>
              <div className="monthly-scroll">
                <table className="monthly-table">
                  <thead>
                    <tr>
                      <th colSpan={2} rowSpan={2} className="corner" />
                      {groupCols.map(({ group, cols }) => {
                        const collapsed = collapsedGroups.has(group)
                        return (
                          <th key={group} colSpan={collapsed ? 1 : cols.length} className="grp">
                            <button type="button" className="grp-toggle" onClick={() => toggleGroup(group)}>
                              <span>{collapsed ? group.split(' ')[0] : group}</span>
                              <span className="chev">{collapsed ? '▸' : '▾'}</span>
                            </button>
                          </th>
                        )
                      })}
                      <th rowSpan={3} className="act-head">
                        Activity description and spare parts was used
                      </th>
                    </tr>
                    <tr>
                      {groupCols.flatMap(({ group, cols }) =>
                        collapsedGroups.has(group)
                          ? [<th key={group} className="col-sub collapsed-col">Σ</th>]
                          : cols.map((c) => (
                              <th key={c.key} className="col-sub">
                                {c.label}
                              </th>
                            )),
                      )}
                    </tr>
                    <tr>
                      <th className="dh col-date">Date</th>
                      <th className="dh col-day">Day</th>
                      {groupCols.flatMap(({ group, cols }) =>
                        collapsedGroups.has(group)
                          ? [<th key={group} className="col-blank collapsed-col" />]
                          : cols.map((c) => <th key={c.key} className="col-blank" />),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.day} className={r.isWeekend ? 'weekend' : ''}>
                        <td className="nowrap col-date">{r.date}</td>
                        <td className="nowrap col-day">{r.dayName}</td>
                        {groupCols.flatMap(({ group, cols }) =>
                          collapsedGroups.has(group)
                            ? [
                                <td key={group} className="num collapsed-col">
                                  {sumCols(cols, r.counts) || ''}
                                </td>,
                              ]
                            : cols.map((c) => (
                                <td key={c.key} className="num">
                                  {r.counts[c.key] || ''}
                                </td>
                              )),
                        )}
                        <td className="desc">{renderDesc(r.description)}</td>
                      </tr>
                    ))}
                    <tr className="totals">
                      <td colSpan={2} className="col-total">Total</td>
                      {groupCols.flatMap(({ group, cols }) =>
                        collapsedGroups.has(group)
                          ? [
                              <td key={group} className="num collapsed-col">
                                {sumCols(cols, matrix.totals)}
                              </td>,
                            ]
                          : cols.map((c) => (
                              <td key={c.key} className="num">
                                {matrix.totals[c.key] || 0}
                              </td>
                            )),
                      )}
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
              {matrix.rows.length > 7 && (
                <button type="button" className="month-expand" onClick={() => setMonthExpanded((o) => !o)}>
                  {monthExpanded ? '▲ Show 7 days only' : `▼ View whole month (${matrix.rows.length} days)`}
                </button>
              )}
            </div>
          )}
            </section>
          )}

          {page === 'dashboard' && <Dashboard saved={saved} branches={BRANCHES} embedded lockBranch={lockBranch} />}

          {page === 'spareparts' && <SparePartsReport saved={saved} branches={BRANCHES} embedded lockBranch={lockBranch} />}

          {page === 'agency' && <AgencyTotals saved={saved} branches={BRANCHES} embedded lockBranch={lockBranch} />}

          {page === 'inventory' && <Inventory embedded />}

          {page === 'manage' && isAdmin && <ManageInputs options={options} onChange={setCategory} embedded />}

          {page === 'admin' && isAdmin && <AdminUsers currentUser={user} embedded />}

          <footer className="app-footer">
            Software Developed by Muhammad Amir · MT# MT1063 · © 2026 Muhammad Amir. All rights reserved.
          </footer>
        </main>
      </div>

      {/* Printable view — hidden on screen, shown only when printing (Save as PDF). */}
      <div className="print-only print-report">
        {reports.map((r) => (
          <PrintDate key={r.reportId ?? r.dateLabel} report={r} />
        ))}
      </div>
    </>
  )
}

// Route each printed page to the right layout for its mode.
function PrintDate({ report }) {
  return report.mode === 'transmittal' ? <TransmittalPrint report={report} /> : <ReportPrint report={report} />
}

// Transmittal manifest: material lines + handover signatures.
function TransmittalPrint({ report }) {
  const rows = transmittalRows(report.entries)
  const notes = reportNotes(report.entries)
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)

  return (
    <section className="print-day">
      <h3 className="print-title">MATERIAL TRANSMITTAL</h3>
      <div className="print-meta">
        <div><span>DATE</span><b>{report.dateLabel}</b></div>
        <div><span>TRANSMITTAL ID</span><b>{report.reportId ?? '-'}</b></div>
        <div><span>BRANCH</span><b>{report.branch || '-'}</b></div>
        <div><span>TRANSMITTED BY</span><b>{report.transmittedBy || '-'}</b></div>
        <div><span>RECEIVED BY</span><b>{report.receivedBy || '-'}</b></div>
        <div><span>TOTAL QTY</span><b>{totalQty}</b></div>
      </div>

      <table className="print-main">
        <thead>
          <tr>
            <th>#</th><th>TYPE</th><th>MODEL</th><th>MATERIAL</th><th>QTY</th><th>COMPANY</th><th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{r.type}</td>
              <td>{r.model}</td>
              <td className="ia">{r.material}</td>
              <td>{r.qty}</td>
              <td>{r.company}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {notes.length > 0 && (
        <>
          <h4 className="print-split-title">Notes</h4>
          <ul className="print-notes">
            {notes.map((n, i) => (
              <li key={i}>
                <b>{n.label}</b> — {n.comment}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="print-sign">
        <div>
          <span className="print-sign-line" />
          Transmitted by{report.transmittedBy ? `: ${report.transmittedBy}` : ''}
        </div>
        <div>
          <span className="print-sign-line" />
          Received by{report.receivedBy ? `: ${report.receivedBy}` : ''}
        </div>
      </div>

      <p className="print-footer">
        Software Developed by Muhammad Amir · MT# MT1063 · © 2026 Muhammad Amir. All rights reserved.
      </p>
    </section>
  )
}

// Daily activity report sheet (MOTECO REP-0004 style).
function ReportPrint({ report }) {
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
        Software Developed by Muhammad Amir · MT# MT1063 · © 2026 Muhammad Amir. All rights reserved.
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
