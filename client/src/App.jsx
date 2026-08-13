/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listEntries,
  createEntry,
  updateEntry,
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
  syncNow,
} from './api'
import { onSyncChange } from './offline'
import {
  DEFAULT_OPTIONS, mergeOptions, MODEL_TYPE, BRANCHES, ALL_BRANCHES,
  materialName, materialDescMap, issueName, issueCode,
} from './options'
import ManageInputs from './ManageInputs'
import Inventory from './Inventory'
import AgencyTotals from './AgencyTotals'
import SparePartsReport from './SparePartsReport'
import Dashboard from './Dashboard'
import AdminUsers from './AdminUsers'
import ReferenceCard from './ReferenceCard'
import CodeEntry from './CodeEntry'
import { Credit, Copyright, COPYRIGHT_HTML } from './copyright'
import { BrandMark } from './brand'
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
  buildMonthlyMatrix,
  buildDayMatrix,
  buildYearMatrix,
  parseMonthlyPaste,
  TYPE_ORDER,
} from './report'
import { PeriodPicker, makePeriod, periodLabel } from './period'
import './App.css'

// Actions whose "fault" is the whole device — no component issue needed.
const DEVICE_LEVEL = new Set(['PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE'])
const faultIsMeaningful = (f) => f.issue.trim() !== '' || DEVICE_LEVEL.has(String(f.action).toUpperCase())
const today = () => new Date().toISOString().slice(0, 10)
const NAV = [
  { id: 'report', icon: '📋', label: 'Report' },
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'monthly', icon: '📅', label: 'Monthly Report' },
  { id: 'spareparts', icon: '🧰', label: 'Spare Parts' },
  { id: 'agency', icon: '🏢', label: 'Agency Totals' },
  { id: 'inventory', icon: '📦', label: 'Inventory' },
  { id: 'reference', icon: '🔤', label: 'Code Reference' },
  { id: 'manage', icon: '⚙️', label: 'Manage Inputs', adminOnly: true },
  { id: 'admin', icon: '🔐', label: 'Users & Access', adminOnly: true },
]
// Data-heavy pages fill the available width (tables/charts); form-style pages
// stay centred at a readable measure.
const WIDE_PAGES = new Set(['dashboard', 'monthly', 'spareparts', 'agency', 'inventory', 'reference'])
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
// New fault rows default the Company to the last one the user picked.
const emptyFault = () => ({ issue: '', quantity: 1, action: 'CHANGE', company: loadLast().company ?? 'PROJECT 2', status: 'New' })

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
    // Merge so a partial update (e.g. just the company) keeps the other fields.
    localStorage.setItem(LAST_KEY, JSON.stringify({ ...loadLast(), ...v }))
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

