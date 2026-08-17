// Extension-ful so `node --test` resolves it too, not just Vite. options.js is
// pure (no React), so a pure module may read it.
import { issueCode, issueName } from './options.js'

// ---------------------------------------------------------------------------
// Report engine — turns entries into the MOTECO-style TXT and PDF report data.
// Ported from the MOTECO generator. The DATA-DRIVEN bits that the samples don't
// fully pin down are collected at the top as editable constants — tweak these
// to match your exact house style.
// ---------------------------------------------------------------------------

// Order the AIRBUS / SEPURA / HYTERA split summaries appear in.
export const TYPE_ORDER = ['AIRBUS', 'SEPURA', 'HYTERA']

// company value -> printed label
const COMPANY_DISPLAY = {
  MOTECO: 'MOT',
  MOI: 'MOI',
  'PROJECT 2': 'MOT',
  'PROJECT X': 'MOI-RUH',
  ONLINE: 'MOT (ONLINE)',
  'MOTECO LOCAL': 'MOT (LOCAL)',
  FREE: '',
  '': '',
}

// RTO prints as its own three letters, like PCB — it is spelled out rather
// than abbreviated to a single character (see ACTION_ALT in codes.js).
const ACTION_CODE = {
  CHANGE: 'C', REPAIR: 'R', NEW: 'N', PCB: 'PCB',
  PROGRAM: 'P', 'RE-PROGRAM': 'RP', INSTALL: 'I', 'RE-INSTALL': 'RI', DISMANTLE: 'D',
  RTO: 'RTO',
}

const MAINTENANCE_ACTIONS = new Set(['CHANGE', 'REPAIR', 'NEW', 'PCB'])
const PROGRAM_ACTIONS = new Set(['PROGRAM', 'RE-PROGRAM'])
const INSTALL_ACTIONS = new Set(['INSTALL', 'RE-INSTALL'])
const DISMANTLE_ACTIONS = new Set(['DISMANTLE'])
// RTO (Return to Owner) hands the device back untouched: no work was performed
// and no part was consumed. It is its own category rather than a service one,
// so it never reaches the maintenance / programming / install / dismantle
// totals that the monthly, agency and technician aggregations are built from.
// It pairs with any parts code — a defective PCB handed back is 50F + RTO —
// so there is no PCB-specific RTO action; the part carries that meaning.
const RTO_ACTIONS = new Set(['RTO'])

const MODEL_DISPLAY = {
  'SRG3900 CARKIT': 'SRG CARKIT',
  'SRG3900 DESKTOP': 'SRG DESKTOP',
  'SRG3900 BIKE': 'SRG BIKE',
}

// Fixed model order within each type (AIRBUS, then SEPURA, then HYTERA).
const MODEL_ORDER = [
  // AIRBUS
  'TH1N', 'THR9', 'TMR 880I',
  // SEPURA
  'STP9000', 'SRG3900 CARKIT', 'SRG3900 DESKTOP', 'SRG3900 BIKE',
  // HYTERA
  'PT580H', 'PT590', 'MT680',
]
const MODEL_RANK = new Map(MODEL_ORDER.map((m, i) => [m, i]))

const DIVIDER = '------------------------------' // 30 dashes
const INDENT = '       ' // 7 spaces — continuation / total lines

const up = (v) => String(v ?? '').trim().toUpperCase()
// A technician field may hold several comma-separated names -> ['IMRAN','AMIR'].
// Empty -> ['-'] so unassigned entries still bucket together.
const techNames = (v) => {
  const list = up(v).split(',').map((s) => s.trim()).filter(Boolean)
  return list.length ? list : ['-']
}

// A spare part is consumed by a Change / New / PCB action — a Repair reuses the
// existing part, so it is counted as maintenance activity but not a part.
const isSparePartAction = (action) => {
  const a = up(action)
  return MAINTENANCE_ACTIONS.has(a) && a !== 'REPAIR'
}

export function classify(action) {
  const a = up(action)
  if (RTO_ACTIONS.has(a)) return 'rto'
  if (MAINTENANCE_ACTIONS.has(a)) return 'maintenance'
  if (PROGRAM_ACTIONS.has(a)) return 'programming'
  if (INSTALL_ACTIONS.has(a)) return 'install'
  if (DISMANTLE_ACTIONS.has(a)) return 'dismantle'
  return 'maintenance'
}

// Charger and Power Supply Unit are STANDALONE items: each unit is counted on
// its own (its full quantity), on top of the single "device" the rest of the
// entry's maintenance faults represent. So an entry with 10 chargers + another
// (non-charger) part counts as 11, not the max (10). Both items share this rule.
//
// WHICH parts those are is the code, not the name: 98 is the Power Supply and
// 99 the Charger, and the variant letter after them says which one — 99A is a
// Charger12, 99B a ChargerDC. A claim may name its part anything at all, so
// reading the name is guessing; reading the code is not.
const STANDALONE_PARTS = new Set(['98', '99'])

// An entry stores the issue NAME, never the code — so the two are matched back
// up through the claims. Punctuation and case carry no meaning across the two
// lists, same normalisation the decoder uses on either side of matchOption.
const claimKey = (v) => up(v).replace(/[^A-Z0-9]/g, '')

// { standalone, coded } name sets, rebuilt from the live Issue types whenever
// they change (see setIssueClaims). Null until something registers a list —
// the tests and the server never do, and fall through to the name pattern.
let claims = null

/**
 * Register the Issue types so the standalone rule can read codes.
 *
 * A module-level registration rather than an argument threaded through every
 * aggregation: the counts are derived in a dozen places (summary, print, TXT
 * export, dashboard, monthly), and one forgotten call site would mean two
 * screens quietly disagreeing about the same day — exactly the drift this rule
 * already cost us once. One writer, every reader in step.
 */
