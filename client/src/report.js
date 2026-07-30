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

const ACTION_CODE = {
  CHANGE: 'C', REPAIR: 'R', NEW: 'N', PCB: 'PCB',
  PROGRAM: 'P', 'RE-PROGRAM': 'RP', INSTALL: 'I', 'RE-INSTALL': 'RI', DISMANTLE: 'D',
}

const MAINTENANCE_ACTIONS = new Set(['CHANGE', 'REPAIR', 'NEW', 'PCB'])
const PROGRAM_ACTIONS = new Set(['PROGRAM', 'RE-PROGRAM'])
const INSTALL_ACTIONS = new Set(['INSTALL', 'RE-INSTALL'])
const DISMANTLE_ACTIONS = new Set(['DISMANTLE'])

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

export function classify(action) {
  const a = up(action)
  if (MAINTENANCE_ACTIONS.has(a)) return 'maintenance'
  if (PROGRAM_ACTIONS.has(a)) return 'programming'
  if (INSTALL_ACTIONS.has(a)) return 'install'
  if (DISMANTLE_ACTIONS.has(a)) return 'dismantle'
  return 'maintenance'
}

const modelDisplay = (m) => MODEL_DISPLAY[up(m)] ?? String(m ?? '').trim()
const lastWord = (s) => String(s ?? '').trim().split(/\s+/).pop() || ''
const modelShort = (m) => lastWord(modelDisplay(m)) // "SRG CARKIT" -> "CARKIT", "TH1N" -> "TH1N"
const modelRank = (raw) => MODEL_RANK.get(up(raw)) ?? Number.MAX_SAFE_INTEGER // unknown models sort last
const companyDisplay = (c) => COMPANY_DISPLAY[up(c)] ?? String(c ?? '').trim()

// " (MOT) P2" style used in the Entry Summary.
function entryCompanyText(company) {
  const label = companyDisplay(company)
  if (!label) return ''
  const m = label.match(/^(.*?)\s*\((P\d+)\)$/i)
  if (m) return ` (${m[1].trim()}) ${m[2].toUpperCase()}`
  return ` (${label})`
}

// " (MOT (P2))" style used in the Materials Summary.
function summaryCompanyText(company) {
  const label = companyDisplay(company)
  return label ? ` (${label})` : ''
}

// ---- Entry Summary line (one per fault) ----
function entryFaultLine(fault, model, { includeAgency, agency }) {
  const action = up(fault.action)
  const issue = up(fault.issue)
  const qty = Math.max(0, Number(fault.quantity) || 0)
  const cat = classify(action)

  // INSTALL / RE-INSTALL / DISMANTLE are device-level: no "-MODEL" suffix, and the
  // component issue is optional (the action stands alone).
  let label
  if (cat === 'programming') label = action === 'RE-PROGRAM' ? 'RE-PROGRAMMING' : 'PROGRAMMING'
  else if (action === 'INSTALL') label = !issue || /^INSTALL\b/.test(issue) ? 'INSTALL' : `INSTALL ${issue}`
  else if (action === 'RE-INSTALL') label = !issue || /^RE-?INSTALL\b/.test(issue) ? 'RE-INSTALL' : `RE-INSTALL ${issue}`
  else if (action === 'DISMANTLE') label = !issue || /^DISMANTLE\b/.test(issue) ? 'DISMANTLE' : `DISMANTLE ${issue}`
  else if (action === 'NEW') label = `NEW ${issue}`
  else if (action === 'PCB') label = `PCB ${issue}`
  else label = `${issue} (${ACTION_CODE[action] || action})` // CHANGE / REPAIR

  const tag = cat === 'install' ? ' (I)' : cat === 'programming' ? ' (P)' : cat === 'dismantle' ? ' (D)' : ''
  const companyText = tag || entryCompanyText(fault.company) // program/install/dismantle hide company
  const agencyText = includeAgency && agency && up(agency) !== '-' ? ` ${up(agency)}` : ''
  return `${label}${companyText}${qty > 0 ? ` (${qty})` : ''}${agencyText}`.trim()
}

// ---- Entry Summary block (grouped by model, numbered per entry) ----
function buildEntrySummary(entries) {
  const lines = []
  let prevModelKey = ''
  let n = 0
  for (const e of entries) {
    const modelKey = up(e.model)
    if (lines.length && modelKey !== prevModelKey) lines.push(DIVIDER)
    if (modelKey !== prevModelKey) lines.push(modelDisplay(e.model))
    prevModelKey = modelKey
    n += 1
    e.faults.forEach((f, i) => {
      const prefix = i === 0 ? `${n}. ` : INDENT
      const includeAgency = i === e.faults.length - 1 // agency on the last fault line only
      lines.push(`${prefix}${entryFaultLine(f, e.model, { includeAgency, agency: e.agency })}`)
    })
  }
  return lines.join('\n')
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
      // MAINTENANCE per device = the largest quantity among its maintenance faults
      // (a multi-component repair counts once; a bulk fault like BATTERY x15 counts 15).
      // The others sum their quantities.
      let maxMaint = 0
      for (const f of e.faults) {
        const cat = classify(f.action)
        const q = Math.max(0, Number(f.quantity) || 0)
        if (cat === 'maintenance') maxMaint = Math.max(maxMaint, q)
        else if (cat === 'programming') agg.program += q
        else if (cat === 'install') agg.install += q
        else if (cat === 'dismantle') agg.dismantle += q
      }
      agg.maintenance += maxMaint
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
    // MAINTENANCE per device = max quantity among its maintenance faults (see buildDeviceSummary).
    let maxMaint = 0
    for (const f of e.faults) {
      const cat = classify(f.action)
      const q = Math.max(0, Number(f.quantity) || 0)
      if (cat === 'maintenance') maxMaint = Math.max(maxMaint, q)
      else if (cat === 'programming') programming += q
      else if (cat === 'install') install += q
      else if (cat === 'dismantle') dismantle += q
    }
    maintenance += maxMaint
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

  const lines = [
    report.dateLabel,
    isTransmittal ? 'MATERIAL TRANSMITTAL' : 'DAILY ACTIVITY REPORT',
    ...(report.branch ? [`BRANCH: ${report.branch}`] : []),
    ...(isTransmittal && report.transmittedBy ? [`TRANSMITTED BY: ${report.transmittedBy}`] : []),
    ...(isTransmittal && report.receivedBy ? [`RECEIVED BY: ${report.receivedBy}`] : []),
    `${isTransmittal ? 'TRANSMITTAL' : 'REPORT'} ID: ${report.reportId ?? '-'}`,
    DIVIDER,
    isTransmittal ? 'Materials' : 'Entry & Materials Summary',
    DIVIDER,
    ...join(report.materialsSummary),
  ]

  // Device summary only makes sense for the activity report.
  if (!isTransmittal) {
    lines.push(DIVIDER, 'Device Summary', DIVIDER, ...join(report.deviceSummary))
  }

  // Per-entry comments/notes at the end, when present.
  if (notes.length) {
    lines.push(DIVIDER, 'Notes', DIVIDER, ...notes)
  }

  return lines.join('\n')
}
