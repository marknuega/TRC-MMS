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
  setSavedReportReference,
  getMonthly,
  saveMonthly,
  clearMonthly,
  getInventory,
  syncNow,
} from './api'
import { onSyncChange } from './offline'
import { advanceOnEnter, isAddFaultShortcut, isSaveShortcut } from './focusNav'
import {
  DEFAULT_OPTIONS,
  mergeOptions,
  MODEL_TYPE,
  BRANCHES,
  ALL_BRANCHES,
  ALL_REGIONS,
  materialName,
  materialDescMap,
  issueName,
  issueCode,
  technicianName,
  optionNames,
  telPick,
  isServiceAction,
  issiPick,
  isNoActivityIssi,
  isNoActivityIssue,
  noActivityFill,
  telForModel,
  issiWireOffer,
  withIssiPrefix,
} from './options'
import ManageInputs from './ManageInputs'
import Inventory from './Inventory'
import AgencyTotals from './AgencyTotals'
import SparePartsReport from './SparePartsReport'
import Dashboard from './Dashboard'
import AdminUsers from './AdminUsers'
import ReferenceCard from './ReferenceCard'
import Toast from './Toast'
import CodeEntry from './CodeEntry'
import SearchSelect from './SearchSelect'
import IssueInput from './IssueInput'
import { Credit, Copyright, COPYRIGHT_HTML } from './copyright'
import { BrandMark } from './brand'
import { BUILD_ID, UpdateBanner } from './version.jsx'
import { printDocument, printCurrentPage } from './printDoc.js'
import InstallApp from './InstallApp.jsx'
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
  setIssueClaims,
  classify,
  shortDocId,
  shortIdOf,
  blockNumber,
  parseBlockNumber,
  seriesOf,
  docIdMatches,
  displayNumber,
  TYPE_ORDER,
} from './report'
import { PeriodPicker, makePeriod, periodLabel } from './period'
import './App.css'

// Actions whose "fault" is the whole device — no component issue needed.
// INSTALLATION/RE-INSTALLATION alongside INSTALL/RE-INSTALL: Manage inputs
// lets an admin rename the Actions list, and that's a renaming of the same
// action, not a different one — see SERVICE_ACTIONS in options.js.
const DEVICE_LEVEL = new Set([
  'PROGRAM',
  'RE-PROGRAM',
  'INSTALL',
  'INSTALLATION',
  'RE-INSTALL',
  'RE-INSTALLATION',
  'DISMANTLE',
])
const faultIsMeaningful = (f) => f.issue.trim() !== '' || DEVICE_LEVEL.has(String(f.action).toUpperCase())

// The blank choice, so an empty Action or Company reads "— none —" rather than
// falling back to the "— select —" placeholder of a field nobody has answered.
// The two are different statements: one says no company supplied a part, the
// other says the question is still open.
const NONE_OPTION = { value: '', label: '— none —' }

// A row is floored at 1 on save — a row worth writing down is a row of at least
// one thing — except the no-activity row, where 0 is the whole point and a
// floor of 1 would report a device maintained on a day nobody touched one.
//
// Keyed on the ROW's own issue, not on how it came to be filled in: the ISSI 00
// shortcut and typing "No Activity" into the field are two ways to the same row
// and must save identically. Shared by the entry form and the edit modal.
const withSavedQuantity = (f) => ({
  ...f,
  quantity: isNoActivityIssue(f.issue) ? Math.max(0, Number(f.quantity) || 0) : Math.max(1, Number(f.quantity) || 1),
})
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
  // Reference data (Manage Inputs) stays global-admin-only; a director only
  // manages accounts within their own region, hence directorOk here alone.
  {
    id: 'admin',
    icon: '🔐',
    label: 'Users & Access',
    adminOnly: true,
    directorOk: true,
  },
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
// The Company a part row starts on: the last one picked, or the house default.
// Also what a row goes back to when its action stops being a service.
const lastCompany = () => loadLast().company ?? 'PROJECT 2'
// New fault rows default the Company to the last one the user picked.
const emptyFault = () => ({
  issue: '',
  quantity: 1,
  action: 'CHANGE',
  company: lastCompany(),
  status: 'New',
})

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

// Report number with the branch prefixed, e.g. "MAKKAH-REP-0001" — the long
// form the record is FILED under. Documents are shown by their short id
// (shortLabel below); this stays for what the server stores and for search.
// In transmittal mode the "REP" series reads "TRANS" (e.g. "TAIF-TRANS-0003").
const repLabel = (baseId, branch, mode) => {
  const id = mode === 'transmittal' ? String(baseId ?? '-').replace('REP-', 'TRANS-') : (baseId ?? '-')
  return `${branch ? `${branch.toUpperCase()}-` : ''}${id}`
}
const isTx = (r) => String(r?.mode ?? '').toUpperCase() === 'TRANSMITTAL'

const pad4 = (n) => String(n).padStart(4, '0')
// The id a saved document is SHOWN by: MAKKAH-REP-0018 reads MAK-REP-A018.
// Both forms render the same stored docNumber — see shortIdOf in report.js,
// which the server's daily text imports too so the two can never disagree.
const shortLabel = (r) => shortIdOf(r)

// Next document number for a branch's OWN run of a series (each branch numbers
// itself, and REP / REF / TRANS number independently of each other).
// Derived from the saved list so it updates instantly when the branch changes.
//
// The lowest number NOT already taken — mirrors nextDocNumber in
// server/src/routes/savedReports.js, so the preview always names the number a
// Save is actually about to mint. A number picked by hand out of order (a
// paper document already numbered ahead of the digital run) must not strand
// the preview past every gap below it forever.
function nextSeriesNumber(saved, series, branch) {
  const b = String(branch ?? '')
  const used = new Set()
  for (const r of saved ?? []) {
    if (seriesOf(r) !== series) continue
    if (String(r.branch ?? '') !== b) continue
    used.add(r.docNumber ?? 0)
  }
  let n = 1
  while (used.has(n)) n++
  return n
}

// The two ids one saved snapshot answers to: "MAKKAH-REP-0004" and its short
// form "MAK-REP-A004". Both are searchable — whichever one someone was handed
// is the one they will type.
const docIdsOf = (r) => [repLabel(r.reportId, r.branch, r.mode), shortLabel(r)]

// Saved snapshots the query names by ID -> whole reports.
//
// Separate from searchInside because the two answer different questions and owe
// different answers. Someone typing A018 wants the DOCUMENT; searchInside walks
// down to fault lines and would hand back one row per fault, so a three-fault
// report arrives as three near-identical rows and a report with no fault lines
// at all — a saved snapshot with nothing but a device on it — arrives as
// nothing, unfindable by the very id printed at the top of it.
//
// Which query counts as an id is settled by docIdMatches (report.js): a query
// is an id query when it MATCHES an id, not when it looks like one. So an
// ordinary item search is never misread as an id — "A COVER" flattens to
// ACOVER, matches no document, and falls through to the item search untouched.
// A query that genuinely does both ways (a report id that is also a comment's
// text, say) is not resolved in favour of one: the caller shows the report AND
// the line items, because both readings are true.
const searchById = (list, query) => (list ?? []).filter((r) => docIdMatches(query, docIdsOf(r)))