export function setIssueClaims(issueTypes) {
  const standalone = new Set()
  const coded = new Set()
  for (const it of issueTypes ?? []) {
    const code = issueCode(it) // '' unless BOTH parts and variant are present
    const key = claimKey(issueName(it))
    if (!code || !key) continue
    coded.add(key)
    if (STANDALONE_PARTS.has(code.slice(0, 2))) standalone.add(key)
  }
  claims = coded.size ? { standalone, coded } : null
}

// Fallback for a name no claim covers: hand-typed issues, and every report
// saved before codes existed. Matched on the START of the word — chargers are
// named with the model joined straight on (CHARGER12, CHARGER818, CHARGERDC)
// and a closing \b only matches when a space or punctuation follows, so every
// one of those used to fall through and count as an ordinary part. CHARGING
// PIN does not begin with CHARGER, so it stays excluded.
const STANDALONE_ITEM = /\bCHARGER|\bPOWER\s*SUPPLY/

function isStandaloneItem(issue) {
  if (claims) {
    const key = claimKey(issue)
    // A claimed code wins outright, in both directions: a 99 counts standalone
    // whatever it is called, and a part claimed as something else does NOT,
    // however charger-ish its name reads.
    if (claims.standalone.has(key)) return true
    if (claims.coded.has(key)) return false
  }
  return STANDALONE_ITEM.test(up(issue))
}

// Maintenance units on an entry = (sum of charger / power-supply-unit quantities)
// + (max quantity among the remaining maintenance faults). A multi-component
// repair still counts once; each charger/PSU adds on top.
function maintenanceCount(faults) {
  let standalone = 0
  let otherMax = 0
  for (const f of faults ?? []) {
    if (classify(f.action) !== 'maintenance') continue
    const q = Math.max(0, Number(f.quantity) || 0)
    if (isStandaloneItem(f.issue)) standalone += q
    else otherMax = Math.max(otherMax, q)
  }
  return standalone + otherMax
}

// Per-entry service counts. Maintenance follows the standalone-item rule above;
// programming/install/dismantle count the MAX quantity among that category's
// faults on the entry. -> { maintenance, programming, install, dismantle }.
export function entryCounts(entry) {
  const c = { maintenance: 0, programming: 0, install: 0, dismantle: 0 }
  for (const f of entry?.faults ?? []) {
    const cat = classify(f.action)
    if (cat === 'maintenance') continue // handled by maintenanceCount (standalone rule)
    // 'rto' is not a service category and has no counter here — writing c[cat]
    // blindly would put a NaN on the object for it.
    if (!(cat in c)) continue
    c[cat] = Math.max(c[cat], Math.max(0, Number(f.quantity) || 0))
  }
  c.maintenance = maintenanceCount(entry?.faults)
  return c
}

const modelDisplay = (m) => MODEL_DISPLAY[up(m)] ?? String(m ?? '').trim()
const lastWord = (s) => String(s ?? '').trim().split(/\s+/).pop() || ''
const modelShort = (m) => lastWord(modelDisplay(m)) // "SRG CARKIT" -> "CARKIT", "TH1N" -> "TH1N"
// Monthly description device tag: drop the leading "SRG " so Sepura car-kit /
// desktop / bike read as "(SEPURA-CARKIT)", "(SEPURA-DESKTOP)", "(SEPURA-BIKE)".
const descModel = (m) => modelDisplay(m).replace(/^SRG\s+/i, '')
const modelRank = (raw) => MODEL_RANK.get(up(raw)) ?? Number.MAX_SAFE_INTEGER // unknown models sort last
const companyDisplay = (c) => COMPANY_DISPLAY[up(c)] ?? String(c ?? '').trim()

// " (MOT (P2))" style used in the Materials Summary.
function summaryCompanyText(company) {
  const label = companyDisplay(company)
  return label ? ` (${label})` : ''
}

// ---- Materials Summary (by TYPE then model, qty aggregated) ----
// { AIRBUS: [{header, lines:[...]}], SEPURA: [...], ... } for the split PDF layout.
export function materialBlocksByType(entries) {
  const byType = {}
  for (const type of orderedTypes(entries)) {
    const typeEntries = entries.filter((e) => up(e.type) === type)
    const byModel = new Map() // modelDisplay -> Map(key -> {label, company, qty})
    const rawOf = new Map() // modelDisplay -> raw model (for the fixed sort order)
    const modelOrder = []
    for (const e of typeEntries) {
      const md = modelDisplay(e.model)
      if (!byModel.has(md)) {
        byModel.set(md, new Map())
        rawOf.set(md, e.model)
        modelOrder.push(md)
      }
      const bucket = byModel.get(md)
      for (const f of e.faults) {
        const isProgram = classify(f.action) === 'programming'
        const label = isProgram ? 'PROGRAMMING' : up(f.issue)
        const company = isProgram ? '' : summaryCompanyText(f.company)
        const key = `${label}|${company}`
        if (!bucket.has(key)) bucket.set(key, { label, company, qty: 0 })
        bucket.get(key).qty += Math.max(0, Number(f.quantity) || 0)
      }
    }
    modelOrder.sort((a, b) => modelRank(rawOf.get(a)) - modelRank(rawOf.get(b)))
    const blocks = []
    for (const md of modelOrder) {
      const rows = [...byModel.get(md).values()]
        .filter((r) => r.qty > 0)
        // Materials Summary is sorted alphabetically by label (unlike Entry Summary).
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }))
      if (!rows.length) continue
      blocks.push({ header: `${type} ${md}`, lines: rows.map((r) => `${r.label}${r.company} = ${r.qty}`) })
    }
    byType[type] = blocks
  }
  return byType
}

function buildMaterialsSummary(entries) {
  const byType = materialBlocksByType(entries)
  const sections = []
  for (const type of Object.keys(byType)) {
    for (const b of byType[type]) sections.push(`${b.header}\n${b.lines.join('\n')}`)
  }
  return sections
}