const pad4 = (n) => String(n).padStart(4, '0')
// Next document number for a branch's OWN series (each branch numbers itself).
// Derived from the saved list so it updates instantly when the branch changes.
function nextSeriesNumber(saved, mode, branch) {
  const m = String(mode ?? 'report').toLowerCase() === 'transmittal' ? 'transmittal' : 'report'
  const b = String(branch ?? '')
  let max = 0
  for (const r of saved ?? []) {
    if (String(r.mode ?? 'report').toLowerCase() !== m) continue
    if (String(r.branch ?? '') !== b) continue
    if ((r.docNumber ?? 0) > max) max = r.docNumber ?? 0
  }
  return max + 1
}

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
        const hay = `${label} ${r.reportId} ${r.branch} ${r.dateLabel} ${e.technician ?? ''} ${r.receivedBy ?? ''} ${e.type} ${e.model} ${f.issue} ${f.company} ${f.status} ${e.comment ?? ''}`
        if (hay.toLowerCase().includes(q)) {
          out.push({
            date: r.dateLabel,
            branch: r.branch,
            qty: f.quantity,
            technician: e.technician ?? '',
            receivedBy: r.receivedBy ?? '',
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

// Handover personnel are remembered PER BRANCH: { [branch]: { t, r } }. In an
// All-Branches export each branch's own transmit/receive names are added.
const HANDOVER_KEY = 'trc_handover'
const loadHandover = () => {
  try {
    const v = JSON.parse(localStorage.getItem(HANDOVER_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

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

// Print an HTML document via a hidden iframe (more reliable than a popup for
// Chrome's "Save as PDF" — a script-opened window can hang on "Saving…"). The
// iframe is kept alive until the print dialog closes so the PDF has its source.
function printDocument(html) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)
  const cw = iframe.contentWindow
  let printed = false
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    // Delay so we never yank the source while Chrome is still writing the file.
    setTimeout(() => iframe.remove(), 1500)
  }
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      cw.focus()
      cw.print()
    } catch {
      /* ignore */
    }
  }
  cw.onafterprint = cleanup
  const doc = cw.document
  doc.open()
  doc.write(html)
  doc.close()
  if (doc.readyState === 'complete') setTimeout(doPrint, 200)
  else cw.onload = () => setTimeout(doPrint, 200)
  setTimeout(doPrint, 800) // fallback if load never fires
}

// A compact fingerprint of the working entries — changes when an entry is
// added, edited or removed. Used to auto-refresh when new data arrives.
function entriesSig(list) {
  if (!Array.isArray(list)) return ''
  return list
    .map((e) => `${e.id}:${(e.faults ?? []).map((f) => `${f.issue}|${f.action}|${f.quantity}|${f.company}|${f.status}`).join(',')}`)
    .join('||')
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
  const [copied, setCopied] = useState(false)
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
  // Monthly page granularity. The pasted-sheet feature is month-scoped by
  // design, so it always works against the anchor's month whatever the view.
  const [monthPeriod, setMonthPeriod] = useState(() => makePeriod('month'))
  const monthValue = monthPeriod.anchor.slice(0, 7) // YYYY-MM
  const [manualYear, setManualYear] = useState(null) // year view: { [month 0-11]: sheet }
  const [manualSheet, setManualSheet] = useState(null) // pasted override for current month+branch
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [editSavedId, setEditSavedId] = useState(null) // which saved row shows Load/Delete
  const [inventory, setInventory] = useState([]) // for the issue/material suggestions + usage
  const [busy, setBusy] = useState(false)
  const [branch, setBranch] = useState(loadBranch)
  const [deviceOpen, setDeviceOpen] = useState(true)
  const [faultsOpen, setFaultsOpen] = useState(true)
  const [lastAgency, setLastAgency] = useState(() => loadLast().agency ?? '')
  const isAllBranches = isAdmin && branch === ALL_BRANCHES
  // Monthly follows the same shared branch selection ('' = all branches).
  const monthBranch = isAllBranches ? '' : branch
  // Live, admin-managed branch list (falls back to the built-in defaults).
  const branchList = options.branches?.length ? options.branches : BRANCHES
  const [theme, setTheme] = useState(loadTheme)
  const [mode, setMode] = useState(loadMode)
  // Each branch has its OWN document series — derive the next id for the branch
  // in view (All Branches previews the unassigned '' series; saving is off there).
  const seriesBranch = isAllBranches ? '' : branch
  const nextReportId = `REP-${pad4(nextSeriesNumber(saved, 'report', seriesBranch))}`
  const nextTransId = `TRANS-${pad4(nextSeriesNumber(saved, 'transmittal', seriesBranch))}`
  const [sync, setSync] = useState({ online: true, pending: 0 })
  const [editId, setEditId] = useState(null) // entry id being edited in the modal
  const [editForm, setEditForm] = useState(null)
  const lastEntriesSig = useRef('') // baseline for the live-refresh poll
  const lastSavedSig = useRef('') // baseline for saved-report changes (any source)

  // Non-admins are pinned to their own branch everywhere.
  useEffect(() => {
    if (lockBranch) setBranch(lockBranch)
  }, [lockBranch])
  // Keep non-admins off admin-only pages.
  useEffect(() => {
    if (!isAdmin && NAV.find((n) => n.id === page)?.adminOnly) setPage('report')
  }, [isAdmin, page])
  // Handover is remembered per branch; the current fields reflect the selected one.
  const [handoverMap, setHandoverMap] = useState(loadHandover)
  const transmittedBy = handoverMap[branch]?.t ?? ''
  const receivedBy = handoverMap[branch]?.r ?? ''
  // In an All-Branches export, add each contributing branch's own personnel.
  const aggHandover = (field) => {
    const out = []
    const seen = new Set()
    for (const b of new Set((entries ?? []).map((e) => e.branch || ''))) {
      const v = handoverMap[b]?.[field]
      if (!v) continue
      for (const n of String(v).split(',').map((s) => s.trim()).filter(Boolean)) {
        const k = n.toLowerCase()
        if (!seen.has(k)) { seen.add(k); out.push(n) }
      }
    }
    return out.join(', ')
  }
  const reportTransmittedBy = isAllBranches ? aggHandover('t') : transmittedBy
  const reportReceivedBy = isAllBranches ? aggHandover('r') : receivedBy
  const saveTimer = useRef(null)

  // Monthly header: both header rows freeze together because the <thead>
  // itself is sticky (App.css) — one rigid block, not two independently
  // positioned rows. Two separate sticky rows each round to the nearest
  // physical pixel on their OWN, and at some scroll offsets those two
  // roundings disagree by a pixel, which reads as the border between them
  // twitching while you scroll. Stickying the thead as a whole makes that
  // impossible: there is only one positioned element for the two rows to
  // possibly disagree with, which is itself.

  const isTransmittal = mode === 'transmittal'
  // The browser's "Save as PDF" dialog seeds its filename from document.title,
  // so name it after the current document type. Transmittals also carry their
  // number (e.g. "TRC Transmittal Report-0004") to match the printed doc.
  useEffect(() => {
    if (isTransmittal) {
      const seq = String(nextTransId).replace(/^TRANS[-_]?/i, '')
      document.title = `TRC Transmittal Report-${seq}`
    } else {
      document.title = 'TRC Maintenance Report'
    }
  }, [isTransmittal, nextTransId])
  // The next id a Save would mint, for the current document type.
  const nextDocId = isTransmittal ? nextTransId : nextReportId
  // Inventory item names, offered as suggestions in the issue/material fields.
  const inventoryNames = useMemo(
    () => [...new Set((inventory ?? []).map((i) => String(i.itemCode || '').trim()).filter(Boolean))].sort(),
    [inventory],
  )
  // Material name (UPPER) -> Description, for the transmittal DESCRIPTION column.
  const descByMaterial = useMemo(() => materialDescMap(options.materials), [options.materials])

  function changeMode(e) {
    const m = e.target.value === 'transmittal' ? 'transmittal' : 'report'
    setMode(m)
    lsSet(MODE_KEY, m)
    setEditSavedId(null)
    refresh(m) // load that document type's own working entries
  }
  const setHandover = (field, value) =>
    setHandoverMap((m) => {
      const next = { ...m, [branch]: { ...(m[branch] || {}), [field]: value } }
      lsSet(HANDOVER_KEY, JSON.stringify(next))
      return next
    })
  const changeTransmittedBy = (e) => setHandover('t', e.target.value)
  const changeReceivedBy = (e) => setHandover('r', e.target.value)

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

  // The one branch selection, shared by every page. Selecting a branch on ANY
  // page updates this, so all nav pages follow the last choice.
  function selectBranch(b) {
    setBranch(b)
    try {
      localStorage.setItem(BRANCH_KEY, b)
    } catch {
      /* ignore storage errors */
    }
    // Re-fetch the working entries for the newly selected branch right away
    // (All Branches = '' = every branch, admin only).
    refresh(mode, isAdmin && b === ALL_BRANCHES ? '' : b)
    getInventory(isAdmin && b === ALL_BRANCHES ? '' : b).then(setInventory).catch(() => {})
  }
  const changeBranch = (e) => selectBranch(e.target.value)

  // Working entries are per document type; refresh the set for the given mode
  // (defaults to the current one).
  async function refresh(m = mode, b = isAllBranches ? '' : branch) {
    try {
      const list = await listEntries(m, b)
      setEntries(list)
      lastEntriesSig.current = entriesSig(list) // keep the live-poll baseline current
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
      const reports = data.reports ?? []
      // Only swap state when something actually changed, so polling this every
      // tick doesn't churn re-renders across the saved-report–derived pages.
      const sig = reports.map((r) => `${r.id}:${r.seq ?? ''}:${r.savedAt ?? r.updatedAt ?? ''}`).join('|')
      if (sig !== lastSavedSig.current) {
        lastSavedSig.current = sig
        setSaved(reports)
      }
    } catch {
      /* leave the saved list as-is if the endpoint is unavailable */
    }
  }

  const refreshInventory = () => getInventory(isAllBranches ? '' : branch).then(setInventory).catch(() => {})

  function reloadAll() {
    refresh()
    refreshSaved()
    refreshInventory()
    getOptions()
      .then((stored) => setOptions(mergeOptions(stored)))
      .catch(() => {})
  }

  useEffect(() => {
    reloadAll() // populate entries, saved, inventory + option suggestions
  }, [])

  // Live refresh: poll the working entries every 5s and, when a new one arrives (added,
  // edited or removed — e.g. from another device), refresh the view once. It
  // never touches the form you're editing, only the entries list + calculations.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      if (document.hidden || busy) return // don't fight an in-flight save/edit
      try {
        const list = await listEntries(mode, isAllBranches ? '' : branch)
        if (cancelled) return
        const sig = entriesSig(list)
        if (lastEntriesSig.current && sig !== lastEntriesSig.current) {
          setEntries(list) // a new/changed entry arrived
        }
        lastEntriesSig.current = sig
      } catch {
        /* offline or transient — try again next tick */
      }
      // Independently keep the saved-report–derived pages (Spare Parts, Dashboard,
      // Monthly, Agency, saved lists) live — a report saved on another tab/device
      // or via the WhatsApp bridge changes saved reports without touching this
      // tab's working entries. Signature-gated, so it only re-renders on a change.
      if (!cancelled) refreshSaved()
    }
    const id = setInterval(poll, 5000)
    const onVisible = () => {
      if (!document.hidden) poll() // catch up the moment the tab is focused
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, busy, branch, isAllBranches])

  // Offline status pill + refetch fresh data once queued writes have synced.
  useEffect(() => {
    const off = onSyncChange(setSync)
    const onSynced = () => reloadAll()
    window.addEventListener('offline-synced', onSynced)
    syncNow() // drain anything left from a previous offline session
    return () => {
      off()
      window.removeEventListener('offline-synced', onSynced)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSaveReport() {
    setBusy(true)
    try {
      const rep = await saveReport({ branch, mode, transmittedBy: reportTransmittedBy, receivedBy: reportReceivedBy })
      setError(null)
      await refresh() // saving auto-clears the working set server-side — reflect it
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
      // Remember this document's handover against its own branch.
      setHandoverMap((m) => {
        const b = rep.branch || ''
        const next = { ...m, [b]: { t: rep.transmittedBy ?? '', r: rep.receivedBy ?? '' } }
        lsSet(HANDOVER_KEY, JSON.stringify(next))
        return next
      })
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

  // Add a new selectable branch (persisted in the managed options list).
  function addBranch(name) {
    const v = String(name ?? '').trim()
    if (!v) return
    const cur = options.branches?.length ? options.branches : BRANCHES
    if (cur.some((b) => String(b).toLowerCase() === v.toLowerCase())) return
    setCategory('branches', [...cur, v])
  }

  // Toggle one chart's visibility (persisted alongside the option lists).
  function setChart(key, value) {
    setOptions((prev) => {
      const next = { ...prev, charts: { ...(prev.charts || {}), [key]: value } }
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
  const setFault = (i, field) => (e) => {
    // Remember the last Company so new fault rows (and the next entry) pre-select it.
    if (field === 'company') saveLast({ company: e.target.value })
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
  }
  const addFault = () => setForm((f) => ({ ...f, faults: [...f.faults, emptyFault()] }))
  const removeFault = (i) =>
    setForm((f) => ({ ...f, faults: f.faults.length === 1 ? f.faults : f.faults.filter((_, idx) => idx !== i) }))

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const payload = {
        ...form,
        mode, // keep report vs transmittal working sets separate
        branch: isAllBranches ? '' : branch, // owning branch (admins pick; non-admins forced server-side)
        // Transmittal carries a Type (no agency/model); Type falls back to OTHER.
        // The DESCRIPTION column is derived per material from the Materials list.
        ...(isTransmittal ? { type: form.type || 'OTHER', model: '', agency: '' } : {}),
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
      // Mirrored into state so the Agency dropdown re-sorts straight away —
      // localStorage on its own would not re-render anything.
      setLastAgency(form.agency)
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

  // Create an entry decoded from a CDS code. Goes through the same createEntry
  // call and the same branch/mode tagging as handleSubmit — the code box is a
  // faster way to fill the form, never a second way to write a report.
  async function handleCodeCreate(decoded) {
    setBusy(true)
    try {
      await createEntry({
        ...decoded,
        mode,
        branch: isAllBranches ? '' : branch,
      })
      saveLast({ model: decoded.model, type: decoded.type, agency: decoded.agency })
      setLastAgency(decoded.agency)
      setError(null)
      refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // ---- Edit an existing entry (modal) ----
  function openEdit(e) {
    setEditForm({
      reportDate: String(e.reportDate).slice(0, 10),
      technician: e.technician || '',
      agency: e.agency && e.agency !== '-' ? e.agency : '',
      telNumber: e.telNumber && e.telNumber !== '-' ? e.telNumber : '',
      issiNumber: e.issiNumber && e.issiNumber !== '*' ? e.issiNumber : '',
      type: e.type || '',
      model: e.model && e.model !== '-' ? e.model : '',
      comment: e.comment || '',
      faults: (e.faults ?? []).map((f) => ({
        issue: f.issue || '',
        quantity: f.quantity || 1,
        action: f.action || 'CHANGE',
        company: f.company || '',
        status: f.status || 'New',
      })),
    })
    setEditId(e.id)
  }
  const closeEdit = () => {
    setEditId(null)
    setEditForm(null)
  }
  const eSet = (field) => (ev) => setEditForm((f) => ({ ...f, [field]: ev.target.value }))
  const eSetModel = (ev) => {
    const model = ev.target.value
    setEditForm((f) => ({ ...f, model, type: MODEL_TYPE[model.toUpperCase()] ?? f.type }))
  }
  const eSetFault = (i, field) => (ev) => {
    if (field === 'company') saveLast({ company: ev.target.value })
    setEditForm((f) => ({
      ...f,
      faults: f.faults.map((fault, idx) => {
        if (idx !== i) return fault
        const next = { ...fault, [field]: field === 'quantity' ? Number(ev.target.value) : ev.target.value }
        if (field === 'issue') {
          const matched = options.actions.find((a) => a.toUpperCase() === String(ev.target.value).trim().toUpperCase())
          if (matched) next.action = matched
        }
        return next
      }),
    }))
  }
  const eAddFault = () => setEditForm((f) => ({ ...f, faults: [...f.faults, emptyFault()] }))
  const eRemoveFault = (i) =>
    setEditForm((f) => ({ ...f, faults: f.faults.length === 1 ? f.faults : f.faults.filter((_, idx) => idx !== i) }))

  async function handleUpdateEntry(ev) {
    ev.preventDefault()
    setBusy(true)
    try {
      const payload = {
        ...editForm,
        mode,
        ...(isTransmittal ? { type: editForm.type || 'OTHER', model: '', agency: '' } : {}),
        faults: editForm.faults
          .filter(faultIsMeaningful)
          .map((f) => ({ ...f, quantity: Math.max(1, Number(f.quantity) || 1) })),
      }
      if (payload.faults.length === 0) {
        setError('Add at least one fault — pick an issue, or an action like PROGRAM/INSTALL/DISMANTLE.')
        setBusy(false)
        return
      }
      await updateEntry(editId, payload)
      closeEdit()
      setError(null)
      refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleClearAll() {
    if (!window.confirm(`Clear all ${entries.length} entries? This can't be undone (Save first to keep a copy).`)) {
      return
    }
    try {
      await clearEntries(mode, isAllBranches ? '' : branch)
      setError(null)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  // One report per date, newest first. The live view uses the draft (next) id
  // until you Save, which mints the real REP-#### number.
  const reports = useMemo(() => {
    // All Branches: the working set already holds every branch's entries for this
    // mode. Consolidate them into ONE report so every branch merges into a single
    // exportable document — maintenance and transmittal alike (branches with no
    // data simply don't contribute).
    if (isAllBranches) {
      if (!entries.length) return []
      const id = `${ALL_BRANCHES}-${nextDocId}` // e.g. "All Branches-REP-0001"
      const handover = { branch: ALL_BRANCHES, mode, transmittedBy: reportTransmittedBy, receivedBy: reportReceivedBy }
      // Label spans the date range the merged entries cover.
      const dates = [...new Set(entries.map((e) => fmtLongDate(e.reportDate)).filter(Boolean))]
      const label = dates.length <= 1 ? dates[0] ?? '' : `${dates[0]} … ${dates[dates.length - 1]}`
      return [buildDateReport(label, id, entries, handover)]
    }
    return groupReports(entries).map((g) =>
      buildDateReport(g.dateLabel, repLabel(nextDocId, branch, mode), g.entries, {
        branch,
        mode,
        transmittedBy: reportTransmittedBy,
        receivedBy: reportReceivedBy,
      }),
    )
  }, [isAllBranches, form.reportDate, saved, entries, nextDocId, branch, mode, reportTransmittedBy, reportReceivedBy])
  // buildTxt folds the Agency Summary in (daily reports only), so this single
  // string is what the box shows, what ⭳ Text writes, and what a copy yields.
  const combinedTxt = useMemo(() => reports.map(buildTxt).join('\n\n\n'), [reports])

  // Agency dropdown order: the one picked last sits on top, then the rest by how
  // often they have actually been used (saved reports + the working set), with
  // A–Z breaking ties. Usage is counted from real entries rather than a separate
  // tally, so the list can never drift out of step with the data.
  const agencyOptions = useMemo(() => {
    const counts = new Map()
    const bump = (v) => {
      const a = String(v ?? '').trim().toUpperCase()
      if (a && a !== '-') counts.set(a, (counts.get(a) ?? 0) + 1)
    }
    for (const r of saved ?? []) for (const e of r.entries ?? []) bump(e.agency)
    for (const e of entries ?? []) bump(e.agency)

    const all = options.agencies ?? []
    const uses = (a) => counts.get(String(a).trim().toUpperCase()) ?? 0
    const rest = all.filter((a) => a !== lastAgency).sort((a, b) => uses(b) - uses(a) || a.localeCompare(b))
    // Only pin the last pick if it is still an option — a renamed or deleted
    // agency must not resurrect itself at the top of the list.
    return all.includes(lastAgency) ? [lastAgency, ...rest] : rest
  }, [options.agencies, saved, entries, lastAgency])

  // Collapse the Device/Faults cards in All-Branches (read-only merged) mode.
  useEffect(() => {
    setDeviceOpen(!isAllBranches)
    setFaultsOpen(!isAllBranches)
  }, [isAllBranches])

  // Activity matrix (rows × terminal columns) from saved reports. All three
  // views share one column layout — only the row axis changes: a single date,
  // the days of a month, or the twelve months of a year.
  const matrix = useMemo(() => {
    const [y, m, d] = monthPeriod.anchor.split('-').map(Number)
    if (!y || !m) return null
    if (monthPeriod.kind === 'year') {
      return buildYearMatrix(saved, { year: y, branch: monthBranch, manualByMonth: manualYear })
    }
    const opts = { year: y, month: m - 1, branch: monthBranch, manual: manualSheet }
    return monthPeriod.kind === 'day'
      ? buildDayMatrix(saved, { ...opts, day: d })
      : buildMonthlyMatrix(saved, opts)
  }, [saved, monthPeriod, monthBranch, manualSheet, manualYear])

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
  // Day (1 row) and Year (12 rows) are already short enough to show whole.
  const visibleRows = useMemo(() => {
    if (!matrix) return []
    if (monthExpanded || matrix.kind !== 'month') return matrix.rows
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

  // Year view needs all twelve months' pasted sheets to roll them up. Fetched
  // only while that view is open, and every response is cached by the offline
  // layer, so flipping back and forth costs nothing after the first load.
  useEffect(() => {
    if (monthPeriod.kind !== 'year') {
      setManualYear(null)
      return undefined
    }
    let active = true
    const year = monthPeriod.anchor.slice(0, 4)
    const months = Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, '0')}`)
    Promise.all(months.map((mk) => getMonthly(mk, monthBranch).catch(() => null)))
      .then((results) => {
        if (!active) return
        const byMonth = {}
        results.forEach((r, m) => {
          if (r?.data) byMonth[m] = r.data
        })
        setManualYear(byMonth)
      })
      .catch(() => active && setManualYear(null))
    return () => {
      active = false
    }
  }, [monthPeriod.kind, monthPeriod.anchor, monthBranch])

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

  // One naming scheme across all three granularities, e.g.
  // "Activity-13-August-2026-MAKKAH" / "Activity-August-2026" / "Activity-2026".
  const matrixTitle = () => `Activity ${periodLabel(monthPeriod)}${matrix?.branch ? ` · ${matrix.branch}` : ''}`
  const matrixSlug = () =>
    `Activity-${periodLabel(monthPeriod).replace(/\s+/g, '-')}${matrix?.branch ? `-${matrix.branch}` : ''}`

  function handleExportMonthlyCsv() {
    if (!matrix) return
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = [...matrix.rowHeads, ...matrix.columns.map((c) => `${c.group} ${c.label}`), 'Activity / spare parts']
    const lines = [header.map(esc).join(',')]
    for (const r of matrix.rows) {
      lines.push([r.date, r.dayName, ...matrix.columns.map((c) => r.counts[c.key] || 0), r.description].map(esc).join(','))
    }
    lines.push(['Total', '', ...matrix.columns.map((c) => matrix.totals[c.key] || 0), ''].map(esc).join(','))
    downloadText(`${matrixSlug()}.csv`, lines.join('\n'))
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
    h += `<th style="${hb}">${esc(matrix.rowHeads[0])}</th><th style="${hb}">${esc(matrix.rowHeads[1])}</th>`
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
    a.download = `${matrixSlug()}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Formatted PDF (print window) of the monthly matrix — red device labels,
  // green weekends, grouped headers — matching the desktop exported file.
  function handleExportMonthlyPdf() {
    if (!matrix) return
    const title = matrixTitle()
    // Fixed column widths: Date/Day wide enough to read on one line, the terminal
    // columns stay slim (single digits — their names sit on a diagonal header), and
    // the activity description gets the remaining space.
    const n = matrix.columns.length
    const dev = (40 / Math.max(1, n)).toFixed(3)
    const colgroup =
      `<colgroup><col style="width:7%"/><col style="width:6%"/>` +
      matrix.columns.map(() => `<col style="width:${dev}%"/>`).join('') +
      `<col style="width:47%"/></colgroup>`
    const html =
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
        // Tight margins + compact rows so a full month fits on ONE landscape page.
        `<style>@page{size:A4 landscape;margin:4mm}` +
        `body{font-family:Arial,sans-serif;color:#111;margin:4px}h1{font-size:12px;margin:0 0 3px}` +
        // Fill the landscape width and honour the colgroup widths exactly.
        `table{width:100%!important;border-collapse:collapse;table-layout:fixed}` +
        // Small font + thin padding shrink every row to fit 31 days on one page.
        `td,th{font-size:8px!important;line-height:1.05!important}` +
        `td{padding:1px 3px!important;word-break:break-word;overflow-wrap:anywhere}` +
        `thead th{padding:1px 2px!important}` +
        // Date & Day: read on a single line, never wrap.
        `td:nth-child(1),td:nth-child(2){white-space:nowrap;text-align:center}` +
        // Diagonal device-name headers so the slim columns stay readable.
        `th.dev{height:54px;padding:0!important;vertical-align:bottom}` +
        `th.dev>div{width:13px;margin:0 auto;transform:translateX(3px) rotate(-45deg)}` +
        `th.dev>div>span{display:inline-block;white-space:nowrap;font-size:7.5px;font-weight:bold}` +
        // Description keeps wrapping so long activity text fits.
        `td:last-child{text-align:left;word-break:break-word;overflow-wrap:anywhere}` +
        `p.foot{margin-top:4px;font-size:7.5px;color:#555}</style></head><body>` +
        `<h1>${title}</h1>${monthlyTableHtml(colgroup)}` +
        `<p class="foot">${COPYRIGHT_HTML}</p>` +
        `</body></html>`
    printDocument(html)
  }

  // Keep daily reports and transmittals in separate lists (no mixing).
  // Admin sees all branches' saved reports; scope the list to the selected
  // branch unless "All Branches" is chosen. (Non-admins are already server-scoped.)
  const inBranch = (r) => isAllBranches || String(r.branch ?? '') === String(branch)
  const dailySaved = useMemo(() => saved.filter((r) => !isTx(r) && inBranch(r)), [saved, branch, isAllBranches])
  const txSaved = useMemo(() => saved.filter((r) => isTx(r) && inBranch(r)), [saved, branch, isAllBranches])
  const reportResults = useMemo(() => searchInside(dailySaved, savedSearch), [dailySaved, savedSearch])
  const txResults = useMemo(() => searchInside(txSaved, savedTxSearch), [txSaved, savedTxSearch])

  async function handleCopyTxt() {
    if (!combinedTxt) return
    try {
      await navigator.clipboard.writeText(combinedTxt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      setError(`Could not copy: ${err.message}`)
    }
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
          <button type="button" className="icon-edit" onClick={() => setEditSavedId(r.id)} aria-label="Edit" title="Edit">
            ✎
          </button>
        )}
      </div>
    </li>
  )

  const searchList = (results, query, tx = false) =>
    results.length === 0 ? (
      <p className="empty">No items match “{query}”.</p>
    ) : (
      <ul className="search-results">
        <li className="search-results-head muted small">
          <span>Item</span>
          <span>{tx ? 'Received by' : 'Technician'}</span>
          <span>Date</span>
          <span>Branch</span>
          <span>Qty</span>
          <span>Report</span>
          <span></span>
        </li>
        {results.map((res, idx) => (
          <li key={idx}>
            <span className="res-item">{res.item}</span>
            <span className="muted small">{(tx ? res.receivedBy : res.technician) || '—'}</span>
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
  const savedCard = ({ icon, title, list, open, setOpen, search, setSearch, results, hint, empty, placeholder, tx = false }) => (
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
            searchList(results, search, tx)
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
            <BrandMark />
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
          {(!sync.online || sync.pending > 0) && (
            <div className={`sync-pill${sync.online ? ' syncing' : ' offline'}`} title={sync.online ? 'Syncing queued changes to the server' : 'Working offline — changes are saved on this device and will sync when you reconnect'}>
              <span className="side-ico">{sync.online ? '⟳' : '📴'}</span>
              <span className="side-label">
                {sync.online ? 'Syncing…' : 'Offline'}
                {sync.pending > 0 && <small>{sync.pending} change{sync.pending === 1 ? '' : 's'} pending</small>}
              </span>
            </div>
          )}
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
                  {branchList.map((b) => (
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
            {isAllBranches ? (
              <p className="saved-hint">
                All Branches: each branch's own handover is added automatically —
                Transmitted by <strong>{reportTransmittedBy || '—'}</strong>; Received by{' '}
                <strong>{reportReceivedBy || '—'}</strong>. Set each branch's names by selecting that branch.
              </p>
            ) : (
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
            )}
          </section>
        )}

        {/* Code entry is a shortcut into the SAME create path as the form below.
            Transmittals move materials and have no CDS code, so it is hidden there. */}
        {!isTransmittal && (
          <CodeEntry
            options={options}
            agencies={agencyOptions}
            reportDate={form.reportDate}
            onCreate={handleCodeCreate}
            busy={busy}
          />
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
                  {agencyOptions.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              {!isTransmittal && (
                <>
                  <label>
                    <span className="cap">Tel number <span className="opt">(optional)</span></span>
                    <input value={form.telNumber} onChange={set('telNumber')} placeholder="Last 4 digits, e.g. 1234" />
                  </label>
                  <label>
                    <span className="cap">ISSI number <span className="opt">(optional)</span></span>
                    <input value={form.issiNumber} onChange={set('issiNumber')} placeholder="Last 4 digits, e.g. 1234" />
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
              <div className={`fault-row fault-head${isTransmittal ? ' fault-row--tx fault-row--txtype' : ''}`}>
                {isTransmittal && <span>Type</span>}
                <span>{isTransmittal ? 'Material' : 'Issue'}</span>
                <span>Qty</span>
                {!isTransmittal && <span>Action</span>}
                <span>Company</span>
                {isTransmittal && <span>Status</span>}
                <span />
              </div>
              {form.faults.map((fault, i) => (
                <div className={`fault-row${isTransmittal ? ' fault-row--tx fault-row--txtype' : ''}`} key={i}>
                  {isTransmittal &&
                    (i === 0 ? (
                      <select value={form.type || 'OTHER'} onChange={set('type')} aria-label="Type">
                        {options.types.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="tx-type-spacer" aria-hidden="true" />
                    ))}
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
              {options.issueTypes.map((it, i) => {
                const name = issueName(it)
                // The CDS code rides along as the option's label, so it is
                // visible while picking the issue by hand too.
                const code = issueCode(it)
                return (
                  <option key={`iss-${name}-${i}`} value={name}>
                    {code || undefined}
                  </option>
                )
              })}
              {/* Inventory items — picking one links it for auto stock deduction. */}
              {inventoryNames.map((n) => (
                <option key={`inv-${n}`} value={n} />
              ))}
            </datalist>
            <datalist id="materials-list">
              {options.materials.map((m, i) => {
                const name = materialName(m)
                return <option key={`mat-${i}-${name}`} value={name} />
              })}
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
                      <>
                        {e.type && e.type.toUpperCase() !== 'OTHER' && (
                          <p className="muted small">{e.type}</p>
                        )}
                        <p>
                          <strong>
                            {e.faults
                              .map((f) => {
                                const d = descByMaterial[String(f.issue).toUpperCase()]
                                return `${f.issue}${d ? ` — ${d}` : ''} (${f.quantity})${f.status ? ` · ${f.status}` : ''}`
                              })
                              .join(', ')}
                          </strong>
                        </p>
                      </>
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
                  <button type="button" className="entry-update" onClick={() => openEdit(e)} aria-label="Update entry" title="Update entry">
                    ✎
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {editForm && (
          <div className="modal-backdrop" onClick={closeEdit}>
            <div className="modal edit-modal" onClick={(ev) => ev.stopPropagation()}>
              <div className="modal-head">
                <h3>Update entry</h3>
                <button type="button" className="ghost" onClick={closeEdit} aria-label="Close">
                  ✕
                </button>
              </div>
              <form onSubmit={handleUpdateEntry} className="entry-form modal-body">
                {!isTransmittal && (
                  <div className="grid">
                    <label>
                      Model {editForm.type === 'OTHER' && <span className="opt">(optional)</span>}
                      <select value={editForm.model} onChange={eSetModel} required={editForm.type !== 'OTHER'}>
                        <option value="">— select —</option>
                        {options.models.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Type
                      <select value={editForm.type} onChange={eSet('type')} required>
                        <option value="">— select —</option>
                        {options.types.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Agency
                      <select value={editForm.agency} onChange={eSet('agency')} required>
                        <option value="">— select —</option>
                        {agencyOptions.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="cap">Tel number <span className="opt">(optional)</span></span>
                      <input value={editForm.telNumber} onChange={eSet('telNumber')} placeholder="Last 4 digits, e.g. 1234" />
                    </label>
                    <label>
                      <span className="cap">ISSI number <span className="opt">(optional)</span></span>
                      <input value={editForm.issiNumber} onChange={eSet('issiNumber')} placeholder="Last 4 digits, e.g. 1234" />
                    </label>
                    <label>
                      <span className="cap">Technician <span className="opt">(optional · multiple)</span></span>
                      <MultiSelect
                        value={editForm.technician}
                        options={options.technicians}
                        onChange={(v) => setEditForm((f) => ({ ...f, technician: v }))}
                      />
                    </label>
                    <label>
                      Report date
                      <input type="date" value={editForm.reportDate} onChange={eSet('reportDate')} required />
                    </label>
                  </div>
                )}

                {isTransmittal && (
                  <div className="grid tx-fields">
                    <label>
                      Type
                      <select value={editForm.type || 'OTHER'} onChange={eSet('type')}>
                        {options.types.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Report date
                      <input type="date" value={editForm.reportDate} onChange={eSet('reportDate')} required />
                    </label>
                  </div>
                )}

                <div className="faults">
                  <div className={`fault-row fault-head${isTransmittal ? ' fault-row--tx' : ''}`}>
                    <span>{isTransmittal ? 'Material' : 'Issue'}</span>
                    <span>Qty</span>
                    {!isTransmittal && <span>Action</span>}
                    <span>Company</span>
                    {isTransmittal && <span>Status</span>}
                    <span />
                  </div>
                  {editForm.faults.map((fault, i) => (
                    <div className={`fault-row${isTransmittal ? ' fault-row--tx' : ''}`} key={i}>
                      <input
                        list={isTransmittal ? 'materials-list' : 'issue-types'}
                        value={fault.issue}
                        onChange={eSetFault(i, 'issue')}
                        placeholder="e.g. A COVER"
                        aria-label={isTransmittal ? 'Material' : 'Issue'}
                      />
                      <input type="number" min="1" step="1" value={fault.quantity} onChange={eSetFault(i, 'quantity')} aria-label="Quantity" />
                      {!isTransmittal && (
                        <select value={fault.action} onChange={eSetFault(i, 'action')} aria-label="Action">
                          {options.actions.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      )}
                      <select value={fault.company} onChange={eSetFault(i, 'company')} aria-label="Company">
                        <option value="">— none —</option>
                        {options.companies.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      {isTransmittal && (
                        <select value={fault.status} onChange={eSetFault(i, 'status')} aria-label="Item status">
                          {options.statuses.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        className="fault-remove"
                        onClick={() => eRemoveFault(i)}
                        disabled={editForm.faults.length === 1}
                        aria-label="Remove fault"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <label className="comment-field">
                  <span className="cap">Comment <span className="opt">(optional)</span></span>
                  <textarea value={editForm.comment} onChange={eSet('comment')} rows={2} placeholder="Note for this entry…" />
                </label>

                <div className="modal-actions">
                  <button type="button" className="add-fault" onClick={eAddFault}>
                    {isTransmittal ? '+ Add material' : '+ Add fault'}
                  </button>
                  <span className="modal-actions-right">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        const id = editId
                        closeEdit()
                        handleDelete(id)
                      }}
                    >
                      🗑 Delete
                    </button>
                    <button type="button" className="ghost" onClick={closeEdit}>
                      Cancel
                    </button>
                    <button type="submit" className="submit" disabled={busy}>
                      Save changes
                    </button>
                  </span>
                </div>
              </form>
            </div>
          </div>
        )}

        <section className="breakdown">
          <div className="breakdown-head">
            <h2>
              Report text{' '}
              {reports.length > 0 && <span className="hint">(next: {nextDocId} · unsaved)</span>}
            </h2>
            <div className="breakdown-actions">
              <button type="button" className="btn-txt" onClick={handleCopyTxt} disabled={!reports.length}>
                {copied ? '✅ Copied' : '⧉ Copy'}
              </button>
              <a
                href="https://chat.whatsapp.com/GseaRTA11rvBvlAPBjunb5"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-whatsapp"
                title="Open the TRCMTJDailyActivityReport WhatsApp group to paste the copied report"
              >
                🟢 WhatsApp
              </a>
              <button
                type="button"
                className="save-report"
                onClick={handleSaveReport}
                disabled={!reports.length || busy || isAllBranches}
                title={isAllBranches ? 'All-Branches is a merged read-only view' : undefined}
              >
                💾 Save report
              </button>
              <button type="button" className="btn-pdf" onClick={() => window.print()} disabled={!reports.length}>
                ⭳ PDF
              </button>
            </div>
          </div>
          {/* One box: the Agency Summary is now part of the report text itself,
              so what you read here is exactly what Text/PDF export and what a
              select-all copy puts on the clipboard. */}
          <textarea readOnly value={combinedTxt || 'No entries yet.'} rows={22} />
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
            tx: true,
          })}
            </>
          )}

          {page === 'monthly' && (
            <section className="monthly">
              <h2 className="page-title">
                📅 Activity report <span className="hint">· {periodLabel(monthPeriod)}</span>
              </h2>

              {matrix && (
            <div className="monthly-body">
              <div className="monthly-controls">
                <PeriodPicker period={monthPeriod} onChange={setMonthPeriod} />
                <label>
                  Branch
                  {isAdmin ? (
                    <select value={branch} onChange={changeBranch}>
                      {branchList.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                      <option value={ALL_BRANCHES}>{ALL_BRANCHES}</option>
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
                {/* A pasted sheet is stored per month, so it is edited from the
                    month view. Day and Year still READ it — Year rolls all
                    twelve months' sheets into its totals. */}
                {matrix.kind === 'month' && (
                  <button type="button" className="add-fault" onClick={() => setPasteOpen((o) => !o)}>
                    📋 Paste data
                  </button>
                )}
                {matrix.kind === 'month' && manualSheet && (
                  <button type="button" className="clear-all" onClick={handleClearManual}>
                    Clear pasted data
                  </button>
                )}
              </div>

              {pasteOpen && (
                <div className="paste-box">
                  <p className="saved-hint">
                    Paste rows from your sheet (copy from Excel = tab-separated): <strong>Date, Day, the 18 columns
                    in order, then Description</strong>. Empty cells stay blank. Saved for {periodLabel(monthPeriod)}
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
                      Load into {periodLabel(monthPeriod)}
                    </button>
                    <button type="button" className="add-fault" onClick={() => setPasteOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <p className="saved-hint">
                {matrix.kind === 'month' && manualSheet ? (
                  <>
                    📌 Showing <strong>pasted data</strong> for {periodLabel(monthPeriod)}
                    {monthBranch ? ` · ${monthBranch}` : ''}. Paste again to replace, or Clear to revert to live.
                  </>
                ) : (
                  <>
                    Activity counts per terminal, built from your saved <strong>reports</strong> for{' '}
                    {periodLabel(monthPeriod)}. Model cells = total part quantity; Install/Dismantle are per brand.
                    {matrix.kind === 'year' && ' One row per month; the activity-description column is per-day, so it is blank here.'}
                  </>
                )}
              </p>
              <div className="monthly-scroll">
                <table className="monthly-table">
                  <thead>
                    <tr>
                      {/* Date/Day used to span both header rows via rowSpan, but a
                          rowSpan cell that is ALSO sticky on both axes (top AND
                          left, for the frozen corner) fights with row 2's own
                          sticky offset — the label goes blank once you scroll.
                          Giving each row its own plain cell avoids the conflict;
                          row 2's is just a blank filler so the column still lines
                          up under row 1's label. */}
                      <th className="dh col-date">{matrix.rowHeads[0]}</th>
                      <th className="dh col-day">{matrix.rowHeads[1]}</th>
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
                      <th rowSpan={2} className="act-head">
                        Activity description and spare parts was used
                      </th>
                    </tr>
                    <tr>
                      <th className="dh col-date" />
                      <th className="dh col-day" />
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
              {/* Only the month view is windowed — Day is one row and Year is
                  twelve, both already shown whole. */}
              {matrix.kind === 'month' && matrix.rows.length > 7 && (
                <button type="button" className="month-expand" onClick={() => setMonthExpanded((o) => !o)}>
                  {monthExpanded ? '▲ Show 7 days only' : `▼ View whole month (${matrix.rows.length} days)`}
                </button>
              )}
            </div>
          )}
            </section>
          )}

          {page === 'dashboard' && <Dashboard saved={saved} branches={branchList} branchSel={branch} onBranch={selectBranch} embedded lockBranch={lockBranch} charts={options.charts} />}

          {page === 'spareparts' && <SparePartsReport saved={saved} branches={branchList} branchSel={branch} onBranch={selectBranch} embedded lockBranch={lockBranch} charts={options.charts} />}

          {page === 'agency' && <AgencyTotals saved={saved} branches={branchList} branchSel={branch} onBranch={selectBranch} embedded lockBranch={lockBranch} />}

          {page === 'inventory' && <Inventory embedded branch={isAllBranches ? '' : branch} />}

          {page === 'reference' && <ReferenceCard isAdmin={isAdmin} issueTypes={options.issueTypes} />}

          {page === 'manage' && isAdmin && <ManageInputs options={options} onChange={setCategory} onToggleChart={setChart} embedded />}

          {page === 'admin' && isAdmin && <AdminUsers currentUser={user} branches={branchList} onAddBranch={addBranch} embedded />}

          <footer className="app-footer">
            <Credit />
          </footer>
        </main>
      </div>

      {/* Printable view — hidden on screen, shown only when printing (Save as PDF). */}
      <div className="print-only print-report">
        {reports.map((r) => (
          <PrintDate key={r.reportId ?? r.dateLabel} report={r} descByMaterial={descByMaterial} handoverByBranch={handoverMap} />
        ))}
      </div>
    </>
  )
}

// Route each printed page to the right layout for its mode.
function PrintDate({ report, descByMaterial, handoverByBranch }) {
  return report.mode === 'transmittal' ? (
    <TransmittalPrint report={report} descByMaterial={descByMaterial} handoverByBranch={handoverByBranch} />
  ) : (
    <ReportPrint report={report} />
  )
}

// Transaction date like "Aug. 5, 2026" from an ISO / yyyy-mm-dd value.
const MON_ABBR = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.']
function fmtLongDate(v) {
  const s = String(v ?? '')
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${MON_ABBR[+m[2] - 1]} ${+m[3]}, ${m[1]}`
  const d = new Date(s)
  return isNaN(d) ? '' : `${MON_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

// Bare person name: drop any branch label already baked in (e.g. "Gabriel - Jeddah TRC" -> "Gabriel").
const bareName = (n) => String(n || '').replace(/[\s\-–/]*[\w\s]*\bTRC\b\s*$/i, '').trim()

// Comma-separated names with branch labels stripped: "Gabriel, Sam".
const bareList = (val) => String(val || '').split(',').map(bareName).filter(Boolean).join(', ')

// Combined "Transmitter/Receiver" for a branch, bare names only: "Gibriel/Amir".
function handoverBy(handover) {
  const t = bareList(handover?.t)
  const r = bareList(handover?.r)
  return [t, r].filter(Boolean).join('/') || '-'
}

// Transmittal manifest: material lines + handover signatures.
function TransmittalPrint({ report, descByMaterial = {}, handoverByBranch = {} }) {
  const rows = transmittalRows(report.entries)
  const notes = reportNotes(report.entries)
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const isAll = report.branch === ALL_BRANCHES

  // All-Branches: group rows by branch (A–Z), materials A–Z within each, and add
  // merged Transmitted/Received-by columns showing each branch's own personnel.
  const groups = isAll
    ? [...rows.reduce((m, r) => m.set(r.branch || '', [...(m.get(r.branch || '') || []), r]), new Map())]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([b, list]) => [b, list.slice().sort((x, y) => x.material.localeCompare(y.material))])
    : null

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
            <th>#</th><th>TYPE</th><th>MATERIAL</th><th>DESCRIPTION</th><th>QTY</th><th>COMPANY</th><th>STATUS</th>
            {isAll && <><th>DATE</th><th>BY:</th></>}
          </tr>
        </thead>
        <tbody>
          {isAll
            ? (() => {
                let n = 0
                return groups.flatMap(([b, list]) => {
                  // Merge the DATE cell across consecutive rows that share the same date.
                  const dateSpan = list.map((r, i) => {
                    const d = fmtLongDate(r.date)
                    if (i > 0 && fmtLongDate(list[i - 1].date) === d) return 0
                    let span = 1
                    while (i + span < list.length && fmtLongDate(list[i + span].date) === d) span += 1
                    return span
                  })
                  return list.map((r, i) => {
                    n += 1
                    return (
                      <tr key={`${b}-${i}`}>
                        <td>{n}</td>
                        <td>{r.type}</td>
                        <td className="ia">{r.material}</td>
                        <td>{descByMaterial[String(r.material).toUpperCase()] || ''}</td>
                        <td>{r.qty}</td>
                        <td>{r.company}</td>
                        <td>{r.status}</td>
                        {dateSpan[i] > 0 && (
                          <td className="nowrap" rowSpan={dateSpan[i]}>
                            {fmtLongDate(r.date)}
                          </td>
                        )}
                        {i === 0 && <td rowSpan={list.length}>{handoverBy(handoverByBranch[b])}</td>}
                      </tr>
                    )
                  })
                })
              })()
            : rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.type}</td>
                  <td className="ia">{r.material}</td>
                  <td>{descByMaterial[String(r.material).toUpperCase()] || ''}</td>
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
        <Copyright />
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
        <Copyright />
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