// Deep search INSIDE a set of saved snapshots -> matching line items.
function searchInside(list, query) {
  const q = String(query ?? '')
    .trim()
    .toLowerCase()
  if (!q) return []
  const out = []
  for (const r of list) {
    const entries = Array.isArray(r.entries) ? r.entries : []
    const label = shortLabel(r) // e.g. "MAK-REP-A004"
    for (const e of entries) {
      const model = e.model && e.model !== '-' ? e.model : ''
      for (const f of e.faults ?? []) {
        // The ids are NOT in this haystack. searchById above owns them now, and
        // leaving them here too was the whole flood: an id sits on every one of
        // a report's fault lines, so typing one matched all of them and handed
        // back a three-fault report as three near-identical rows next to the
        // report itself. A line item matches on what is on the LINE.
        //
        // Tel/ISSI are here IN FULL, whatever an export is set to show. Masking
        // is about what leaves the app; this is a signed-in technician looking
        // for the reports a radio appears in, and searching the masked form
        // would mean the only number they have — the whole one, off the handset
        // — is the one number that finds nothing.
        const hay = `${r.branch} ${r.dateLabel} ${e.technician ?? ''} ${r.receivedBy ?? ''} ${e.telNumber ?? ''} ${e.issiNumber ?? ''} ${e.type} ${e.model} ${f.issue} ${f.company} ${f.status} ${e.comment ?? ''}`
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

// The region an ADMIN is looking at. Only an admin has a choice to remember: a
// director runs one region and a plain user belongs to one branch, so for them
// the region is derived from who they are, every render, and never stored.
const REGION_KEY = 'trc_region'
const loadRegion = () => {
  try {
    return localStorage.getItem(REGION_KEY) || ''
  } catch {
    return ''
  }
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

// How much of a Tel / ISSI the PDF shows — 'masked' (last 4 only, as ***4567)
// or 'full'. A toggle beside the PDF button rather than a per-print prompt: it
// is a standing decision about what this workstation is allowed to put on
// paper, and the person printing at the end of a long day is exactly the person
// who should not have to answer it again each time. It sits next to the button
// it governs so the answer is readable before the PDF is made.
//
// Masked is the default, for two reasons. It is the safe way round — a printout
// is emailed on and photographed, and an unmasked default would have quietly
// published every full number the moment full numbers started being stored. And
// it costs nothing to adopt: every report saved before now holds 4 digits, all
// of which are the last 4, so masked and full render those identically (see
// displayNumber in report.js) — no existing report changes appearance.
const NUMBERS_KEY = 'trc_numbers'
const loadNumberMode = () => (lsGet(NUMBERS_KEY) === 'full' ? 'full' : 'masked')

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

// A compact fingerprint of the working entries — changes when an entry is
// added, edited or removed. Used to auto-refresh when new data arrives.
function entriesSig(list) {
  if (!Array.isArray(list)) return ''
  return list
    .map(
      (e) =>
        `${e.id}:${(e.faults ?? []).map((f) => `${f.issue}|${f.action}|${f.quantity}|${f.company}|${f.status}`).join(',')}`,
    )
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
  const isDirector = user?.role === 'director'
  const lockBranch = isAdmin || isDirector ? null : user?.branch || '' // plain users are pinned to their branch
  const navItems = NAV.filter((n) => !n.adminOnly || isAdmin || (isDirector && n.directorOk))
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saveToast, setSaveToast] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  // The ISSI-to-agency mapping offered after a save, or null. { prefix, agency }
  const [wire, setWire] = useState(null)
  const [savedAll, setSavedAll] = useState([]) // as fetched; read through `saved` below
  const [savedOpen, setSavedOpen] = useState(false)
  const [savedSearch, setSavedSearch] = useState('')
  const [savedRefOpen, setSavedRefOpen] = useState(false)
  const [savedRefSearch, setSavedRefSearch] = useState('')
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
  // Device and Faults are one card, so one open state. They were two, kept in
  // step by a pair of toggles that each reopened the other — an entry needs
  // both halves, so they were never meaningfully separate.
  const [entryOpen, setEntryOpen] = useState(true)
  // Quick Code Entry and the manual Device/Faults form are two alternate ways
  // to do the same thing — only one is ever the one actually in use. Rather
  // than just collapsing the other to a header (still a whole row of dead
  // space per card), the inactive side isn't rendered at all; a small
  // persistent switcher is what moves between them.
  const [entryMode, setEntryMode] = useState('manual') // 'manual' | 'quick'
  const [lastAgency, setLastAgency] = useState(() => loadLast().agency ?? '')
  const isAllBranches = (isAdmin || isDirector) && branch === ALL_BRANCHES
  // Monthly follows the same shared branch selection ('' = all branches).
  const monthBranch = isAllBranches ? '' : branch

  // ---- Region ------------------------------------------------------------
  // Only an admin CHOOSES a region; everyone else is simply told theirs, so the
  // toolbar states it rather than offering it. A director carries their region
  // on their account; a plain user does not (User.region is populated only for
  // directors), so theirs is the region whose membership contains their branch.
  const [adminRegion, setAdminRegion] = useState(loadRegion)
  // Memoised for its IDENTITY, not its cost: the `?? {}` fallback would be a
  // fresh object every render, and the saved-report filter below is keyed on it.
  const regionMap = useMemo(() => options.regions ?? {}, [options.regions])
  const regionNames = useMemo(() => Object.keys(regionMap), [regionMap])
  const regionOfBranch = (b) => regionNames.find((r) => (regionMap[r] ?? []).includes(b)) ?? ''
  // The region actually in force. '' means unnarrowed, which only an admin can
  // be in — and is what a branch belonging to no region resolves to, so such a
  // branch stays reachable instead of falling out of the app.
  const region = isAdmin ? adminRegion : isDirector ? (user.region ?? '') : regionOfBranch(user?.branch ?? '')
  const regionBranches = regionMap[region] ?? []
  // "Western Region" reads as "Western" where it sits beside other words —
  // the word Region is what the toolbar label already says.
  const regionShort = region.replace(/\s*Region$/i, '')
  // e.g. "Admin · Western · all branches", or "Admin · all branches" unnarrowed.
  const adminScopeLabel = `Admin${region ? ` · ${regionShort}` : ''} · all branches`

  // Every branch the app knows about: the admin-managed list, plus any branch a
  // region claims. The two can differ — a region names branches by name, and
  // seed-regions.js is what adds them to the managed list — so a branch could
  // otherwise be selectable under its own region and vanish under All regions,
  // taking the current selection with it into "— select —".
  const allBranches = useMemo(() => {
    const managed = options.branches?.length ? options.branches : BRANCHES
    return [...new Set([...managed, ...Object.values(regionMap).flat()])]
  }, [options.branches, regionMap])

  // A director's workspace is exactly their region's branches; an admin's is
  // the selected region's, or every branch when no region is selected.
  const branchList = isDirector ? (options.regions?.[user.region] ?? []) : region ? regionBranches : allBranches
  // Saved documents, narrowed to the region in force.
  //
  // THE choke point for region isolation. `saved` feeds far more than the list
  // it is drawn in — nextSeriesNumber, the monthly matrices, the spare-parts
  // report and the dashboard summaries all derive from it — so one out-of-region
  // row here would be counted by every one of them at once, silently: nothing
  // would look wrong, the totals would just be larger than the truth. Filtering
  // in one place is what makes "this region's branches only" a property of the
  // data every view reads, rather than a rule each view has to remember.
  //
  // The server scopes the other reads by region directly (see branchWhere in
  // server/src/scope.js). This one is filtered here instead because the saved
  // list is fetched on a fixed path that offline.js reads back by name when it
  // queues a save — adding a query string to it would leave that cache lookup
  // pointing at a key nothing writes.
  const saved = useMemo(() => {
    if (!region) return savedAll
    const allowed = new Set(regionMap[region] ?? [])
    return savedAll.filter((r) => allowed.has(r.branch ?? ''))
  }, [savedAll, region, regionMap])

  const [theme, setTheme] = useState(loadTheme)
  const [mode, setMode] = useState(loadMode)
  const [numberMode, setNumberMode] = useState(loadNumberMode)
  // The date and document number the pending save will take, when they have
  // been chosen by hand. null on both means "follow the automatic ones" — the
  // date the entries carry, and the next number in the series — which is the
  // normal case and the state a fresh save always returns to.
  const [docOverride, setDocOverride] = useState(null) // document number, e.g. 19
  const [dateOverride, setDateOverride] = useState(null) // 'YYYY-MM-DD'
  const [headerEdit, setHeaderEdit] = useState(null) // { date, id } while the editor is open
  const [headerError, setHeaderError] = useState('')
  // Each branch has its OWN document series — derive the next id for the branch
  // in view (All Branches previews the unassigned '' series; saving is off there).
  const seriesBranch = isAllBranches ? '' : branch
  const nextReportId = `REP-${pad4(nextSeriesNumber(saved, 'REP', seriesBranch))}`
  const nextRefId = `REF-${pad4(nextSeriesNumber(saved, 'REF', seriesBranch))}`
  const nextTransId = `TRANS-${pad4(nextSeriesNumber(saved, 'TRANS', seriesBranch))}`
  const [sync, setSync] = useState({ online: true, standalone: false, pending: 0, syncing: false, authExpired: false })
  const [editId, setEditId] = useState(null) // entry id being edited in the modal
  const [editForm, setEditForm] = useState(null)
  const lastEntriesSig = useRef('') // baseline for the live-refresh poll
  const lastSavedSig = useRef('') // baseline for saved-report changes (any source)

  // Plain users are pinned to their own branch everywhere.
  useEffect(() => {
    if (lockBranch) setBranch(lockBranch)
  }, [lockBranch])
  // A director's persisted branch may be stale (region membership changed, or
  // they still have another region's branch cached from a previous account) —
  // fall back to the All-Branches region view rather than leak/deny silently.
  useEffect(() => {
    if (isDirector && branch !== ALL_BRANCHES && !branchList.includes(branch)) setBranch(ALL_BRANCHES)
  }, [isDirector, branch, branchList])
  // The same guard for an admin, whose branch can be orphaned two ways: by
  // narrowing to a region the branch is not in, and by a branch disappearing
  // from the list under them. Either way the selector would fall back to its
  // "— select —" placeholder while the app kept showing that branch's data —
  // a toolbar that has stopped describing what is on screen. All-Branches is
  // the honest landing place: with a region selected it means everything in
  // that region, and without one, everything.
  useEffect(() => {
    if (isAdmin && branch !== ALL_BRANCHES && !branchList.includes(branch)) setBranch(ALL_BRANCHES)
  }, [isAdmin, branch, branchList])
  // A persisted region an admin can no longer see — renamed or deleted since —
  // must not leave them looking at an empty branch list with no way back.
  useEffect(() => {
    if (isAdmin && adminRegion && regionNames.length && !regionNames.includes(adminRegion)) setAdminRegion('')
  }, [isAdmin, adminRegion, regionNames])
  // Remembered like the branch beside it, and only for the admin who has a
  // choice to remember.
  useEffect(() => {
    if (isAdmin) lsSet(REGION_KEY, adminRegion)
  }, [isAdmin, adminRegion])
  // Keep users off pages their role can't reach.
  useEffect(() => {
    const item = NAV.find((n) => n.id === page)
    if (item?.adminOnly && !isAdmin && !(isDirector && item.directorOk)) setPage('report')
  }, [isAdmin, isDirector, page])
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
      for (const n of String(v)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)) {
        const k = n.toLowerCase()
        if (!seen.has(k)) {
          seen.add(k)
          out.push(n)
        }
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
  // A save containing an RTO is marked reference-only, and a reference-only save
  // draws a REF number rather than a REP one — so the preview has to know which
  // it will be. Same test the server applies (hasRtoAction in routes/
  // savedReports.js), reading classify() so "what is an RTO" is defined once.
  const willBeReferenceOnly = useMemo(
    () => (entries ?? []).some((e) => (e.faults ?? []).some((f) => classify(f.action) === 'rto')),
    [entries],
  )
  // The next id a Save would mint, for the current document type — in both
  // forms, so the preview shows what the saved report will actually carry.
  const nextSeries = isTransmittal ? 'TRANS' : willBeReferenceOnly ? 'REF' : 'REP'
  const autoDocId = isTransmittal ? nextTransId : willBeReferenceOnly ? nextRefId : nextReportId
  // A number chosen by hand replaces the one the series offered — in BOTH
  // renderings, so the preview, the print sheet, the TXT and the PDF filename
  // are all showing the number the save is actually about to take.
  const nextDocId = docOverride == null ? autoDocId : `${nextSeries}-${pad4(docOverride)}`
  const nextShortId = shortDocId(
    seriesBranch,
    nextSeries,
    docOverride ?? nextSeriesNumber(saved, nextSeries, seriesBranch),
  )

  // The browser's "Save as PDF" dialog seeds its filename from document.title,
  // so every saved PDF carries the id of the document inside it — e.g. "TRC
  // Maintenance Report-MAK-REP-A019.pdf". A folder of them then sorts and
  // searches by the same id printed at the top of each sheet, instead of a
  // dozen files sharing one name and telling them apart by save date.
  //
  // nextShortId, not the mode's own counter, because it already answers for
  // every document type: a transmittal draws TRA, and a save holding an RTO
  // draws RTO rather than the REP it is not (see nextSeries above).
  useEffect(() => {
    document.title = `TRC ${isTransmittal ? 'Transmittal' : 'Maintenance'} Report-${nextShortId}`
  }, [isTransmittal, nextShortId])

  // Inventory item names, offered as suggestions in the issue/material fields.
  const inventoryNames = useMemo(
    () => [...new Set((inventory ?? []).map((i) => String(i.itemCode || '').trim()).filter(Boolean))].sort(),
    [inventory],
  )
  // Material name (UPPER) -> Description, for the transmittal DESCRIPTION column.
  const descByMaterial = useMemo(() => materialDescMap(options.materials), [options.materials])

  // ---- ISSUE suggestions ---------------------------------------------------
  // Coded issues first — they are the ones a code can be typed for later, and
  // the ones the WhatsApp decoder can read back — then everything else that is
  // a legitimate thing to write in the field: the standalone actions (an issue
  // in their own right, and they auto-set the Action), issues nobody has coded
  // yet, and the inventory item names, whose match is what deducts stock.
  //
  // The uncoded ones are NOT hidden. They are real, they are in use, and a form
  // that silently dropped them would send someone to Manage Inputs mid-entry.
  // Each carries the way to give it a code instead — see IssueInput.
  const issueSuggestions = useMemo(() => {
    const out = []
    const seen = new Set()
    // `source` is which admin-managed list the row came from, and it is what
    // decides whether the row can be removed and from where. An inventory name
    // has no such list — it is offered because stock matches on it — so it is
    // not removable here; deleting it belongs to the Inventory page.
    const add = (name, code = '', source = 'issue') => {
      const key = String(name ?? '')
        .trim()
        .toUpperCase()
      if (!key || seen.has(key)) return
      seen.add(key)
      out.push({
        name: String(name).trim(),
        code,
        source,
        removable: source !== 'inventory',
      })
    }
    for (const it of options.issueTypes ?? []) {
      const code = issueCode(it)
      if (code) add(issueName(it), code)
    }
    for (const it of options.issueTypes ?? []) if (!issueCode(it)) add(issueName(it))
    for (const a of options.actions ?? []) {
      if (!['CHANGE', 'REPAIR', 'NEW'].includes(String(a).toUpperCase())) add(a, '', 'action')
    }
    for (const n of inventoryNames) add(n, '', 'inventory')
    return out
  }, [options.issueTypes, options.actions, inventoryNames])

  // The 4 most-used issues float to the top of the menu — same idea as the
  // Agency quick-picks below, counted the same way: from saved reports plus
  // the working set, so it can never drift out of step with the data.
  const rankedIssueSuggestions = useMemo(() => {
    const counts = new Map()
    const bump = (v) => {
      const key = String(v ?? '')
        .trim()
        .toUpperCase()
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const r of saved ?? []) for (const e of r.entries ?? []) for (const f of e.faults ?? []) bump(f.issue)
    for (const e of entries ?? []) for (const f of e.faults ?? []) bump(f.issue)
    const uses = (s) => counts.get(s.name.trim().toUpperCase()) ?? 0
    const top = issueSuggestions
      .filter((s) => uses(s) > 0)
      .sort((a, b) => uses(b) - uses(a))
      .slice(0, 4)
    const topNames = new Set(top.map((s) => s.name.trim().toUpperCase()))
    return [...top, ...issueSuggestions.filter((s) => !topNames.has(s.name.trim().toUpperCase()))]
  }, [issueSuggestions, saved, entries])

  /**
   * Drop a suggestion from the admin-managed list it belongs to.
   *
   * Confirmed, and the confirmation names the LIST rather than just the row:
   * removing an action takes it out of the Action dropdown as well, which is a
   * consequence somewhere the person cannot see from here. Existing entries and
   * saved reports keep the text they already hold either way — this edits the
   * vocabulary offered from now on, not the records written with it.
   */
  function removeIssueSuggestion(s) {
    const key = s.source === 'action' ? 'actions' : 'issueTypes'
    const where = s.source === 'action' ? 'Actions — it will also leave the Action dropdown' : 'Issue types'
    if (!window.confirm(`Remove "${s.name}" from ${where}?`)) return
    const list = options[key] ?? []
    const nameOf = key === 'actions' ? (v) => String(v ?? '') : issueName
    setCategory(
      key,
      list.filter((v) => !sameName(nameOf(v), s.name)),
    )
  }

  /**
   * Give an issue a CDS code from inside the entry form, and keep it.
   *
   * Returns an error STRING when it cannot — the caller shows it against the
   * field rather than throwing, because this happens mid-entry and a thrown
   * error would take the half-typed entry with it.
   *
   * A code already claimed by a different issue is refused, never reassigned:
   * the code map is shared with the WhatsApp decoder, so a duplicate would make
   * that code ambiguous for every reader of it — and the person who would find
   * out is not the person typing here. Same rule Manage Inputs enforces.
   */
  const sameName = (a, b) =>
    String(a ?? '')
      .trim()
      .toUpperCase() ===
    String(b ?? '')
      .trim()
      .toUpperCase()

  function assignIssueCode(name, parts, variant) {
    const code = `${parts}${variant}`
    const list = options.issueTypes ?? []
    const clash = list.find((it) => issueCode(it) === code && sameName(issueName(it), name) === false)
    if (clash) return `${code} is already ${issueName(clash)}`

    const at = list.findIndex((it) => sameName(issueName(it), name))
    const coded = {
      name: at >= 0 ? issueName(list[at]) : name,
      parts,
      variant,
    }
    // An issue already on the list is updated in place, keeping its position;
    // an action or inventory name that has never been an issue is appended.
    const next = at >= 0 ? list.map((it, i) => (i === at ? coded : it)) : [...list, coded]
    setCategory('issueTypes', next)
    return ''
  }

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

  // Persist the PDF Tel/ISSI setting, same as the theme above.
  useEffect(() => {
    lsSet(NUMBERS_KEY, numberMode)
  }, [numberMode])

  // A hand-picked date and number belong to ONE pending document. The moment
  // that document changes underneath them — a different branch, a different
  // mode, or an RTO arriving and turning a REP into a REF — they are answers to
  // a question nobody asked any more, and a number chosen in the REP series is
  // not even valid in the REF one. Dropped rather than carried across.
  useEffect(() => {
    setDocOverride(null)
    setDateOverride(null)
    setHeaderEdit(null)
    setHeaderError('')
  }, [branch, mode, nextSeries])

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
    const currentBundle = document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')
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
    // (All Branches = '' = every branch — admin sees all, director their region).
    refresh(mode, (isAdmin || isDirector) && b === ALL_BRANCHES ? '' : b)
    getInventory((isAdmin || isDirector) && b === ALL_BRANCHES ? '' : b, region)
      .then(setInventory)
      .catch(() => {})
  }
  const changeBranch = (e) => selectBranch(e.target.value)

  // Working entries are per document type; refresh the set for the given mode
  // (defaults to the current one).
  async function refresh(m = mode, b = isAllBranches ? '' : branch) {
    try {
      const list = await listEntries(m, b, region)
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
      const sig = reports
        .map((r) => `${r.id}:${r.seq ?? ''}:${r.savedAt ?? r.updatedAt ?? ''}:${r.isReferenceOnly ? 1 : 0}`)
        .join('|')
      if (sig !== lastSavedSig.current) {
        lastSavedSig.current = sig
        setSavedAll(reports)
      }
    } catch {
      /* leave the saved list as-is if the endpoint is unavailable */
    }
  }

  const refreshInventory = () =>
    getInventory(isAllBranches ? '' : branch, region)
      .then(setInventory)
      .catch(() => {})

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

  // Which parts count on their own (98 Power Supply, 99 Charger) is decided by
  // the code an Issue type claims, so the report engine needs the live list —
  // here rather than at each call site, so every count on every screen reads
  // the same claims. Runs on load and on every Manage Inputs edit.
  //
  // During render, NOT in an effect: an effect fires after the tree has already
  // rendered, so the first paint with a freshly loaded list would count against
  // the previous one, and nothing would re-render to correct it. A useMemo runs
  // before the summaries below and before any child reads them.
  useMemo(() => setIssueClaims(options.issueTypes), [options.issueTypes])

  // Live refresh: poll the working entries every 5s and, when a new one arrives (added,
  // edited or removed — e.g. from another device), refresh the view once. It
  // never touches the form you're editing, only the entries list + calculations.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      if (document.hidden || busy) return // don't fight an in-flight save/edit
      try {
        const list = await listEntries(mode, isAllBranches ? '' : branch, region)
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
  }, [mode, busy, branch, isAllBranches, region])

  // Narrowing to another region changes what the server may return, so the
  // entries and the stock have to be re-fetched under it — the saved list does
  // not, being filtered from what is already held. Skipped on the first render,
  // where reloadAll() has just run.
  const didLoad = useRef(false)
  useEffect(() => {
    if (!didLoad.current) {
      didLoad.current = true
      return
    }
    refresh()
    refreshInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region])

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
      // The overrides ride along only when they were actually set; left off,
      // the server draws the date from the entries and the number from the
      // series exactly as it always has. It re-checks both — the number can be
      // taken between the preview and the save.
      const rep = await saveReport({
        branch,
        mode,
        transmittedBy: reportTransmittedBy,
        receivedBy: reportReceivedBy,
        ...(dateOverride ? { reportDate: dateOverride } : {}),
        ...(docOverride == null ? {} : { docNumber: docOverride }),
      })
      setError(null)
      // Spent: this document now exists under them, and the next save starts
      // from the automatic date and the next free number again.
      setDocOverride(null)
      setDateOverride(null)
      await refresh() // saving auto-clears the working set server-side — reflect it
      await refreshSaved()
      refreshInventory() // stock was deducted server-side for matched items
      setSaveToast(`Saved as report number ${shortLabel(rep)}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleLoadReport(rep) {
    if (!window.confirm(`Load ${shortLabel(rep)} into the form? This replaces the entries currently listed.`)) return
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
        const next = {
          ...m,
          [b]: { t: rep.transmittedBy ?? '', r: rep.receivedBy ?? '' },
        }
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

  // Flip the reference-only mark by hand — overrides whatever the RTO
  // auto-detection decided when the report was saved.
  async function handleToggleReference(rep) {
    const next = !rep.isReferenceOnly
    // Paint it straight away; refreshSaved() below reconciles with the server.
    setSavedAll((list) => list.map((r) => (r.id === rep.id ? { ...r, isReferenceOnly: next } : r)))
    try {
      await setSavedReportReference(rep.id, next)
      await refreshSaved()
    } catch (err) {
      setSavedAll((list) => list.map((r) => (r.id === rep.id ? { ...r, isReferenceOnly: !next } : r)))
      setError(err.message)
    }
  }

  async function handleDeleteSaved(rep) {
    if (!window.confirm(`Delete ${shortLabel(rep)}? This cannot be undone.`)) return
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

  // Take up the offer above: the ISSI prefix joins that agency's own list, so
  // the next number of the range selects it without anyone picking. Goes
  // through setCategory, so it is saved and shown exactly like an edit made in
  // Manage inputs — this is a shortcut to that screen, not a second way in.
  function agreeWire() {
    if (!wire) return
    setCategory('agencies', withIssiPrefix(options.agencies, wire.agency, wire.prefix))
    setWire(null)
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
      const next = {
        ...prev,
        charts: { ...(prev.charts || {}), [key]: value },
      }
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveOptions(next).catch((err) => setError(`Could not save inputs: ${err.message}`))
      }, 400)
      return next
    })
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  // Whether Model or Type has been set BY HAND for the entry being typed, which
  // is what stops the Tel auto-select below from writing over it.
  //
  // It has to be a flag, not a look at whether the fields are empty: a fresh
  // form arrives with the previous entry's Model and Type already in it
  // (emptyForm reads saveLast), so "still blank" would be false almost always
  // and the auto-select would effectively never fire. A value carried over from
  // the last device is not a choice about this one.
  const devicePicked = useRef(false)

  // Choosing a model auto-fills Type from the model→type map (if the model is mapped).
  const setModel = (e) => {
    const model = e.target.value
    if (model !== form.model) {
      devicePicked.current = true
      setAutoModel(null) // chosen by hand now, whatever the number said
    }
    setForm((f) => ({
      ...f,
      model,
      type: MODEL_TYPE[model.toUpperCase()] ?? f.type,
    }))
  }
  // Picking the Type by hand counts too: someone who has just chosen OTHER does
  // not want the number overruling them a keystroke later.
  //
  // Both only count a change of VALUE. Enter walks Model -> Type -> Tel, and a
  // SearchSelect re-commits whatever row is highlighted on the way past — which
  // is the current one. Treating that as a decision would arm the block on the
  // exact keystrokes used to reach the Tel field, killing the auto-select for
  // anyone who fills the form by keyboard.
  const setType = (e) => {
    if (e.target.value !== form.type) devicePicked.current = true
    set('type')(e)
  }

  // Whether the Agency was chosen by hand, the same idea as devicePicked but
  // its own flag, because Model and Agency are separate questions about the
  // number and answering one is no statement about the other.
  const agencyPicked = useRef(false)
  // Scopes the '+' shortcut's "focus the new row's Issue field" — the DOM is
  // searched rather than tracking a per-row ref, since rows come and go.
  const cardRef = useRef(null)
  // Where the cursor lands once an entry is saved — the Tel number, the same
  // field that starts identifying the next device — so filing one entry
  // walks straight into the next without reaching for the mouse.
  const telRef = useRef(null)

  // The agency a number selected on its own, or '' when none has.
  //
  // State rather than a second ref, because unlike agencyPicked this one is
  // RENDERED: picking an agency by hand is how an entry is added (see the
  // footer picker), so an entry whose agency arrived by itself has no such
  // moment and would otherwise have to be committed by re-choosing a value
  // that is already selected. This is what puts a button carrying its name
  // beside the field instead.
  const [autoAgency, setAutoAgency] = useState('')

  // The Model a Tel number selected on its own: { model, changed }, or null
  // when no number has named one on this entry.
  //
  // State for the same reason autoAgency is: it is RENDERED. A fresh form
  // arrives carrying the last entry's Model (emptyForm reads saveLast), so the
  // field reads a model either way and the box alone cannot say whether this
  // number chose it or the previous device left it there. devicePicked answers
  // a different question — whether a HUMAN chose it — and is a ref because
  // nothing draws it.
  //
  // `changed` is why this is a pair rather than a name. A number that selects
  // the model already showing moves nothing on screen, so the field looks
  // exactly like one nobody has touched — and the technician cannot tell a
  // registered number from a leftover. The two cases are tinted differently
  // (see .is-auto-new / .is-auto-same) so the second one still says something.
  const [autoModel, setAutoModel] = useState(null)

  // A Tel number's leading digits say WHAT the device is (set in Manage inputs
  // → Tel prefixes). Typing it selects the Model, and the Type comes off the
  // model from there, through the same MODEL_TYPE map setModel uses.
  //
  // The Model and nothing else. Whose radio it is comes off the ISSI (setIssi),
  // and the Type off the Model — one number, one field, one source. The Tel
  // number used to select the Agency too, from the agencies' own prefix list;
  // it no longer does, and agencies no longer carry Tel prefixes at all.
  //
  // Touch the Model or the Type yourself and the number stops filling it for
  // the rest of the entry: correct a wrong guess (109 leads with the car kit,
  // the bench has the desktop) and the correction stands, however much of the
  // number is typed afterwards.
  const setTel = (e) => {
    const telNumber = e.target.value
    const model = devicePicked.current ? '' : telPick(telNumber, options.models)
    // Only on a hit. Backspacing to a prefix that names nothing leaves the
    // Model where it was, so the tint has to stay with it rather than clear on
    // the way past.
    //
    // And `changed` is settled once, the first time the number names THIS
    // model, then held. Every digit typed after the prefix re-selects the same
    // model, and re-deciding on each of them would compare it against the
    // value it had just written — turning a genuine change green one keystroke
    // after it went blue.
    if (model) setAutoModel((prev) => (prev?.model === model ? prev : { model, changed: model !== form.model }))
    setForm((f) => ({
      ...f,
      telNumber,
      ...(model && { model, type: MODEL_TYPE[model.toUpperCase()] ?? f.type }),
    }))
  }

  // The ISSI answers one of the same two questions the Tel number does — whose
  // radio it is — off its OWN prefix list (see issiPick). The Model is not read
  // from it: the Tel number already names the device, and a second source for
  // one field is how two dropdowns start disagreeing.
  //
  // Except for 00, which is not a radio at all but the whole of "nothing
  // happened today", and fills the entry in one keystroke pair.
  const setIssi = (e) => {
    const issiNumber = e.target.value
    if (isNoActivityIssi(issiNumber)) {
      const fill = noActivityFill(options)
      // Typing 00 IS the decision about Model, Type and Agency, so the two
      // flags are armed rather than cleared: a Tel number typed afterwards
      // must not quietly turn a no-activity record back into a device.
      devicePicked.current = true
      agencyPicked.current = true
      setAutoAgency(fill.agency)
      setAutoModel(fill.model ? { model: fill.model, changed: fill.model !== form.model } : null)
      setForm((f) => ({
        ...f,
        issiNumber,
        // Only what the live lists actually offer — an empty dropdown beats a
        // value hidden behind a box that renders blank (see noActivityFill).
        ...(fill.model && { model: fill.model }),
        ...(fill.type && { type: fill.type }),
        ...(fill.agency && { agency: fill.agency }),
        // Faults are replaced only when nothing has been typed into them. 00
        // reached by accident half way through a real entry is a slip to undo,
        // not a reason to lose the rows already filled in.
        //
        // Quantity 0 and no action: nothing was done, so there is nothing to
        // name and no unit to count. The same row typing "No Activity" into the
        // Issue field produces (see nextFault) — one rule, two ways in.
        ...(f.faults.some(faultIsMeaningful)
          ? {}
          : {
              faults: [
                {
                  ...emptyFault(),
                  issue: fill.issue,
                  quantity: fill.quantity,
                  action: fill.action,
                  company: fill.company,
                },
              ],
            }),
      }))
      return
    }
    const agency = agencyPicked.current ? '' : issiPick(issiNumber, options.agencies)
    if (agency) setAutoAgency(agency)
    setForm((f) => ({ ...f, issiNumber, ...(agency && { agency }) }))
  }

  // One fault row after an edit to one of its fields. Shared by the entry form
  // and the edit modal, which had grown two copies of the same rules.
  const nextFault = (fault, field, raw) => {
    const next = {
      ...fault,
      [field]: field === 'quantity' ? Number(raw) : raw,
    }
    // Typing/picking an action name in the Issue field auto-selects that Action.
    if (field === 'issue') {
      const matched = options.actions.find((a) => a.toUpperCase() === String(raw).trim().toUpperCase())
      if (matched) next.action = matched
    }
    // Whether this edit turns the row INTO the no-activity one. Only the
    // change counts, the same rule the Company auto-select below follows: an
    // auto-select, not a lock, so all three fields stay yours afterwards.
    const becameNoActivity = field === 'issue' && isNoActivityIssue(raw) && !isNoActivityIssue(fault.issue)
    // A service consumes no part, so no company supplied one: PROGRAM, REPAIR,
    // INSTALL, DISMANTLE and the RE- pair auto-select Company = "— none —"
    // rather than carrying over the company of the last part fitted.
    //
    // Only on a CHANGE OF ACTION, which is the moment the row becomes (or stops
    // being) a service. Re-applying it on every keystroke would make Company
    // unselectable on a service row instead of merely defaulted, and this was
    // asked for as an auto-select, not a lock — the field stays yours to
    // override afterwards.
    //
    // Leaving a service restores the remembered company only when the field is
    // still blank, so it undoes our own clearing without overwriting a "none"
    // that was chosen deliberately.
    if (next.action !== fault.action) {
      if (isServiceAction(next.action)) next.company = ''
      else if (isServiceAction(fault.action) && !next.company) next.company = lastCompany()
    }
    // "No Activity" is not a fault: nothing was done, so there is no action to
    // name, nobody supplied a part, and there is no unit of anything to count.
    //
    // Last, so it has the final word. Leaving a service restores the remembered
    // company above — which, on a PROGRAM row becoming this one, would hand
    // back the very company this is clearing.
    if (becameNoActivity) {
      next.action = ''
      next.company = ''
      next.quantity = 0
    }
    return next
  }

  const setFault = (i, field) => (e) => {
    // Remember the last Company so new fault rows (and the next entry) pre-select it.
    if (field === 'company') saveLast({ company: e.target.value })
    setForm((f) => ({
      ...f,
      faults: f.faults.map((fault, idx) => (idx === i ? nextFault(fault, field, e.target.value) : fault)),
    }))
  }
  const addFault = () => setForm((f) => ({ ...f, faults: [...f.faults, emptyFault()] }))
  const removeFault = (i) =>
    setForm((f) => ({
      ...f,
      faults: f.faults.length === 1 ? f.faults : f.faults.filter((_, idx) => idx !== i),
    }))

  // `agencyOverride` lets the Agency picker submit itself the instant a value
  // is chosen — it fires before the setForm() that records the same value has
  // actually re-rendered, so the fresh value has to be passed through rather
  // than read back off (still-stale) form state.
  async function handleSubmit(e, agencyOverride) {
    e?.preventDefault?.()
    try {
      // Model/Type used to be native `required` <select>s — SearchSelect
      // isn't a real form control, so the browser can no longer catch a
      // still-blank one on submit; check explicitly instead.
      if (!isTransmittal) {
        if (!form.type) {
          setError('Pick a Type.')
          return
        }
        if (!form.model && form.type !== 'OTHER') {
          setError('Pick a Model.')
          return
        }
      }
      const agency = agencyOverride ?? form.agency
      const payload = {
        ...form,
        agency,
        mode, // keep report vs transmittal working sets separate
        branch: isAllBranches ? '' : branch, // owning branch (admins pick; non-admins forced server-side)
        // Transmittal carries a Type (no agency/model); Type falls back to OTHER.
        // The DESCRIPTION column is derived per material from the Materials list.
        ...(isTransmittal ? { type: form.type || 'OTHER', model: '', agency: '' } : {}),
        // Transmittal lines are Material + Qty + Company + Status (Action hidden, defaults harmlessly).
        faults: form.faults.filter(faultIsMeaningful).map(withSavedQuantity),
      }
      if (payload.faults.length === 0) {
        setError('Add at least one fault — pick an issue, or an action like PROGRAM/INSTALL/DISMANTLE.')
        return
      }
      await createEntry(payload)
      // The ISSI just saved may name a range no agency answers to yet. Offered
      // after the write, never before it: the entry is the user's business and
      // teaching the auto-select is a separate, optional favour.
      if (!isTransmittal) setWire(issiWireOffer(payload.issiNumber, payload.agency, options.agencies))
      // Remember Model/Type/Agency so the next entry pre-selects them.
      saveLast({ model: form.model, type: form.type, agency: payload.agency })
      // Mirrored into state so the Agency dropdown re-sorts straight away —
      // localStorage on its own would not re-render anything.
      setLastAgency(payload.agency)
      // A new entry, so the carried-over Model/Type/Agency are nobody's choice
      // yet and the next Tel number is free to say what the device is and whose.
      devicePicked.current = false
      agencyPicked.current = false
      // Nothing has been auto-selected onto the fresh form yet — the Model it
      // carries over is the last entry's, which is nobody's choice about this one.
      setAutoAgency('')
      setAutoModel(null)
      setForm((f) => ({
        ...emptyForm(),
        reportDate: f.reportDate,
        technician: f.technician,
      }))
      // The Tel input isn't cleared until the setForm above re-renders it —
      // wait a frame so the focus lands on the fresh, empty field.
      if (!isTransmittal) requestAnimationFrame(() => telRef.current?.focus())
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
      saveLast({
        model: decoded.model,
        type: decoded.type,
        agency: decoded.agency,
      })
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
  const eDevicePicked = useRef(false)
  const eAgencyPicked = useRef(false)
  function openEdit(e) {
    eDevicePicked.current = false
    eAgencyPicked.current = false
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
    if (model !== editForm.model) eDevicePicked.current = true
    setEditForm((f) => ({
      ...f,
      model,
      type: MODEL_TYPE[model.toUpperCase()] ?? f.type,
    }))
  }
  const eSetType = (ev) => {
    if (ev.target.value !== editForm.type) eDevicePicked.current = true
    eSet('type')(ev)
  }
  const eSetAgency = (ev) => {
    if (ev.target.value !== editForm.agency) eAgencyPicked.current = true
    eSet('agency')(ev)
  }
  // Same auto-select as setTel — the Model, and only the Model — on the edit
  // modal's own copy of the fields. The flag starts down per open (openEdit
  // above): re-typing a saved entry's Tel number is usually the correction, so
  // the Model follows it, and picking the Model by hand still ends the argument.
  const eSetTel = (ev) => {
    const telNumber = ev.target.value
    const model = eDevicePicked.current ? '' : telPick(telNumber, options.models)
    setEditForm((f) => ({
      ...f,
      telNumber,
      ...(model && { model, type: MODEL_TYPE[model.toUpperCase()] ?? f.type }),
    }))
  }

  // The ISSI's half of the same job, on the same flag — see setIssi. No
  // no-activity fill here: 00 is how an entry is CREATED, and a saved one that
  // needs to become a no-activity record is a delete, not an edit.
  const eSetIssi = (ev) => {
    const issiNumber = ev.target.value
    const agency = eAgencyPicked.current ? '' : issiPick(issiNumber, options.agencies)
    setEditForm((f) => ({ ...f, issiNumber, ...(agency && { agency }) }))
  }
  const eSetFault = (i, field) => (ev) => {
    if (field === 'company') saveLast({ company: ev.target.value })
    setEditForm((f) => ({
      ...f,
      faults: f.faults.map((fault, idx) => (idx === i ? nextFault(fault, field, ev.target.value) : fault)),
    }))
  }
  const eAddFault = () => setEditForm((f) => ({ ...f, faults: [...f.faults, emptyFault()] }))
  const eRemoveFault = (i) =>
    setEditForm((f) => ({
      ...f,
      faults: f.faults.length === 1 ? f.faults : f.faults.filter((_, idx) => idx !== i),
    }))

  async function handleUpdateEntry(ev) {
    ev.preventDefault()
    // Model/Type/Agency used to be native `required` <select>s — SearchSelect
    // isn't a real form control, so the browser can no longer catch one
    // still blank on submit; check explicitly instead.
    if (!isTransmittal) {
      if (!editForm.type) {
        setError('Pick a Type.')
        return
      }
      if (!editForm.model && editForm.type !== 'OTHER') {
        setError('Pick a Model.')
        return
      }
      if (!editForm.agency) {
        setError('Pick an Agency.')
        return
      }
    }
    setBusy(true)
    try {
      const payload = {
        ...editForm,
        mode,
        ...(isTransmittal ? { type: editForm.type || 'OTHER', model: '', agency: '' } : {}),
        faults: editForm.faults.filter(faultIsMeaningful).map(withSavedQuantity),
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
      const handover = {
        branch: ALL_BRANCHES,
        mode,
        numberMode,
        transmittedBy: reportTransmittedBy,
        receivedBy: reportReceivedBy,
      }
      // Label spans the date range the merged entries cover.
      const dates = [...new Set(entries.map((e) => fmtLongDate(e.reportDate)).filter(Boolean))]
      const label = dates.length <= 1 ? (dates[0] ?? '') : `${dates[0]} … ${dates[dates.length - 1]}`
      return [buildDateReport(label, id, entries, handover)]
    }
    const opts = {
      branch,
      mode,
      numberMode,
      transmittedBy: reportTransmittedBy,
      receivedBy: reportReceivedBy,
      shortId: nextShortId,
    }
    // A date chosen by hand re-dates every entry, so the day they were split
    // across stops being a division: one date means one document, which is also
    // exactly what the save will write. Preview and record agree by shape, not
    // by luck.
    if (dateOverride) {
      return [buildDateReport(dmyOf(dateOverride), repLabel(nextDocId, branch, mode), entries, opts)]
    }
    return groupReports(entries).map((g) =>
      buildDateReport(g.dateLabel, repLabel(nextDocId, branch, mode), g.entries, opts),
    )
  }, [
    isAllBranches,
    form.reportDate,
    saved,
    entries,
    dateOverride,
    nextDocId,
    nextShortId,
    branch,
    mode,
    numberMode,
    reportTransmittedBy,
    reportReceivedBy,
  ])
  // buildTxt folds the Agency Summary in (daily reports only), so this single
  // string is what the box shows, what ⭳ Text writes, and what a copy yields.
  const combinedTxt = useMemo(() => reports.map(buildTxt).join('\n\n\n'), [reports])

  // ---- The date and number a save would take on its own -------------------
  // What the editor opens on, and what an edit is measured against: a field
  // left at its automatic value sets no override at all, so it keeps tracking
  // (another entry on an earlier day still moves the date; another branch's
  // save still moves the number) instead of freezing at whatever it read when
  // the editor happened to be opened.
  const autoNumber = nextSeriesNumber(saved, nextSeries, seriesBranch)
  const autoDate = useMemo(() => {
    const days = (entries ?? [])
      .map((e) => String(e.reportDate ?? '').slice(0, 10))
      .filter(Boolean)
      .sort()
    return days[0] ?? '' // earliest, matching the label the save writes
  }, [entries])
  // Everything in the short id except the number: "MAK-REP-". Shown beside the
  // input, unedited, because branch and series are not the saver's to choose —
  // they follow the branch selector and the RTO rule.
  const shortIdPrefix = nextShortId.slice(0, nextShortId.lastIndexOf('-') + 1)

  function openHeaderEdit() {
    setHeaderError('')
    setHeaderEdit({
      date: dateOverride ?? autoDate,
      id: nextShortId.slice(nextShortId.lastIndexOf('-') + 1),
    })
  }

  // Take the typed date and number for the pending save. Both are checked here
  // so a mistake is answered at the point it was made, in the field it was made
  // in — the server checks them again at save time, where it is the authority
  // on a number that was still free a moment ago.
  function applyHeaderEdit(e) {
    e.preventDefault()
    const date = String(headerEdit?.date ?? '').trim()
    const typed = String(headerEdit?.id ?? '').trim()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setHeaderError('Pick a date for this report')
    const n = parseBlockNumber(typed)
    if (n == null)
      return setHeaderError(`"${typed}" is not a document number — try ${blockNumber(autoNumber)}, or ${autoNumber}`)

    // The one the database would refuse, named the way its holder reads it.
    const clash = (saved ?? []).find(
      (r) => seriesOf(r) === nextSeries && String(r.branch ?? '') === String(seriesBranch) && (r.docNumber ?? 0) === n,
    )
    if (clash) {
      return setHeaderError(`${shortLabel(clash)} already exists (${clash.dateLabel}) — choose another number`)
    }

    // Only a value that actually differs becomes an override. Applying the
    // editor unchanged must leave the document exactly as it was found.
    setDateOverride(date === autoDate ? null : date)
    setDocOverride(n === autoNumber ? null : n)
    setHeaderEdit(null)
    setHeaderError('')
  }

  function clearHeaderEdit() {
    setDateOverride(null)
    setDocOverride(null)
    setHeaderEdit(null)
    setHeaderError('')
  }

  // Agency dropdown order: the one picked last sits on top, then the rest by how
  // often they have actually been used (saved reports + the working set), with
  // A–Z breaking ties. Usage is counted from real entries rather than a separate
  // tally, so the list can never drift out of step with the data.
  const { agencyOptions, topAgencies } = useMemo(() => {
    const counts = new Map()
    const bump = (v) => {
      const a = String(v ?? '')
        .trim()
        .toUpperCase()
      if (a && a !== '-') counts.set(a, (counts.get(a) ?? 0) + 1)
    }
    for (const r of saved ?? []) for (const e of r.entries ?? []) bump(e.agency)
    for (const e of entries ?? []) bump(e.agency)

    // Agencies may carry Tel prefixes now; ordering and display are by name.
    const all = optionNames(options.agencies)
    const uses = (a) => counts.get(String(a).trim().toUpperCase()) ?? 0
    const byUsage = [...all].sort((a, b) => uses(b) - uses(a) || a.localeCompare(b))
    const rest = byUsage.filter((a) => a !== lastAgency)
    // Only pin the last pick if it is still an option — a renamed or deleted
    // agency must not resurrect itself at the top of the list.
    const agencyOptions = all.includes(lastAgency) ? [lastAgency, ...rest] : rest
    // The busiest 3 — real usage only, so a never-used agency never crowds out
    // one technicians actually pick, and the quick-pick buttons stay tight.
    // The blank/whitespace/'-' guard is belt-and-suspenders: bump() already
    // keeps those out of `counts`, so this only matters if that ever changes.
    const topAgencies = byUsage.filter((a) => String(a ?? '').trim() && a !== '-' && uses(a) > 0).slice(0, 3)
    return { agencyOptions, topAgencies }
  }, [options.agencies, saved, entries, lastAgency])

  // The footer chips: the agency a number selected first, then the busiest few.
  //
  // One list rather than a separate control for the auto-selected one, because
  // they do the same thing — file this entry under that agency — and two
  // shapes for one action would say they differ. It leads because it is the
  // one the entry already names.
  //
  // De-duplicated on the trimmed, uppercased name: topAgencies is built from
  // stored entries and autoAgency comes off the options list, so the same
  // agency reaching here spelled two ways must still be one chip.
  const sameAgency = (a, b) =>
    String(a ?? '')
      .trim()
      .toUpperCase() ===
    String(b ?? '')
      .trim()
      .toUpperCase()
  const footerAgencies = autoAgency
    ? [autoAgency, ...topAgencies.filter((a) => !sameAgency(a, autoAgency))]
    : topAgencies

  // Plain names for every place that just needs to list or match a
  // technician — Manage Inputs is the only place that needs the ID
  // alongside the name, so everywhere else works off this instead of
  // options.technicians directly.
  const technicianNames = useMemo(() => (options.technicians ?? []).map(technicianName), [options.technicians])
  // Models may carry Tel prefixes now; the dropdown only ever shows the name.
  const modelOptions = useMemo(() => optionNames(options.models), [options.models])

  // Collapse the entry card in All-Branches (read-only merged) mode.
  useEffect(() => {
    setEntryOpen(!isAllBranches)
  }, [isAllBranches])

  // Activity matrix (rows × terminal columns) from saved reports. All three
  // views share one column layout — only the row axis changes: a single date,
  // the days of a month, or the twelve months of a year.
  const matrix = useMemo(() => {
    const [y, m, d] = monthPeriod.anchor.split('-').map(Number)
    if (!y || !m) return null
    if (monthPeriod.kind === 'year') {
      return buildYearMatrix(saved, {
        year: y,
        branch: monthBranch,
        manualByMonth: manualYear,
      })
    }
    const opts = {
      year: y,
      month: m - 1,
      branch: monthBranch,
      manual: manualSheet,
    }
    return monthPeriod.kind === 'day' ? buildDayMatrix(saved, { ...opts, day: d }) : buildMonthlyMatrix(saved, opts)
  }, [saved, monthPeriod, monthBranch, manualSheet, manualYear])

  // Columns grouped by their brand header, for horizontal collapse.
  const groupCols = useMemo(
    () =>
      matrix
        ? matrix.groups.map((g) => ({
            group: g.group,
            cols: matrix.columns.filter((c) => c.group === g.group),
          }))
        : [],
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
      lines.push(
        [r.date, r.dayName, ...matrix.columns.map((c) => r.counts[c.key] || 0), r.description].map(esc).join(','),
      )
    }
    lines.push(['Total', '', ...matrix.columns.map((c) => matrix.totals[c.key] || 0), ''].map(esc).join(','))
    downloadText(`${matrixSlug()}.csv`, lines.join('\n'))
  }

  // Excel export that mirrors the on-screen table (grouped headers, green
  // weekends, red device tags) as an HTML table — shared by the Excel and PDF
  // exports so both match the desktop file (device labels like (AIRBUS-TH1N) red).
  function monthlyTableHtml(colgroupHtml = '') {
    const esc = (v) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
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
      for (const c of matrix.columns)
        h += `<td style="${b}${bg}text-align:center;padding:4px;">${r.counts[c.key] || ''}</td>`
      h += `<td style="${b}${bg}padding:4px;">${descHtml(r.description)}</td>`
      h += '</tr>'
    }
    h += `<tr><td colspan="2" style="${b}background:#eee;font-weight:bold;padding:4px;">Total</td>`
    for (const c of matrix.columns)
      h += `<td style="${b}background:#eee;font-weight:bold;text-align:center;padding:4px;">${matrix.totals[c.key] || 0}</td>`
    h += `<td style="${b}background:#eee;"></td></tr></tbody></table>`
    return h
  }

  function handleExportMonthlyExcel() {
    if (!matrix) return
    const full = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${monthlyTableHtml()}</body></html>`
    const blob = new Blob(['\ufeff', full], {
      type: 'application/vnd.ms-excel',
    })
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

  // Three lists, and every saved record lands in exactly one: daily reports,
  // reference-only records, and transmittals. Reference-only is tested first
  // because it is the narrower claim — a report is a daily report only if it is
  // not one of these. A transmittal is never reference-only (the flag comes from
  // an RTO, which is a service action), but the order settles that too.
  // Admin sees all branches' saved reports; scope the list to the selected
  // branch unless "All Branches" is chosen. (Non-admins are already server-scoped.)
  const inBranch = (r) => isAllBranches || String(r.branch ?? '') === String(branch)
  const isRefOnly = (r) => !isTx(r) && Boolean(r.isReferenceOnly)

  // Ordered by the id on the row, highest number first — the document just
  // issued is the one being looked for, so it opens at the top. The server
  // returns these newest-SAVED first, which is a different order entirely: a
  // report written up late carries an earlier date and a later number, so A008
  // could sit between A006 and A005 and the column of ids read as though it had
  // been shuffled.
  //
  // Sorting on the rendered id rather than on docNumber is what keeps the
  // All-Branches view legible: the id begins with the branch code, so the rows
  // group by branch instead of interleaving every branch's A001, then every
  // branch's A002. The number is zero-padded and block letters ascend
  // (A999 < B001), so a plain string compare is already numeric order —
  // nothing to parse, nothing to get wrong. Reversed for descending, which
  // orders the branch groups Z–A as well; the grouping itself survives either
  // way, and the number is what is being read down the column.
  const byDocId = (a, b) => shortLabel(b).localeCompare(shortLabel(a), 'en')
  const dailySaved = useMemo(
    () => saved.filter((r) => !isTx(r) && !isRefOnly(r) && inBranch(r)).sort(byDocId),
    [saved, branch, isAllBranches],
  )
  const refSaved = useMemo(
    () => saved.filter((r) => isRefOnly(r) && inBranch(r)).sort(byDocId),
    [saved, branch, isAllBranches],
  )
  const txSaved = useMemo(
    () => saved.filter((r) => isTx(r) && inBranch(r)).sort(byDocId),
    [saved, branch, isAllBranches],
  )
  const reportResults = useMemo(() => searchInside(dailySaved, savedSearch), [dailySaved, savedSearch])
  const refResults = useMemo(() => searchInside(refSaved, savedRefSearch), [refSaved, savedRefSearch])
  const txResults = useMemo(() => searchInside(txSaved, savedTxSearch), [txSaved, savedTxSearch])
  // Each list is searchable by its OWN short form — RTO-A001 finds the
  // reference-only record, TRA-A001 the transmittal — because each one asks
  // about the ids of the reports it actually holds.
  const reportIdHits = useMemo(() => searchById(dailySaved, savedSearch), [dailySaved, savedSearch])
  const refIdHits = useMemo(() => searchById(refSaved, savedRefSearch), [refSaved, savedRefSearch])
  const txIdHits = useMemo(() => searchById(txSaved, savedTxSearch), [txSaved, savedTxSearch])

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
    <li key={r.id} className={r.isReferenceOnly ? 'ref-only' : undefined}>
      <div>
        <strong>{shortLabel(r)}</strong>{' '}
        {r.isReferenceOnly && (
          <span className="ref-badge" title="Kept for the record only — no parts were used">
            Reference only
          </span>
        )}{' '}
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
              className="ghost"
              onClick={() => handleToggleReference(r)}
              title={
                r.isReferenceOnly
                  ? 'Treat this as a normal report again'
                  : 'Mark as kept for the record only — no parts were used'
              }
            >
              {r.isReferenceOnly ? 'Unmark reference' : 'Mark reference'}
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
          <button
            type="button"
            className="icon-edit"
            onClick={() => setEditSavedId(r.id)}
            aria-label="Edit"
            title="Edit"
          >
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
  const savedCard = ({
    icon,
    title,
    list,
    open,
    setOpen,
    search,
    setSearch,
    results,
    idHits = [],
    hint,
    empty,
    placeholder,
    tx = false,
  }) => (
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
            // An id query surfaces the DOCUMENT, in the same row the unfiltered
            // list uses — so it arrives with Load / Mark reference / Delete on
            // it, which is what someone who went looking for a specific report
            // came to do. Reusing savedRow rather than inventing a one-off
            // "report result" row also means the two can never describe the
            // same report differently.
            <>
              {idHits.length > 0 && <ul className="saved-list">{idHits.map(savedRow)}</ul>}
              {/* Line items are still shown when there are any — a query can
                  honestly be both. When it is only an id query they would be
                  noise, so the "No items match" line is suppressed. */}
              {(results.length > 0 || idHits.length === 0) && searchList(results, search, tx)}
            </>
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
          {/* The session died while the queue still held writes — usually a phone
              left offline past the 7-day cookie. Nothing is lost: the queue sits
              in IndexedDB and drains once App remounts after a fresh login. */}
          {sync.authExpired ? (
            <button
              type="button"
              className="sync-pill expired"
              onClick={onLogout}
              title="Your session expired while offline. Log in again and the queued changes will sync automatically — nothing has been lost."
            >
              <span className="side-ico">🔑</span>
              <span className="side-label">
                Session expired
                <small>
                  Log in again to sync
                  {sync.pending > 0 && ` (${sync.pending} pending)`}
                </small>
              </span>
            </button>
          ) : (
            // Hidden entirely in the offline desktop edition: its server is on
            // this same machine, so there is no remote to be behind and nothing
            // a technician could usefully do about "syncing". An expired session
            // still shows above, because that one is real and actionable.
            !sync.standalone &&
            (!sync.online || sync.pending > 0) && (
              <div
                className={`sync-pill${sync.online ? ' syncing' : ' offline'}`}
                title={
                  sync.online
                    ? 'Syncing queued changes to the server'
                    : 'Working offline — changes are saved on this device and will sync when you reconnect'
                }
              >
                <span className="side-ico">{sync.online ? '⟳' : '📴'}</span>
                <span className="side-label">
                  {sync.online ? 'Syncing…' : 'Offline'}
                  {sync.pending > 0 && (
                    <small>
                      {sync.pending} change{sync.pending === 1 ? '' : 's'} pending
                    </small>
                  )}
                </span>
                {/* Background Sync is unsupported on Firefox/Safari and the
                    browser can defer it anywhere — let the user force it. */}
                {sync.online && sync.pending > 0 && !sync.syncing && (
                  <button
                    type="button"
                    className="sync-retry"
                    onClick={() => syncNow()}
                    title="Sync queued changes now"
                  >
                    Sync now
                  </button>
                )}
              </div>
            )
          )}
          <InstallApp />
          <div className="side-user">
            <span
              className="side-user-info"
              title={`${user?.username} · ${isAdmin ? 'admin' : isDirector ? `${user?.region} director` : user?.branch || 'user'}`}
            >
              <span className="side-ico">{isAdmin ? '👑' : isDirector ? '🧭' : '👤'}</span>
              <span className="side-label">
                {user?.username}
                {/* An admin's line states the region they are narrowed to, so
                    what they are looking at is readable without going back to
                    the toolbar — "Admin · all branches" is true of the account,
                    but it is not true of the view once a region is chosen. */}
                <small>
                  {isAdmin ? adminScopeLabel : isDirector ? `${user?.region} · Director` : user?.branch || 'User'}
                </small>
              </span>
            </span>
            <button type="button" className="side-logout" onClick={onLogout} title="Sign out">
              <span className="side-ico">⎋</span>
              <span className="side-label">Sign out</span>
            </button>
          </div>
        </aside>

        <main className={`page-main app${WIDE_PAGES.has(page) ? ' wide' : ''}`}>
          <UpdateBanner />
          {error && <p className="error">{error}</p>}
          <WireIssiOffer wire={wire} onAgree={agreeWire} onDismiss={() => setWire(null)} />

          {page === 'report' && (
            <>
              <header className="topbar">
                <h1>TRC-MMS</h1>
                <div className="topbar-right">
                  <label className="date-field">
                    Mode
                    <SearchSelect
                      value={mode}
                      onChange={changeMode}
                      options={[
                        { value: 'report', label: 'Maintenance Report' },
                        { value: 'transmittal', label: 'Transmittal Report' },
                      ]}
                    />
                  </label>
                  {/* Region sits between Mode and Branch because that is the order the
                choice narrows in: what kind of document, then whose branches,
                then which one. Only an admin picks — a director runs one region
                and a plain user belongs to one branch, so for them it states a
                fact rather than offering a choice, the same way Branch is a
                read-only field for a plain user below. */}
                  <label className="date-field">
                    Region
                    {isAdmin ? (
                      <SearchSelect
                        value={adminRegion || ALL_REGIONS}
                        onChange={(e) => setAdminRegion(e.target.value === ALL_REGIONS ? '' : e.target.value)}
                        options={[...regionNames, ALL_REGIONS]}
                      />
                    ) : (
                      // A branch in no region has none to state. A dash, not a blank:
                      // an empty box reads as "still loading" or "you forgot to pick".
                      <input value={region || '—'} readOnly aria-label="Region" />
                    )}
                  </label>
                  <label className="date-field">
                    Branch
                    {lockBranch == null ? (
                      <SearchSelect value={branch} onChange={changeBranch} options={[...branchList, ALL_BRANCHES]} />
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

              {/* Code entry is a shortcut into the SAME create path as the form below —
            two alternate ways to create the same entry, so only one is ever
            shown. Transmittals move materials and have no CDS code, so the
            switch (and Quick Code Entry itself) is hidden there. */}
              {!isTransmittal && (
                <div className="entry-mode-switch">
                  <button
                    type="button"
                    className={entryMode === 'quick' ? 'active' : ''}
                    onClick={() => setEntryMode('quick')}
                    aria-pressed={entryMode === 'quick'}
                  >
                    🔤 Quick code entry
                  </button>
                  <button
                    type="button"
                    className={entryMode === 'manual' ? 'active' : ''}
                    onClick={() => setEntryMode('manual')}
                    aria-pressed={entryMode === 'manual'}
                  >
                    📋 Manual entry
                  </button>
                </div>
              )}

              {!isTransmittal && entryMode === 'quick' && (
                <CodeEntry
                  options={options}
                  agencies={agencyOptions}
                  topAgencies={topAgencies}
                  reportDate={form.reportDate}
                  onCreate={handleCodeCreate}
                  busy={busy}
                />
              )}

              <form onSubmit={handleSubmit} className="entry-form">
                {/* One card per entry. The top half is whatever identifies the entry
              — the device in a report, the handover pair in a transmittal —
              then a divider, then the lines being recorded against it. */}
                {(entryMode === 'manual' || isTransmittal) && (
                  /* One Enter-scope for the whole card, not one per group: the card is
             a single entry, so Enter walks it end to end in DOM order —
             Model -> Type -> Tel -> ISSI -> Technician -> Issue -> Qty ->
             Action -> Company -> Comment in a report, and Transmitted by ->
             Received by -> Type -> Material -> Qty -> Company -> Status ->
             Comment in a transmittal. With several fault rows the walk stays
             in the row the cursor is already in, again because that is DOM
             order. Enter stops at the Comment textarea, where it is a
             newline. */
                  <div
                    className="form-card"
                    ref={cardRef}
                    onKeyDown={(e) => {
                      advanceOnEnter(e)
                      if (isAddFaultShortcut(e)) {
                        e.preventDefault()
                        addFault()
                        // The row isn't in the DOM yet on this tick — wait a
                        // frame, then focus its first field (the
                        // Issue/Material input).
                        requestAnimationFrame(() => {
                          const rows = cardRef.current?.querySelectorAll('.faults .fault-row:not(.fault-head)')
                          rows?.[rows.length - 1]?.querySelector('input')?.focus()
                        })
                      } else if (isSaveShortcut(e) && !isTransmittal && form.agency) {
                        e.preventDefault()
                        agencyPicked.current = true
                        setAutoAgency('')
                        handleSubmit(undefined, form.agency)
                      }
                    }}
                  >
                    <button
                      type="button"
                      className="manage-toggle"
                      onClick={() => setEntryOpen((o) => !o)}
                      aria-expanded={entryOpen}
                    >
                      <span>{isTransmittal ? 'Transmittal Report' : 'Device & Faults'}</span>
                      <span className="chev">{entryOpen ? '▲' : '▼'}</span>
                    </button>
                    {entryOpen && (
                      <>
                        {isTransmittal ? (
                          isAllBranches ? (
                            <p className="saved-hint">
                              All Branches: each branch's own handover is added automatically — Transmitted by{' '}
                              <strong>{reportTransmittedBy || '—'}</strong>; Received by{' '}
                              <strong>{reportReceivedBy || '—'}</strong>. Set each branch's names by selecting that
                              branch.
                            </p>
                          ) : (
                            <div className="handover-grid">
                              <label>
                                Transmitted by
                                <SearchSelect
                                  value={transmittedBy}
                                  onChange={changeTransmittedBy}
                                  options={technicianNames}
                                />
                              </label>
                              <label>
                                Received by
                                <SearchSelect
                                  value={receivedBy}
                                  onChange={changeReceivedBy}
                                  options={technicianNames}
                                />
                              </label>
                            </div>
                          )
                        ) : (
                          <div className="grid">
                            <label>
                              Model {form.type === 'OTHER' && <span className="opt">(optional)</span>}
                              <SearchSelect
                                value={form.model}
                                onChange={setModel}
                                options={modelOptions}
                                // Tinted while the value showing is the one the Tel
                                // number picked, in the colour that says whether
                                // picking it moved the field. Compared rather than
                                // trusted: a stale autoModel must not tint a field
                                // that has moved on.
                                className={
                                  autoModel && autoModel.model === form.model
                                    ? autoModel.changed
                                      ? 'is-auto-new'
                                      : 'is-auto-same'
                                    : ''
                                }
                              />
                            </label>
                            <label>
                              Type
                              <SearchSelect value={form.type} onChange={setType} options={options.types} />
                            </label>
                            <label>
                              <span className="cap">
                                Technician <span className="opt">(optional · multiple)</span>
                              </span>
                              <MultiSelect
                                value={form.technician}
                                options={technicianNames}
                                onChange={(v) => setForm((f) => ({ ...f, technician: v }))}
                              />
                            </label>
                            <label>
                              <span className="cap">
                                Tel number <span className="opt">(optional)</span>
                              </span>
                              <input
                                ref={telRef}
                                value={form.telNumber}
                                onChange={setTel}
                                placeholder="Full number, e.g. 0501234567"
                              />
                              <StoredTelNotice tel={form.telNumber} model={form.model} models={options.models} />
                            </label>
                            <label>
                              <span className="cap">
                                ISSI number <span className="opt">(optional)</span>
                              </span>
                              <input
                                value={form.issiNumber}
                                onChange={setIssi}
                                placeholder="Full number, e.g. 12346575"
                                title="The agency follows from its leading digits. 00 means no activity today."
                              />
                            </label>
                          </div>
                        )}

                        <div className="entry-split" role="presentation" />

                        <div className="faults">
                          <div
                            className={`fault-row fault-head${isTransmittal ? ' fault-row--tx fault-row--txtype' : ''}`}
                          >
                            {isTransmittal && <span>Type</span>}
                            <span>{isTransmittal ? 'Material' : 'Issue'}</span>
                            <span>Qty</span>
                            {!isTransmittal && <span>Action</span>}
                            <span>Company</span>
                            {isTransmittal && <span>Status</span>}
                            <span />
                          </div>
                          {form.faults.map((fault, i) => {
                            // The no-activity row has no action and no company by
                            // definition — nothing was done, so nobody did it and nobody
                            // supplied a part. Both pickers are locked to "— none —"
                            // rather than merely defaulted to it: leaving them openable
                            // would offer choices that cannot be true of this row.
                            const locked = !isTransmittal && isNoActivityIssue(fault.issue)
                            return (
                              <div
                                className={`fault-row${isTransmittal ? ' fault-row--tx fault-row--txtype' : ''}`}
                                key={i}
                              >
                                {isTransmittal &&
                                  (i === 0 ? (
                                    <SearchSelect
                                      value={form.type || 'OTHER'}
                                      onChange={set('type')}
                                      options={options.types}
                                      ariaLabel="Type"
                                    />
                                  ) : (
                                    <span className="tx-type-spacer" aria-hidden="true" />
                                  ))}
                                {isTransmittal ? (
                                  <input
                                    list="materials-list"
                                    value={fault.issue}
                                    onChange={setFault(i, 'issue')}
                                    placeholder="e.g. A COVER"
                                    aria-label="Material"
                                  />
                                ) : (
                                  <IssueInput
                                    value={fault.issue}
                                    onChange={setFault(i, 'issue')}
                                    suggestions={rankedIssueSuggestions}
                                    onAssignCode={assignIssueCode}
                                    onRemove={removeIssueSuggestion}
                                    placeholder="e.g. A COVER"
                                  />
                                )}
                                <input
                                  type="number"
                                  // 0 only on the no-activity row, where it is the point.
                                  // Everywhere else a row is worth at least one of something.
                                  // Reads the row's own issue, so it matches the floor
                                  // withSavedQuantity will apply to it.
                                  min={isNoActivityIssue(fault.issue) ? '0' : '1'}
                                  step="1"
                                  value={fault.quantity}
                                  onChange={setFault(i, 'quantity')}
                                  aria-label="Quantity"
                                />
                                {!isTransmittal && (
                                  <SearchSelect
                                    value={fault.action}
                                    onChange={setFault(i, 'action')}
                                    // The blank option only where blank is an answer. Actions
                                    // are otherwise a required choice, and a "— none —" row
                                    // in every dropdown would invite one.
                                    options={locked ? [NONE_OPTION] : options.actions}
                                    ariaLabel="Action"
                                    disabled={locked}
                                    className={locked ? 'is-locked' : ''}
                                  />
                                )}
                                <SearchSelect
                                  value={fault.company}
                                  onChange={setFault(i, 'company')}
                                  options={[NONE_OPTION, ...options.companies]}
                                  ariaLabel="Company"
                                  icon="🏢"
                                  disabled={locked}
                                  className={locked ? 'is-locked' : ''}
                                />
                                {isTransmittal && (
                                  <SearchSelect
                                    value={fault.status}
                                    onChange={setFault(i, 'status')}
                                    options={options.statuses}
                                    ariaLabel="Item status"
                                  />
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
                            )
                          })}
                        </div>
                        {/* The issue-types datalist that used to live here is gone: its rows
                are built by issueSuggestions and drawn by IssueInput, which can
                put an "+ code" control inside a row — the one thing an
                OS-rendered datalist cannot do. Materials keep theirs; nothing
                is added from that field. */}
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
                          <span className="cap">
                            Comment <span className="opt">(optional)</span>
                          </span>
                          <textarea
                            value={form.comment}
                            onChange={set('comment')}
                            rows={2}
                            placeholder={isTransmittal ? 'Note for this transmittal entry…' : 'Note for this entry…'}
                          />
                        </label>

                        {/* The footer is outside the Enter walk. Enter on Agency submits
                the entry — that is the point of the field — so the card's
                handler must not see it and turn it into a focus move. */}
                        <div
                          className="faults-footer"
                          onKeyDown={(e) => {
                            if (isSaveShortcut(e) && form.agency) {
                              e.preventDefault()
                              agencyPicked.current = true
                              setAutoAgency('')
                              handleSubmit(undefined, form.agency)
                            }
                            e.stopPropagation()
                          }}
                        >
                          <button type="button" className="add-fault" onClick={addFault}>
                            {isTransmittal ? '+ Add material' : '+ Add fault'}
                          </button>
                          {isTransmittal ? (
                            <button type="submit" className="submit">
                              Add entry
                            </button>
                          ) : (
                            <>
                              <label className="footer-agency">
                                Agency
                                {/* Picking an agency IS "Add entry" — handleSubmit does its
                        own Model/Type/faults validation and just sets an
                        error if something's still missing, same as it
                        always has for faults. */}
                                <SearchSelect
                                  value={form.agency}
                                  options={agencyOptions}
                                  onChange={(e) => {
                                    const a = e.target.value
                                    agencyPicked.current = true
                                    setAutoAgency('') // chosen by hand now, whatever the number said
                                    setForm((f) => ({ ...f, agency: a }))
                                    handleSubmit(undefined, a)
                                  }}
                                />
                              </label>
                              {/* Quick picks, with the agency a number selected leading
                      them — the same chip as the rest, sat immediately beside
                      the field it was selected into.

                      Picking an agency is how an entry is added, and an agency
                      that selected ITSELF never gives anyone that moment: the
                      field already reads the right answer, so committing it
                      would otherwise mean re-choosing a value that is visibly
                      already chosen. This is that press. It files the entry —
                      it does not save the report; the day is closed from the
                      breakdown below as it always has been. */}
                              {footerAgencies.length > 0 && (
                                <div className="agency-quickpicks">
                                  {footerAgencies.map((a) => (
                                    <button
                                      key={a}
                                      type="button"
                                      // Tinted when this is the agency the ISSI number
                                      // picked out. It already leads the row, but the
                                      // chips are otherwise identical and position
                                      // alone did not say which one that was.
                                      className={sameAgency(a, autoAgency) ? 'is-auto' : undefined}
                                      onClick={() => {
                                        agencyPicked.current = true
                                        setAutoAgency('')
                                        setForm((f) => ({ ...f, agency: a }))
                                        handleSubmit(undefined, a)
                                      }}
                                      disabled={busy}
                                      title={`Add this entry under ${a}`}
                                    >
                                      {a}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
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
                              {e.type && e.type.toUpperCase() !== 'OTHER' && <p className="muted small">{e.type}</p>}
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
                                {/* Full numbers on screen, whatever exports are set
                              to show. This list is the working view behind a
                              login — masking it would hide the number from the
                              one person who needs to read it back off the
                              handset, while protecting nothing that has left. */}
                                {e.technician ? ` · ${e.technician}` : ''} · TEL {e.telNumber} · ISSI {e.issiNumber}
                              </span>
                              <p>{issueActionCell(e)}</p>
                            </>
                          )}
                          {e.comment && <p className="entry-comment muted small">💬 {e.comment}</p>}
                        </div>
                        <button
                          type="button"
                          className="entry-update"
                          onClick={() => openEdit(e)}
                          aria-label="Update entry"
                          title="Update entry"
                        >
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
                        <div className="grid" onKeyDown={advanceOnEnter}>
                          <label>
                            Model {editForm.type === 'OTHER' && <span className="opt">(optional)</span>}
                            <SearchSelect value={editForm.model} onChange={eSetModel} options={modelOptions} />
                          </label>
                          <label>
                            Type
                            <SearchSelect value={editForm.type} onChange={eSetType} options={options.types} />
                          </label>
                          <label>
                            Agency
                            <SearchSelect value={editForm.agency} onChange={eSetAgency} options={agencyOptions} />
                          </label>
                          <label>
                            <span className="cap">
                              Technician <span className="opt">(optional · multiple)</span>
                            </span>
                            <MultiSelect
                              value={editForm.technician}
                              options={technicianNames}
                              onChange={(v) => setEditForm((f) => ({ ...f, technician: v }))}
                            />
                          </label>
                          <label>
                            <span className="cap">
                              Tel number <span className="opt">(optional)</span>
                            </span>
                            <input
                              value={editForm.telNumber}
                              onChange={eSetTel}
                              placeholder="Full number, e.g. 0501234567"
                            />
                            <StoredTelNotice tel={editForm.telNumber} model={editForm.model} models={options.models} />
                          </label>
                          <label>
                            <span className="cap">
                              ISSI number <span className="opt">(optional)</span>
                            </span>
                            <input
                              value={editForm.issiNumber}
                              onChange={eSetIssi}
                              placeholder="Full number, e.g. 12346575"
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
                            <SearchSelect
                              value={editForm.type || 'OTHER'}
                              onChange={eSet('type')}
                              options={options.types}
                            />
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
                        {editForm.faults.map((fault, i) => {
                          const locked = !isTransmittal && isNoActivityIssue(fault.issue) // see the entry form's row
                          return (
                            <div className={`fault-row${isTransmittal ? ' fault-row--tx' : ''}`} key={i}>
                              {isTransmittal ? (
                                <input
                                  list="materials-list"
                                  value={fault.issue}
                                  onChange={eSetFault(i, 'issue')}
                                  placeholder="e.g. A COVER"
                                  aria-label="Material"
                                />
                              ) : (
                                <IssueInput
                                  value={fault.issue}
                                  onChange={eSetFault(i, 'issue')}
                                  suggestions={rankedIssueSuggestions}
                                  onAssignCode={assignIssueCode}
                                  onRemove={removeIssueSuggestion}
                                  placeholder="e.g. A COVER"
                                />
                              )}
                              <input
                                type="number"
                                min={isNoActivityIssue(fault.issue) ? '0' : '1'}
                                step="1"
                                value={fault.quantity}
                                onChange={eSetFault(i, 'quantity')}
                                aria-label="Quantity"
                              />
                              {!isTransmittal && (
                                <SearchSelect
                                  value={fault.action}
                                  onChange={eSetFault(i, 'action')}
                                  options={locked ? [NONE_OPTION] : options.actions}
                                  ariaLabel="Action"
                                  disabled={locked}
                                  className={locked ? 'is-locked' : ''}
                                />
                              )}
                              <SearchSelect
                                value={fault.company}
                                onChange={eSetFault(i, 'company')}
                                options={[NONE_OPTION, ...options.companies]}
                                ariaLabel="Company"
                                icon="🏢"
                                disabled={locked}
                                className={locked ? 'is-locked' : ''}
                              />
                              {isTransmittal && (
                                <SearchSelect
                                  value={fault.status}
                                  onChange={eSetFault(i, 'status')}
                                  options={options.statuses}
                                  ariaLabel="Item status"
                                />
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
                          )
                        })}
                      </div>

                      <label className="comment-field">
                        <span className="cap">
                          Comment <span className="opt">(optional)</span>
                        </span>
                        <textarea
                          value={editForm.comment}
                          onChange={eSet('comment')}
                          rows={2}
                          placeholder="Note for this entry…"
                        />
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
                    {/* The id the pending save will draw, in the form the saved
                  document will be shown by — the same one printed in the
                  report text below it. Editable, because a report written up a
                  day late belongs to the day it describes, and a number
                  sometimes has to match a document already issued on paper.
                  Not offered for All Branches, which is a merged read-only view
                  that cannot be saved at all. */}
                    {reports.length > 0 && (
                      <span className="hint">
                        (next: {nextShortId} · unsaved
                        {(dateOverride || docOverride != null) && <b className="hint-edited"> · edited</b>})
                        {!isAllBranches && !headerEdit && (
                          <button
                            type="button"
                            className="hint-edit"
                            onClick={openHeaderEdit}
                            title="Change the date and number this save will take"
                          >
                            ✎ Edit
                          </button>
                        )}
                      </span>
                    )}
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
                    {/* PDF and its Tel/ISSI lock are one control in two halves: the
                  button that produces the file, and the setting that decides
                  what is on it. Joined into a single bordered group — no gap, a
                  shared seam — because the adjacency IS the statement that the
                  lock applies to this output and nothing else. Wrapping them
                  also takes them out of the row's flex gap, which would
                  otherwise prise the pair apart.
                  Closed lock = masked; the entry list, the search and the
                  stored record all still hold the complete number. The state is
                  carried by the lock AND its tint, never by colour alone, and
                  the label the icon replaces lives on title + aria-label so it
                  is readable by hover and by screen reader. A transmittal has
                  no Tel/ISSI column, so there is nothing there to decide. */}
                    <span className="pdf-group">
                      <button
                        type="button"
                        className="btn-pdf"
                        onClick={() => printCurrentPage()}
                        disabled={!reports.length}
                      >
                        ⭳ PDF
                      </button>
                      {!isTransmittal && (
                        <button
                          type="button"
                          className={`btn-numbers${numberMode === 'masked' ? ' is-masked' : ''}`}
                          onClick={() => setNumberMode((m) => (m === 'masked' ? 'full' : 'masked'))}
                          disabled={!reports.length}
                          aria-pressed={numberMode === 'masked'}
                          aria-label={
                            numberMode === 'masked'
                              ? 'Tel/ISSI masked in the PDF — click for complete numbers'
                              : 'Tel/ISSI complete in the PDF — click to mask all but the last 4'
                          }
                          title={
                            numberMode === 'masked'
                              ? 'Tel/ISSI masked — the PDF shows the last 4 only (***4567). Click for complete numbers.'
                              : 'Tel/ISSI complete — the PDF shows the whole number. Click to mask all but the last 4.'
                          }
                        >
                          {numberMode === 'masked' ? '🔒' : '🔓'}
                        </button>
                      )}
                    </span>
                    <Toast message={saveToast} onDone={() => setSaveToast('')} />
                  </div>
                </div>
                {/* Date and number for the pending save. Applying only stages them —
              the document is written by Save, as it always was, so this cannot
              become a second way to save something. */}
                {headerEdit && (
                  <form className="header-edit" onSubmit={applyHeaderEdit}>
                    <label>
                      <span>Date</span>
                      <input
                        type="date"
                        value={headerEdit.date}
                        onChange={(e) => setHeaderEdit((h) => ({ ...h, date: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Report ID</span>
                      <span className="id-field">
                        <i>{shortIdPrefix}</i>
                        <input
                          value={headerEdit.id}
                          onChange={(e) => setHeaderEdit((h) => ({ ...h, id: e.target.value }))}
                          // A019 and 19 are the same document, so both are read (see
                          // parseBlockNumber) and neither is corrected under anyone.
                          placeholder={blockNumber(autoNumber)}
                          size={6}
                          autoFocus
                        />
                      </span>
                    </label>
                    <span className="header-edit-actions">
                      <button type="submit">Apply</button>
                      <button type="button" className="ghost" onClick={clearHeaderEdit}>
                        Use automatic
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setHeaderEdit(null)
                          setHeaderError('')
                        }}
                      >
                        Cancel
                      </button>
                    </span>
                    {headerError && <p className="header-edit-error">{headerError}</p>}
                    <p className="header-edit-note">
                      Applies when you Save. The date moves the entries themselves, so the monthly and spare-parts
                      totals follow it.
                    </p>
                  </form>
                )}
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
                  idHits: reportIdHits,
                  hint: 'Daily-report snapshots, saved under a unique REP-#### number. Load one back to review or edit it, then Save again to store it as a new report.',
                  empty: 'No saved reports yet — in Report mode, click “Save report” above.',
                  placeholder: '🔎 Search reports (id, item, model, branch, date, tel, ISSI)…',
                })}

              {/* Directly under the daily reports, and deliberately its own card: a
            reference-only record is kept for the future and counts towards
            nothing, so it should never be read as one row among the day's work. */}
              {!isTransmittal &&
                savedCard({
                  icon: '🔖',
                  title: 'Reference only',
                  list: refSaved,
                  open: savedRefOpen,
                  setOpen: setSavedRefOpen,
                  search: savedRefSearch,
                  setSearch: setSavedRefSearch,
                  results: refResults,
                  idHits: refIdHits,
                  hint: 'Kept for the record, not counted. Saved under their own REF-#### number, and left out of the monthly report, the dashboard, the spare-parts report and every agency and technician total. Marked automatically when a report contains an RTO; use “Unmark reference” to move one back.',
                  empty:
                    'No reference-only reports — a report is filed here when it contains an RTO, or when you mark it by hand.',
                  placeholder: '🔎 Search reference-only reports (id, item, model, branch, date, tel, ISSI)…',
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
                  idHits: txIdHits,
                  hint: 'Transmittal snapshots, saved under a unique TRANS-#### number — kept separate from daily reports.',
                  empty: 'No saved transmittals yet — switch to Transmittal mode and Save.',
                  placeholder: '🔎 Search transmittals (id, item, model, branch, date, tel, ISSI)…',
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
                      {lockBranch == null ? (
                        <SearchSelect value={branch} onChange={changeBranch} options={[...branchList, ALL_BRANCHES]} />
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
                        Paste rows from your sheet (copy from Excel = tab-separated):{' '}
                        <strong>Date, Day, the 18 columns in order, then Description</strong>. Empty cells stay blank.
                        Saved for {periodLabel(monthPeriod)}
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
                        {matrix.kind === 'year' &&
                          ' One row per month; the activity-description column is per-day, so it is blank here.'}
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
                              ? [
                                  <th key={group} className="col-sub collapsed-col">
                                    Σ
                                  </th>,
                                ]
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
                          <td colSpan={2} className="col-total">
                            Total
                          </td>
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

          {page === 'dashboard' && (
            <Dashboard
              saved={saved}
              branches={branchList}
              branchSel={branch}
              onBranch={selectBranch}
              embedded
              lockBranch={lockBranch}
              charts={options.charts}
            />
          )}

          {page === 'spareparts' && (
            <SparePartsReport
              saved={saved}
              branches={branchList}
              branchSel={branch}
              onBranch={selectBranch}
              embedded
              lockBranch={lockBranch}
              charts={options.charts}
            />
          )}

          {page === 'agency' && (
            <AgencyTotals
              saved={saved}
              branches={branchList}
              branchSel={branch}
              onBranch={selectBranch}
              embedded
              lockBranch={lockBranch}
            />
          )}

          {page === 'inventory' && (
            <Inventory embedded branch={isAllBranches ? '' : branch} region={region} options={options} />
          )}

          {page === 'reference' && <ReferenceCard isAdmin={isAdmin} issueTypes={options.issueTypes} />}

          {page === 'manage' && isAdmin && (
            <ManageInputs options={options} onChange={setCategory} onToggleChart={setChart} embedded />
          )}

          {page === 'admin' && (isAdmin || isDirector) && (
            <AdminUsers
              currentUser={user}
              branches={branchList}
              regions={options.regions}
              onAddBranch={addBranch}
              embedded
            />
          )}

          <footer className="app-footer">
            <Credit />
            {/* Which bundle this is. Dull until the day a total looks wrong —
                then it is the first thing to check, and the difference between
                "the rules changed" and "this tab is running last week's code". */}
            <span className="build-id" title="Build identifier — quote this when reporting a problem">
              build {BUILD_ID}
            </span>
          </footer>
        </main>
      </div>

      {/* Printable view — hidden on screen, shown only when printing (Save as PDF). */}
      <div className="print-only print-report">
        {reports.map((r) => (
          <PrintDate
            key={r.reportId ?? r.dateLabel}
            report={r}
            descByMaterial={descByMaterial}
            handoverByBranch={handoverMap}
          />
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
const bareName = (n) =>
  String(n || '')
    .replace(/[\s\-–/]*[\w\s]*\bTRC\b\s*$/i, '')
    .trim()

// Comma-separated names with branch labels stripped: "Gabriel, Sam".
const bareList = (val) =>
  String(val || '')
    .split(',')
    .map(bareName)
    .filter(Boolean)
    .join(', ')

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
        <div>
          <span>DATE</span>
          <b>{report.dateLabel}</b>
        </div>
        <div>
          <span>TRANSMITTAL ID</span>
          <b>{report.shortId || report.reportId || '-'}</b>
        </div>
        <div>
          <span>BRANCH</span>
          <b>{report.branch || '-'}</b>
        </div>
        <div>
          <span>TRANSMITTED BY</span>
          <b>{report.transmittedBy || '-'}</b>
        </div>
        <div>
          <span>RECEIVED BY</span>
          <b>{report.receivedBy || '-'}</b>
        </div>
        <div>
          <span>TOTAL QTY</span>
          <b>{totalQty}</b>
        </div>
      </div>

      <table className="print-main">
        <thead>
          <tr>
            <th>#</th>
            <th>TYPE</th>
            <th>MATERIAL</th>
            <th>DESCRIPTION</th>
            <th>QTY</th>
            <th>COMPANY</th>
            <th>STATUS</th>
            {isAll && (
              <>
                <th>DATE</th>
                <th>BY:</th>
              </>
            )}
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
                {n.label && (
                  <>
                    <b>{n.label}</b> —{' '}
                  </>
                )}
                {n.comment}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="print-sign">
        <div>
          <span className="print-sign-line" />
          Transmitted by
          {report.transmittedBy ? `: ${report.transmittedBy}` : ''}
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
        <div>
          <span>REPORT DATE</span>
          <b>{report.dateLabel}</b>
        </div>
        <div>
          <span>BRANCH</span>
          <b>{report.branch || '-'}</b>
        </div>
        <div>
          <span>REPORT ID</span>
          <b>{report.shortId || report.reportId || '-'}</b>
        </div>
        <div>
          <span>TOTAL ENTRIES</span>
          <b>{t.totalEntries}</b>
        </div>
        <div>
          <span>ALL DEVICE TOTAL PROGRAMMING</span>
          <b>{t.programming}</b>
        </div>
        <div>
          <span>ALL DEVICE TOTAL MAINTENANCE</span>
          <b>{t.maintenance}</b>
        </div>
        <div>
          <span>ALL DEVICE TOTAL INSTALL</span>
          <b>{t.install}</b>
        </div>
        <div>
          <span>ALL DEVICE TOTAL DISMANTLE</span>
          <b>{t.dismantle}</b>
        </div>
      </div>

      <table className="print-main">
        <thead>
          <tr>
            <th>#</th>
            <th>TEL#</th>
            <th>ISSI#</th>
            <th>MODEL</th>
            <th>ISSUE &amp; ACTION</th>
            <th>QTY</th>
            <th>AGENCY</th>
            <th>TECH</th>
          </tr>
        </thead>
        <tbody>
          {report.entries.map((e, i) => (
            <tr key={e.id}>
              <td>{i + 1}</td>
              {/* The sheet is the thing that leaves the app, so it is the thing
                  that decides how much of a number to show — never the stored
                  value read straight out. report.numberMode came from the
                  export setting via buildDateReport. */}
              <td>{displayNumber(e.telNumber, report.numberMode)}</td>
              <td>{displayNumber(e.issiNumber, report.numberMode)}</td>
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

// What the record will hold, shown while the number that will not be held is
// still on screen. A stand-in prefix is swapped for the real one at the save
// (see telForModel) — 103 for the 109 really on the car kit — and that happens
// on the server, after the form is gone, so without this the rule is invisible
// until someone opens the saved entry and finds a number they never typed.
//
// Silent unless the swap actually changes something, which is most entries: a
// line saying a number will be stored as itself is a line to learn to skip.
function StoredTelNotice({ tel, model, models }) {
  const stored = telForModel(tel, model, models)
  if (!tel || stored === tel) return null
  return (
    // A span, not a paragraph: this sits inside the Tel field's <label>, whose
    // content model is phrasing only.
    <span className="stored-tel" role="status" aria-live="polite">
      <span>Saves as</span>
      <strong>{stored}</strong>
    </span>
  )
}

// Offered after a save whose ISSI no agency answers to yet: wiring it up means
// the next number of that range selects the agency by itself. An offer rather
// than an automatic write — the option lists are admin-managed, and a prefix
// silently added by an entry is a mapping nobody chose.
function WireIssiOffer({ wire, onAgree, onDismiss }) {
  if (!wire) return null
  return (
    <p className="wire-issi" role="status" aria-live="polite">
      <span>
        No agency answers to ISSI <strong>{wire.prefix}</strong> yet. Wire it to <strong>{wire.agency}</strong> so the
        next one selects it by itself?
      </span>
      <button type="button" className="agree-pill" onClick={onAgree}>
        Agree
      </button>
      <button type="button" className="agree-pill agree-pill--quiet" onClick={onDismiss}>
        Not now
      </button>
    </p>
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