// Transmittal materials: device items grouped by "TYPE MODEL"; everything else
// (type OTHER or no real model) becomes a single numbered list.
// Returns { deviceSections: string[], otherLines: string[] }.
function transmittalMaterials(entries) {
  const fmt = (r) =>
    `${r.label} = ${r.qty}${r.company ? ` (${r.company})` : ''}${r.status ? ` - ${r.status.toUpperCase()}` : ''}`
  const aggregate = (list) => {
    const map = new Map()
    for (const e of list) {
      for (const f of e.faults) {
        const label = up(f.issue)
        if (!label) continue
        const company = companyDisplay(f.company)
        const status = String(f.status ?? '').trim()
        const key = `${label}|${company}|${status}`
        if (!map.has(key)) map.set(key, { label, company, status, qty: 0 })
        map.get(key).qty += Math.max(0, Number(f.quantity) || 0)
      }
    }
    return [...map.values()]
      .filter((r) => r.qty > 0)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }))
  }

  // An entry is "other" if its type is OTHER or it has no real device model.
  const isOther = (e) => {
    const md = modelDisplay(e.model)
    return up(e.type) === 'OTHER' || !md || md === '-'
  }
  const normalEntries = entries.filter((e) => !isOther(e))
  const otherEntries = entries.filter(isOther)

  const deviceSections = []
  for (const type of orderedTypes(normalEntries)) {
    const typeEntries = normalEntries.filter((e) => up(e.type) === type)
    const byModel = new Map()
    const rawOf = new Map()
    const order = []
    for (const e of typeEntries) {
      const md = modelDisplay(e.model)
      if (!byModel.has(md)) {
        byModel.set(md, [])
        rawOf.set(md, e.model)
        order.push(md)
      }
      byModel.get(md).push(e)
    }
    order.sort((a, b) => modelRank(rawOf.get(a)) - modelRank(rawOf.get(b)))
    for (const md of order) {
      const rows = aggregate(byModel.get(md))
      if (rows.length) deviceSections.push(`${type} ${md}\n${rows.map(fmt).join('\n')}`)
    }
  }

  const otherLines = aggregate(otherEntries).map((r, i) => `${i + 1}. ${fmt(r)}`)
  return { deviceSections, otherLines }
}

// Flat per-line rows for the transmittal PDF manifest.
// [{ type, model, material, qty, company, status }]
export function transmittalRows(entries) {
  const rows = []
  for (const e of entries) {
    for (const f of e.faults ?? []) {
      const material = up(f.issue)
      if (!material) continue
      rows.push({
        type: up(e.type),
        model: modelDisplay(e.model),
        material,
        qty: Math.max(0, Number(f.quantity) || 0),
        company: companyDisplay(f.company),
        status: String(f.status ?? '').trim(),
        branch: String(e.branch ?? ''),
        date: e.reportDate ?? '',
      })
    }
  }
  return rows
}

// Per-entry notes for the print view: [{ label, comment }].
export function reportNotes(entries) {
  return (entries ?? [])
    .filter((e) => String(e.comment ?? '').trim())
    .map((e) => ({
      label: modelDisplay(e.model) && modelDisplay(e.model) !== '-' ? modelDisplay(e.model) : (up(e.type) || 'Entry'),
      comment: String(e.comment).trim(),
    }))
}

// ---- Device Summary (by TYPE then device-short model) ----
// { AIRBUS: [{header, lines:[...]}], ... } for the split PDF layout.
export function deviceBlocksByType(entries) {
  const byType = {}
  for (const type of orderedTypes(entries)) {
    const typeEntries = entries.filter((e) => up(e.type) === type)
    const byDevice = new Map() // deviceShort -> {maintenance,program,install,dismantle}
    const rawOf = new Map() // deviceShort -> raw model (for the fixed sort order)
    const order = []
    for (const e of typeEntries) {
      const dev = modelShort(e.model)
      if (!byDevice.has(dev)) {
        byDevice.set(dev, { maintenance: 0, program: 0, install: 0, dismantle: 0 })
        rawOf.set(dev, e.model)
        order.push(dev)
      }
      const agg = byDevice.get(dev)
      // MAINTENANCE per device: the rest of the maintenance faults count once
      // (their max quantity), plus each charger / power-supply-unit on its own.
      // The other categories sum their quantities.
      for (const f of e.faults) {
        const cat = classify(f.action)
        const q = Math.max(0, Number(f.quantity) || 0)
        if (cat === 'programming') agg.program += q
        else if (cat === 'install') agg.install += q
        else if (cat === 'dismantle') agg.dismantle += q
      }
      agg.maintenance += maintenanceCount(e.faults)
    }
    order.sort((a, b) => modelRank(rawOf.get(a)) - modelRank(rawOf.get(b)))
    const blocks = []
    for (const dev of order) {
      const a = byDevice.get(dev)
      const cats = [
        ['MAINTENANCE', a.maintenance],
        ['PROGRAMMING', a.program],
        ['INSTALLATION', a.install],
        ['DISMANTLE', a.dismantle],
      ].filter(([, v]) => v > 0)
      if (!cats.length) continue
      const total = a.maintenance + a.program + a.install + a.dismantle
      // Per-block numbered lines (used by the PDF split columns).
      const lines = cats.map(([label, v], i) => `${i + 1}. ${label} = ${v}`)
      lines.push(`${INDENT}TOTAL = ${total}`)
      // cats + total kept so the TXT can number continuously across all blocks.
      blocks.push({ header: `${type} ${dev}`, lines, cats, total })
    }
    byType[type] = blocks
  }
  return byType
}

function buildDeviceSummary(entries) {
  const byType = deviceBlocksByType(entries)
  const sections = []
  let n = 0 // continuous line number across every block
  for (const type of Object.keys(byType)) {
    for (const b of byType[type]) {
      const lines = b.cats.map(([label, v]) => `${(n += 1)}. ${label} = ${v}`)
      lines.push(`${INDENT}TOTAL = ${b.total}`)
      sections.push(`${b.header}\n${lines.join('\n')}`)
    }
  }
  return sections
}

// Per-agency action tally: { agency, cats:[[label,value]], total }[] (agencies A-Z).
export function agencyBlocks(entries) {
  const byAgency = new Map()
  for (const e of entries ?? []) {
    const ag = up(e.agency) || '-'
    if (!byAgency.has(ag)) byAgency.set(ag, { maintenance: 0, program: 0, install: 0, dismantle: 0 })
    const a = byAgency.get(ag)
    for (const f of e.faults ?? []) {
      const cat = classify(f.action)
      const q = Math.max(0, Number(f.quantity) || 0)
      if (cat === 'programming') a.program += q
      else if (cat === 'install') a.install += q
      else if (cat === 'dismantle') a.dismantle += q
    }
    a.maintenance += maintenanceCount(e.faults)
  }
  return [...byAgency.keys()]
    .sort((x, y) => x.localeCompare(y))
    .map((ag) => {
      const a = byAgency.get(ag)
      const cats = [
        ['MAINTENANCE', a.maintenance],
        ['PROGRAMMING', a.program],
        ['INSTALLATION', a.install],
        ['DISMANTLE', a.dismantle],
      ].filter(([, v]) => v > 0)
      return { agency: ag, cats, total: a.maintenance + a.program + a.install + a.dismantle }
    })
    .filter((b) => b.cats.length)
}

// Compact agency roll-up, e.g.
//   Agency Summary
//   ------------------------------
//   KINGDOM [MAIN 7]
//   ------------------------------
//   PSD [INS 1]
// Part of the exported/copied report text (see buildTxt) — daily reports only,
// since a transmittal moves materials and has no agency of its own.
const AGENCY_ABBR = { MAINTENANCE: 'MAIN', PROGRAMMING: 'PROG', INSTALLATION: 'INS', DISMANTLE: 'DISM' }
export function agencyComment(entries) {
  const blocks = agencyBlocks(entries)
  if (!blocks.length) return ''
  const lines = blocks.map((b) => `${b.agency} ${b.cats.map(([l, v]) => `[${AGENCY_ABBR[l] || l} ${v}]`).join(' ')}`)
  const body = lines.reduce((acc, s, i) => (i ? [...acc, DIVIDER, s] : [s]), [])
  return ['Agency Summary', DIVIDER, ...body].join('\n')
}

// ---------------------------------------------------------------------------
// Spare-parts monthly report (faithful adaptation of the Makkah spare-parts
// sheet). All aggregations are pure so they can be unit-tested.
// ---------------------------------------------------------------------------

// Saved 'report' entries whose own service date falls in `key`, + optional
// branch, flattened to entries.
//
// `key` is a date PREFIX, so one function covers all three granularities:
//   '2026-08-13' -> that day    '2026-08' -> that month    '2026' -> that year
// Entry dates are ISO (YYYY-MM-DD), which sorts and truncates lexically, so a
// prefix compare is exactly a range compare here.
/**
 * Does this saved report contribute to the aggregated views at all?
 *
 * Two ways to be excluded, and one place that says so, because "which reports
 * count" is a single question however it is asked. Every roll-up in this file
 * reaches the saved list through here or through buildMonthlyMatrix, which
 * applies the same test.
 *
 *  - a TRANSMITTAL moves materials; it records no service activity;
 *  - a REFERENCE-ONLY report is kept for the record and nothing else. It is
 *    still openable, printable and exportable on its own — it just never counts
 *    towards a month, a dashboard, an agency or a technician.
 *
 * Whole-report, not line-by-line. RTO faults are already dropped one at a time
 * by classify(), but the reference-only mark is a statement about the document:
 * it is set by hand as often as it is auto-detected, and a report someone has
 * marked as a record is not half an activity report.
 */
export const isCountable = (r) => up(r?.mode) !== 'TRANSMITTAL' && !r?.isReferenceOnly

export function periodEntries(savedReports, key, branch = '') {
  const want = String(key ?? '')
  if (!want) return []
  const wantBranch = up(branch)
  const out = []
  // Every saved report is a disjoint snapshot (saving auto-clears the working
  // set), so aggregate them all — no same-day dedup — and filter by each entry's
  // OWN service date, which also handles reports that span more than one day.
  for (const r of savedReports ?? []) {
    if (!isCountable(r)) continue
    if (wantBranch && up(r.branch) !== wantBranch) continue
    for (const e of Array.isArray(r.entries) ? r.entries : []) {
      if (String(e.reportDate || '').slice(0, want.length) === want) out.push(e)
    }
  }
  return out
}

// Month-only shorthand, kept because monthKey reads clearer at the call sites
// that genuinely mean "this month".
export const monthEntries = (savedReports, monthKey, branch = '') =>
  periodEntries(savedReports, monthKey, branch)

// Parts consumed per brand -> device model. A "part" is a Change/New/PCB fault
// with a named issue (Repair reuses the part, so it is excluded); same part + same company
// sums, a different company keeps its own row. Rows sorted alphabetically.
// -> { AIRBUS: [{ model, rows:[{part,company,qty}], total }], SEPURA: [...] }
export function sparePartsByType(entries) {
  const byType = {}
  for (const type of orderedTypes(entries ?? [])) {
    const typeEntries = (entries ?? []).filter((e) => up(e.type) === type)
    const byModel = new Map()
    const rawOf = new Map()
    const order = []
    for (const e of typeEntries) {
      const md = modelDisplay(e.model)
      if (!byModel.has(md)) {
        byModel.set(md, new Map())
        rawOf.set(md, e.model)
        order.push(md)
      }
      const bucket = byModel.get(md)
      for (const f of e.faults ?? []) {
        if (!isSparePartAction(f.action)) continue // only Change/New/PCB consume a part (Repair reuses it)
        const part = up(f.issue)
        if (!part) continue
        const company = companyDisplay(f.company)
        const key = `${part}|${company}`
        if (!bucket.has(key)) bucket.set(key, { part, company, qty: 0 })
        bucket.get(key).qty += Math.max(0, Number(f.quantity) || 0)
      }
    }
    order.sort((a, b) => modelRank(rawOf.get(a)) - modelRank(rawOf.get(b)))
    const models = []
    for (const md of order) {
      const rows = [...byModel.get(md).values()]
        .filter((r) => r.qty > 0)
        .sort((a, b) => a.part.localeCompare(b.part, undefined, { sensitivity: 'base', numeric: true }))
      if (rows.length) models.push({ model: md, rows, total: rows.reduce((s, r) => s + r.qty, 0) })
    }
    if (models.length) byType[type] = models
  }
  return byType
}

// Device-level activity counts per brand -> model: a device contributes 1 to a
// category if it has at least one fault in that category (a device can be both
// maintained and programmed). -> [{ type, model, maintenance, programming,
// install, dismantle, total }] in TYPE + model order.
export function activityTotals(entries) {
  const byGroup = new Map()
  const rawOf = new Map()
  for (const e of entries ?? []) {
    const type = up(e.type)
    const md = modelDisplay(e.model)
    const key = `${type}|${md}`
    if (!byGroup.has(key)) {
      byGroup.set(key, { type, model: md, maintenance: 0, programming: 0, install: 0, dismantle: 0 })
      rawOf.set(key, e.model)
    }
    const g = byGroup.get(key)
    const c = entryCounts(e)
    g.maintenance += c.maintenance
    g.programming += c.programming
    g.install += c.install
    g.dismantle += c.dismantle
  }
  return [...byGroup.entries()]
    .sort((a, b) => {
      const t = TYPE_ORDER.indexOf(a[1].type) - TYPE_ORDER.indexOf(b[1].type)
      if (t !== 0) return t
      return modelRank(rawOf.get(a[0])) - modelRank(rawOf.get(b[0]))
    })
    .map(([, g]) => ({ ...g, total: g.maintenance + g.programming + g.install + g.dismantle }))
    .filter((g) => g.total > 0)
}

// Full spare-parts report model for a set of entries.
export function buildSparePartsReport(entries) {
  const parts = sparePartsByType(entries)
  const companyTotals = new Map()
  let grand = 0
  for (const type of Object.keys(parts))
    for (const m of parts[type])
      for (const r of m.rows) {
        const c = r.company || '—'
        companyTotals.set(c, (companyTotals.get(c) || 0) + r.qty)
        grand += r.qty
      }
  return {
    parts,
    companyTotals: [...companyTotals.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([company, qty]) => ({ company, qty })),
    grandParts: grand,
    activity: activityTotals(entries),
    agencies: agencyBlocks(entries),
  }
}

// ---------------------------------------------------------------------------
// Performance dashboard aggregations (all pure).
// ---------------------------------------------------------------------------

// Per-technician workload: devices handled + device-level activity counts +
// spare parts consumed. Sorted by total activity (busiest first).
export function technicianTotals(entries) {
  const by = new Map()
  for (const e of entries ?? []) {
    const names = techNames(e.technician) // one entry may credit several technicians
    const c = entryCounts(e) // max count per category on this entry
    let parts = 0
    for (const f of e.faults ?? []) {
      if (classify(f.action) === 'maintenance') parts += Math.max(0, Number(f.quantity) || 0)
    }
    for (const t of names) {
      if (!by.has(t)) by.set(t, { technician: t, devices: 0, maintenance: 0, programming: 0, install: 0, dismantle: 0, parts: 0 })
      const g = by.get(t)
      g.devices += 1
      g.maintenance += c.maintenance
      g.programming += c.programming
      g.install += c.install
      g.dismantle += c.dismantle
      g.parts += parts
    }
  }
  return [...by.values()]
    .map((g) => ({ ...g, total: g.maintenance + g.programming + g.install + g.dismantle }))
    .sort((a, b) => b.total - a.total || b.devices - a.devices || a.technician.localeCompare(b.technician))
}

// Per-agency service transactions: a device (entry) counts once per category it
// has a fault in. -> [{ agency, maintenance, programming, install, dismantle,
// total }] busiest first.
export function agencyTransactions(entries) {
  const by = new Map()
  for (const e of entries ?? []) {
    const ag = up(e.agency) || '-'
    if (!by.has(ag)) by.set(ag, { agency: ag, maintenance: 0, programming: 0, install: 0, dismantle: 0 })
    const g = by.get(ag)
    const c = entryCounts(e)
    g.maintenance += c.maintenance
    g.programming += c.programming
    g.install += c.install
    g.dismantle += c.dismantle
  }
  return [...by.values()]
    .map((g) => ({ ...g, total: g.maintenance + g.programming + g.install + g.dismantle }))
    .sort((a, b) => b.total - a.total || a.agency.localeCompare(b.agency))
}

// Headline numbers for a set of entries.
export function dashboardSummary(entries) {
  const act = activityTotals(entries)
  const sum = act.reduce(
    (a, g) => ({
      maintenance: a.maintenance + g.maintenance,
      programming: a.programming + g.programming,
      install: a.install + g.install,
      dismantle: a.dismantle + g.dismantle,
    }),
    { maintenance: 0, programming: 0, install: 0, dismantle: 0 },
  )
  const parts = buildSparePartsReport(entries).grandParts
  const techs = new Set((entries ?? []).flatMap((e) => techNames(e.technician)).filter((t) => t !== '-'))
  const agencies = new Set((entries ?? []).map((e) => up(e.agency)).filter(Boolean))
  return { devices: (entries ?? []).length, ...sum, parts, technicians: techs.size, agencies: agencies.size }
}

// Top spare parts across all brands/models, busiest first.
export function topParts(entries, limit = 10) {
  const by = new Map()
  const parts = sparePartsByType(entries)
  for (const type of Object.keys(parts))
    for (const m of parts[type])
      for (const r of m.rows) {
        const key = `${r.part}|${r.company}`
        if (!by.has(key)) by.set(key, { part: r.part, company: r.company, qty: 0 })
        by.get(key).qty += r.qty
      }
  return [...by.values()].sort((a, b) => b.qty - a.qty || a.part.localeCompare(b.part)).slice(0, limit)
}

// One row per month present in the saved data, for trend charts.
export function monthlyTrend(savedReports, branch = '') {
  const months = new Set()
  const wantBranch = up(branch)
  for (const r of savedReports ?? []) {
    // Which MONTHS get a row, so this needs the same test: a month whose only
    // report is reference-only would otherwise plot a row of zeroes.
    if (!isCountable(r)) continue
    if (wantBranch && up(r.branch) !== wantBranch) continue
    const m = String(r.dateLabel || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) months.add(`${m[3]}-${m[2].padStart(2, '0')}`)
  }
  return [...months].sort().map((mk) => ({ monthKey: mk, ...dashboardSummary(monthEntries(savedReports, mk, branch)) }))
}

// Types present, in the canonical AIRBUS/SEPURA/HYTERA order, then any extras.
function orderedTypes(entries) {
  const present = new Set(entries.map((e) => up(e.type)))
  const ordered = TYPE_ORDER.filter((t) => present.has(t))
  for (const t of present) if (!ordered.includes(t)) ordered.push(t)
  return ordered
}

// ---- Header totals ----
export function headerTotals(entries) {
  let maintenance = 0
  let programming = 0
  let install = 0
  let dismantle = 0
  for (const e of entries) {
    // Each category counts the MAX quantity among that category's faults on the entry.
    const c = entryCounts(e)
    maintenance += c.maintenance
    programming += c.programming
    install += c.install
    dismantle += c.dismantle
  }
  return { totalEntries: entries.length, programming, maintenance, install, dismantle }
}

// ---- PDF "ISSUE & ACTION" cell (one line, faults joined by +) ----
export function issueActionCell(entry) {
  return entry.faults
    .map((f) => {
      const action = up(f.action)
      const cat = classify(action)
      const qty = Math.max(0, Number(f.quantity) || 0)
      if (cat === 'programming') return `${action === 'RE-PROGRAM' ? 'RE-PROGRAMMING' : 'PROGRAMMING'} (P) (${qty})`
      const issue = up(f.issue)
      const code = ACTION_CODE[action] || action
      const comp = companyDisplay(f.company)
      const tag = cat === 'install' ? '(I)' : cat === 'dismantle' ? '(D)' : `(${code})`
      return `${issue ? `${issue} ` : ''}${tag} (${qty})${comp ? ` ${comp}` : ''}`
    })
    .join(' + ')
}

export const entryQty = (entry) =>
  entry.faults.reduce((s, f) => s + (Number(f.quantity) || 0), 0)

// Group listed entries by report date (newest first), carrying the REP-#### id.
// Entries are expected to have `reportDate` (ISO) and `reportId` from the API.
export function groupReports(entries) {
  const byKey = new Map() // YYYY-MM-DD -> { dateLabel, reportId, entries }
  for (const e of entries) {
    const key = new Date(e.reportDate).toISOString().slice(0, 10)
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        dateLabel: new Date(e.reportDate).toLocaleDateString('en-GB'),
        reportId: e.reportId ?? null,
        entries: [],
      })
    }
    byKey.get(key).entries.push(e)
  }
  // Newest date first; entries within a date keep API order (creation order).
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
}

// ---- Full report model for one date ----
// opts: { branch, mode: 'report'|'transmittal', transmittedBy, receivedBy }
export function buildDateReport(dateLabel, reportId, entries, opts = {}) {
  const { branch = '', mode = 'report', transmittedBy = '', receivedBy = '' } = opts
  return {
    dateLabel,
    reportId,
    branch,
    mode,
    transmittedBy,
    receivedBy,
    entries,
    totals: headerTotals(entries),
    materialsSummary: buildMaterialsSummary(entries),
    deviceSummary: buildDeviceSummary(entries),
    tx: mode === 'transmittal' ? transmittalMaterials(entries) : null,
  }
}

// Per-entry notes: "MODEL — comment".
function buildNotes(entries) {
  return entries
    .filter((e) => String(e.comment ?? '').trim())
    .map((e) => `${modelDisplay(e.model)} — ${String(e.comment).trim()}`)
}

// ---- TXT export (Report or Transmittal) ----
export function buildTxt(report) {
  const join = (sections) =>
    sections.length ? sections.reduce((acc, s, i) => (i ? [...acc, DIVIDER, s] : [s]), []) : ['NO ENTRY']

  const isTransmittal = report.mode === 'transmittal'
  const notes = buildNotes(report.entries)

  const header = [
    report.dateLabel,
    isTransmittal ? 'MATERIAL TRANSMITTAL' : 'DAILY ACTIVITY REPORT',
    ...(report.branch ? [`BRANCH: ${report.branch}`] : []),
    ...(isTransmittal && report.transmittedBy ? [`TRANSMITTED BY: ${report.transmittedBy}`] : []),
    ...(isTransmittal && report.receivedBy ? [`RECEIVED BY: ${report.receivedBy}`] : []),
    `${isTransmittal ? 'TRANSMITTAL' : 'REPORT'} ID: ${report.reportId ?? '-'}`,
    DIVIDER,
  ]

  if (isTransmittal) {
    // Device blocks (grouped) then a single numbered list of other materials.
    const { deviceSections, otherLines } = report.tx ?? { deviceSections: [], otherLines: [] }
    const parts = [...deviceSections]
    if (otherLines.length) parts.push(otherLines.join('\n'))
    const body = parts.length
      ? parts.reduce((acc, s, i) => (i ? [...acc, DIVIDER, s] : [s]), [])
      : ['NO ENTRY']
    const lines = [...header, ...body]
    if (notes.length) lines.push(DIVIDER, 'Notes', DIVIDER, ...notes)
    return lines.join('\n')
  }

  const lines = [
    ...header,
    'Entry & Materials Summary',
    DIVIDER,
    ...join(report.materialsSummary),
    DIVIDER,
    'Device Summary',
    DIVIDER,
    ...join(report.deviceSummary),
  ]
  // Agency roll-up, scoped to THIS report's own entries so a multi-date export
  // gets one tally per date rather than one merged tally for the whole file.
  const agency = agencyComment(report.entries)
  if (agency) lines.push(DIVIDER, agency)
  if (notes.length) lines.push(DIVIDER, 'Notes', DIVIDER, ...notes)
  return lines.join('\n')
}

// ---- Monthly activity matrix (dates × terminal columns) ----
// savedReports: [{ dateLabel:'dd/mm/yyyy', branch, mode, seq, entries:[...] }]
// opts: { year, month(0-11), branch, models:[...], modelType:{ MODELUPPER: TYPE } }
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Fixed column layout that matches the MOTECO monthly activity sheet exactly.
// Each model column lists the entry-model values that feed it; install/dismantle
// columns list the entry types that feed them.
const MONTHLY_GROUPS = [
  {
    group: 'Airbus Terminals (Repair& Programing)',
    cols: [
      { key: 'th1n', label: 'TH1n', kind: 'model', models: ['TH1N'] },
      { key: 'thr9', label: 'THR9', kind: 'model', models: ['THR9'] },
      { key: 'tmr880i', label: 'TMR880i', kind: 'model', models: ['TMR 880I', 'TMR880I'] },
    ],
  },
  {
    group: 'Airbus Car Kit (TH1n/TH9)',
    cols: [
      { key: 'ack_i', label: 'Installation', kind: 'install', types: ['AIRBUS'] },
      { key: 'ack_d', label: 'Dismantling', kind: 'dismantle', types: ['AIRBUS'] },
    ],
  },
  {
    group: 'Sepura Terminals (Repair& Programing, Installation, Dismantling)',
    cols: [
      { key: 'stp9000', label: 'STP 9000', kind: 'model', models: ['STP9000'] },
      { key: 'srg_carkit', label: 'SRG 3900 Car Kit', kind: 'model', models: ['SRG3900 CARKIT', 'SRG CARKIT'] },
      { key: 'srg_moto', label: 'SRG 3900 Motorcycle', kind: 'model', models: ['SRG3900 BIKE', 'SRG3900 MOTORCYCLE', 'SRG BIKE'] },
      { key: 'srg_desktop', label: 'SRG 3900 Desktop', kind: 'model', models: ['SRG3900 DESKTOP', 'SRG DESKTOP'] },
      { key: 'sep_i', label: 'Installation', kind: 'install', types: ['SEPURA'] },
      { key: 'sep_d', label: 'Dismantling', kind: 'dismantle', types: ['SEPURA'] },
    ],
  },
  {
    group: 'Hytera (Repair& Programing, Installation, Dismantling)',
    cols: [
      { key: 'pt580', label: 'PT580', kind: 'model', models: ['PT580H', 'PT580'] },
      { key: 'pt590', label: 'PT590', kind: 'model', models: ['PT590'] },
      { key: 'mt680', label: 'MT680', kind: 'model', models: ['MT680'] },
      { key: 'hyt_i', label: 'Installation', kind: 'install', types: ['HYTERA'] },
      { key: 'hyt_d', label: 'Dismantling', kind: 'dismantle', types: ['HYTERA'] },
    ],
  },
]

export function buildMonthlyMatrix(savedReports, opts = {}) {
  // manual: optional pasted override -> { [day]: { counts:{colKey:number}, description:string } }
  const { year, month, branch = '', manual = null } = opts

  const columns = MONTHLY_GROUPS.flatMap((g) => g.cols.map((c) => ({ ...c, group: g.group })))
  const groups = MONTHLY_GROUPS.map((g) => ({ group: g.group, span: g.cols.length }))
  const modelToKey = new Map() // MODELUPPER -> column key
  const installByType = new Map() // TYPEUPPER -> column key
  const dismantleByType = new Map()
  const modelRankMap = new Map() // MODELUPPER -> position in the column order (for description sort)
  let modelRankIdx = 0
  for (const c of columns) {
    if (c.kind === 'model') {
      for (const m of c.models) {
        modelToKey.set(up(m), c.key)
        modelRankMap.set(up(m), modelRankIdx)
      }
      modelRankIdx += 1
    }
    if (c.kind === 'install') for (const t of c.types) installByType.set(up(t), c.key)
    if (c.kind === 'dismantle') for (const t of c.types) dismantleByType.set(up(t), c.key)
  }

  // Aggregate every saved report's entries by the entry's own service date
  // (reports are disjoint snapshots — saving auto-clears the working set).
  const byDay = new Map() // day -> { entries: [] }
  for (const r of savedReports ?? []) {
    if (!isCountable(r)) continue
    if (branch && up(r.branch) !== up(branch)) continue
    for (const e of Array.isArray(r.entries) ? r.entries : []) {
      const m = String(e.reportDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m || +m[1] !== year || +m[2] - 1 !== month) continue
      const day = +m[3]
      if (!byDay.has(day)) byDay.set(day, { entries: [] })
      byDay.get(day).entries.push(e)
    }
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const rows = []
  const totals = {}
  for (const c of columns) totals[c.key] = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month, day).getDay()
    const isWeekend = dow === 5 || dow === 6 // Fri / Sat
    const rec = byDay.get(day)
    const counts = {}
    for (const c of columns) counts[c.key] = 0
    const parts = []
    const man = manual && manual[day]
    if (man) {
      // Pasted data wins for this day.
      for (const c of columns) counts[c.key] = Math.max(0, Number(man.counts?.[c.key]) || 0)
    } else if (rec) {
      const byDevice = new Map() // tag -> { items:[], rank }
      for (const e of rec.entries) {
        const mk = up(e.model)
        const t = up(e.type)
        let maintSum = 0
        let program = 0
        let install = 0
        let dismantle = 0
        for (const f of e.faults ?? []) {
          const cat = classify(f.action)
          const q = Math.max(0, Number(f.quantity) || 0)
          if (cat === 'maintenance') maintSum += q
          else if (cat === 'programming') program += q
          else if (cat === 'install') install += q
          else if (cat === 'dismantle') dismantle += q
        }
        // Repair/programming model columns count the device once (a device with
        // several faults is still one device). Install & Dismantle are device-
        // level counts, so they use the quantity — the SAME "max per entry" rule
        // the Dashboard uses (dismantling 6 devices in one entry counts as 6).
        const c = entryCounts(e)
        const mKey = modelToKey.get(mk)
        if (mKey && maintSum + program > 0) counts[mKey] += 1
        const iKey = installByType.get(t)
        if (iKey && c.install > 0) counts[iKey] += c.install
        const dKey = dismantleByType.get(t)
        if (dKey && c.dismantle > 0) counts[dKey] += c.dismantle
        const faultItems = (e.faults ?? [])
          .filter((f) => up(f.issue))
          .map((f) => ({ issue: up(f.issue), comp: companyDisplay(f.company), qty: Math.max(0, Number(f.quantity) || 0) }))
        if (faultItems.length) {
          const tag = mk && mk !== '-' ? `${t}-${descModel(e.model)}` : t
          if (!byDevice.has(tag)) {
            const rank = modelRankMap.get(mk) ?? modelRankMap.get(up(modelDisplay(e.model))) ?? Number.MAX_SAFE_INTEGER
            byDevice.set(tag, { merged: new Map(), rank })
          }
          // Same issue + same company within a device is one line with summed
          // quantity; a different company keeps its own line. First-seen order.
          const merged = byDevice.get(tag).merged
          for (const it of faultItems) {
            const key = `${it.issue}||${it.comp}`
            const prev = merged.get(key)
            if (prev) prev.qty += it.qty
            else merged.set(key, { ...it })
          }
        }
      }
      // One tag per device (no repeats); faults comma-separated + period; devices in column order.
      for (const [tag, dev] of [...byDevice.entries()].sort((a, b) => a[1].rank - b[1].rank)) {
        const items = [...dev.merged.values()].map((it) => `${it.issue} (${it.qty})${it.comp ? ` ${it.comp}` : ''}`)
        parts.push(`(${tag}) ${items.join(', ')}.`)
      }
    }
    const description = man ? String(man.description ?? '') : parts.join(' ')
    for (const c of columns) totals[c.key] += counts[c.key]
    rows.push({
      day,
      date: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`,
      dayName: DAY_NAMES[dow],
      isWeekend,
      counts,
      description,
      hasData: !!(man || rec),
    })
  }

  return {
    year,
    month,
    monthName: MONTH_NAMES[month],
    branch,
    columns,
    groups,
    rows,
    totals,
    kind: 'month',
    rowHeads: ['Date', 'Day'],
  }
}

// ---- Day / Year views over the same column layout ----
//
// Both reuse buildMonthlyMatrix rather than re-deriving the counting rules, so
// there is exactly one place where "what counts as a maintenance" is decided.

// One month's matrix narrowed to a single day. `day` is 1-31.
export function buildDayMatrix(savedReports, opts = {}) {
  const { day, ...rest } = opts
  const m = buildMonthlyMatrix(savedReports, rest)
  const rows = m.rows.filter((r) => r.day === day)
  const totals = {}
  for (const c of m.columns) totals[c.key] = rows.reduce((s, r) => s + (r.counts[c.key] || 0), 0)
  return { ...m, rows, totals, kind: 'day' }
}

// Twelve rows, one per month, each row holding that month's column totals.
// `manualByMonth` is { [month 0-11]: pastedSheet } so a pasted month still wins
// inside its own totals — the year view is a roll-up, never a second source.
export function buildYearMatrix(savedReports, opts = {}) {
  const { year, branch = '', manualByMonth = null } = opts
  const months = MONTH_NAMES.map((_, month) =>
    buildMonthlyMatrix(savedReports, { year, month, branch, manual: manualByMonth?.[month] ?? null }),
  )
  const columns = months[0].columns
  const totals = {}
  for (const c of columns) totals[c.key] = 0

  const rows = months.map((m, month) => {
    for (const c of columns) totals[c.key] += m.totals[c.key]
    return {
      day: month + 1,
      date: `${MONTH_NAMES[month]} ${year}`,
      // The activity narrative is written per day; a whole month of it would be
      // unreadable in one cell, so the year view leaves that column empty.
      dayName: '',
      isWeekend: false,
      counts: m.totals,
      description: '',
      hasData: m.rows.some((r) => r.hasData),
    }
  })

  return {
    year,
    month: null,
    monthName: String(year),
    branch,
    columns,
    groups: months[0].groups,
    rows,
    totals,
    kind: 'year',
    rowHeads: ['Month', ''],
  }
}

// Column keys in matrix order (18), for parsing pasted rows.
export function monthlyColumnKeys() {
  return MONTHLY_GROUPS.flatMap((g) => g.cols.map((c) => c.key))
}

// Parse a pasted sheet (Excel TSV or CSV). Expected columns per row:
//   Date, Day, <18 count columns in matrix order>, Description
// Returns { [day]: { counts:{colKey:number}, description } }. Header/blank rows are skipped.
export function parseMonthlyPaste(text) {
  const keys = monthlyColumnKeys()
  const manual = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const fields = line.includes('\t') ? line.split('\t') : line.split(',')
    const dateCell = (fields[0] || '').trim()
    const dm = dateCell.match(/^(\d{1,2})[/-]\d{1,2}[/-]\d{2,4}$/)
    let day = null
    if (dm) day = +dm[1]
    else if (/^\d{1,2}$/.test(dateCell)) day = +dateCell
    if (!day || day < 1 || day > 31) continue // skip headers / non-data rows
    const counts = {}
    for (let i = 0; i < keys.length; i++) {
      const v = (fields[2 + i] || '').trim()
      counts[keys[i]] = v !== '' && !Number.isNaN(Number(v)) ? Number(v) : 0
    }
    manual[day] = { counts, description: (fields[2 + keys.length] || '').trim() }
  }
  return manual
}
