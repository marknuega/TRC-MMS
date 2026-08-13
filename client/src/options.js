// Default dropdown option lists, seeded from the MOTECO / TRC defaults.
// At runtime these are merged with the user-managed lists saved via /api/options,
// so the Manage Inputs panel can add / edit / delete any of them.

export const DEFAULT_OPTIONS = {
  technicians: ['AMIR', 'M. RASHEED', 'RASHEEDULLAH', 'IMRAN', 'BAGHDAD', 'MAROOF'],

  agencies: [
    'PSD', 'CD', 'DOT', 'BG', 'PASS', 'PRI', 'FSF', 'SSF', 'TA', 'KFSC',
    'VIP', 'MJ', 'NA', 'GIP', 'GDCSS', 'NIC', 'AVS', 'RA', 'SFH', 'SA',
    'AFW', 'MOH', 'IS', 'EMH', 'SRCA', 'GPH', 'MOD', 'NG', 'GSA', 'PSS',
    'MEWA', 'TM', 'Kingdom', 'MOF', 'MOMRA', 'MCIT', 'NCA', 'MEIM', 'MEDIA', 'CAI',
    'MCI', 'SFES', 'SFSP', 'GACA', 'CC', 'MOFA', 'SFOC', 'SPL',
  ],

  types: ['SEPURA', 'AIRBUS', 'HYTERA', 'OTHER'],

  models: [
    'TH1N', 'THR9', 'TMR 880i', 'STP9000',
    'SRG3900 CARKIT', 'SRG3900 DESKTOP', 'SRG3900 BIKE', 'PT580H', 'PT590', 'MT680',
  ],

  issueTypes: [
    'A COVER', 'ANTENNA', 'ANTENNA BASE', 'ANTENNA CABLE', 'ANTENNA STICK',
    'B COVER', 'BATTERY 1590', 'BATTERY 1880', 'BATTERY 3180', 'BATTERY CONNECTOR',
    'BELT CLIP', 'CAPACITOR', 'CHARGER', 'DESK MIC', 'DIODE', 'DV15 CONNECTOR', 'FIST MIC',
    'HAND MICRO LOUD SPEAKER', 'HANDSET', 'HANDSET BASE', 'I/O PORT', 'KEYMATE',
    'INDUCTOR', 'LCD', 'LCD BASE', 'LCD CABLE', 'LEATHER CASE', 'MIC', 'MIC BOTTOM', 'MIC TOP',
    'NO TRANSMIT MODE', 'NOT AVAILABLE', 'POWER', 'POWER SUPPLY', 'PROGRAM ISSUE',
    'PTT', 'RESISTOR', 'ROT KNOB', 'ROT SWITCH', 'SIDE GRIP', 'SIDE GRIP 3D', 'SIGNAL',
    'SPEAKER BASE', 'SPEAKER HIGH', 'SPEAKER LOUD', 'SPEAKER LOW', 'SPEAKER MID',
    'TEMPORARY DISABLED', 'TOP BOARD', 'UI FRAME',
  ],

  // The report engine knows the codes for these built-ins (C/R/N/PCB/P/RP/I/RI/D).
  // Adding a custom action is fine — it just prints its own name as the code.
  actions: ['CHANGE', 'REPAIR', 'NEW', 'PCB', 'PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE'],

  // The report engine knows the display codes for these (MOT (P2), MOI, ...).
  companies: ['MOTECO', 'MOI', 'PROJECT 2', 'PROJECT X', 'ONLINE', 'MOTECO LOCAL', 'FREE'],

  // Materials — a managed list you can add to via Manage inputs. Each item is
  // { name, description }; a description auto-fills the transmittal DESCRIPTION
  // column when that material is picked. (Legacy plain strings are still read.)
  materials: [],

  // Transmittal item condition.
  statuses: ['New', 'Refurbish'],

  // Selectable branches (admin-managed). Add here to open a new branch; the name
  // is what gets stored on users, reports, and inventory for scoping.
  branches: ['Makkah', 'Taif', 'Jeddah'],

  // Chart visibility toggles (admin-managed in Manage Inputs). See DEFAULT_CHARTS.
  charts: {
    dashTopTech: true,
    dashPartsCompany: true,
    dashPartsBrand: true,
    spPartsCompany: true,
    spPartsBrand: true,
  },
}

// Default visibility for the pie charts; true = shown. Missing key = shown.
export const DEFAULT_CHARTS = {
  dashTopTech: true,
  dashPartsCompany: true,
  dashPartsBrand: true,
  spPartsCompany: true,
  spPartsBrand: true,
}

// Chart on/off switches shown in Manage Inputs — one per pie, per page.
export const CHART_TOGGLES = [
  { key: 'dashTopTech', label: 'Dashboard · Top technicians (pie)' },
  { key: 'dashPartsCompany', label: 'Dashboard · Parts by company (pie)' },
  { key: 'dashPartsBrand', label: 'Dashboard · Parts by brand (pie)' },
  { key: 'spPartsCompany', label: 'Spare Parts · Parts by company (pie)' },
  { key: 'spPartsBrand', label: 'Spare Parts · Parts by brand (pie)' },
]

// Default branches. The live list is admin-managed (Manage Inputs → Branches)
// and stored in AppOptions; this is the seed / fallback when none are saved.
export const BRANCHES = DEFAULT_OPTIONS.branches

// Admin-only "show every branch" selection. Shared across all pages so one
// branch choice follows the whole app. Maps to '' (no filter) when querying.
export const ALL_BRANCHES = 'All Branches'

// Selecting a model auto-fills the Type. Keyed by UPPERCASE model name.
export const MODEL_TYPE = {
  TH1N: 'AIRBUS',
  THR9: 'AIRBUS',
  'TMR 880I': 'AIRBUS',
  STP9000: 'SEPURA',
  'SRG3900 CARKIT': 'SEPURA',
  'SRG3900 DESKTOP': 'SEPURA',
  'SRG3900 BIKE': 'SEPURA',
  PT580H: 'HYTERA',
  PT590: 'HYTERA',
  MT680: 'HYTERA',
}

// Category order + labels for the Manage Inputs panel.
export const CATEGORIES = [
  { key: 'technicians', label: 'Technicians' },
  { key: 'agencies', label: 'Agencies' },
  { key: 'types', label: 'Types' },
  { key: 'models', label: 'Models' },
  { key: 'issueTypes', label: 'Issue types' },
  { key: 'actions', label: 'Actions' },
  { key: 'companies', label: 'Companies' },
  { key: 'materials', label: 'Materials' },
  { key: 'statuses', label: 'Item status' },
  { key: 'branches', label: 'Branches' },
]

// A materials item may be a plain string (legacy) or { name, description }.
export const materialName = (v) => (typeof v === 'string' ? v : String(v?.name ?? ''))
export const materialDesc = (v) => (typeof v === 'string' ? '' : String(v?.description ?? ''))
// Map of UPPERCASE material name -> description, for auto-filling the transmittal
// DESCRIPTION column from the picked material.
export function materialDescMap(materials) {
  const map = {}
  for (const it of materials ?? []) {
    const name = materialName(it).trim()
    if (name) map[name.toUpperCase()] = materialDesc(it)
  }
  return map
}

// ---------------------------------------------------------------------------
// Issue types
//
// An issue type may be a plain string (legacy) or
//   { name, device, base, description }
// where `device` is the equipment letter and `base` is the 2-digit + 1-letter
// base code. Together they spell the 4-character CDS code: H + 43A = H43A.
//
// The base code carries its own trailing letter because that letter is part of
// the part's identity here, not a build selector: 99A is the Charger-818 and
// 99B the Charger-DEY — two different chargers, not two builds of one.
// ---------------------------------------------------------------------------

// 2 digits then 1 letter, e.g. 43A. Anchored: a partial code decodes to nothing.
export const BASE_CODE_RE = /^\d{2}[A-Z]$/
const asObj = (v) => (typeof v === 'string' ? null : v)

export const issueName = (v) => (typeof v === 'string' ? v : String(v?.name ?? ''))
export const issueDevice = (v) => String(asObj(v)?.device ?? '').trim().toUpperCase()
export const issueBase = (v) => String(asObj(v)?.base ?? '').trim().toUpperCase()
export const issueDesc = (v) => String(asObj(v)?.description ?? '')

/** The full CDS code, or '' when either half is missing — half a code is not a
 *  code, and must never be indexed as one. */
export function issueCode(v) {
  const device = issueDevice(v)
  const base = issueBase(v)
  return device.length === 1 && BASE_CODE_RE.test(base) ? device + base : ''
}

/** Just the names, for the dropdowns and for matchOption. */
export const issueNames = (list) => (list ?? []).map(issueName).filter(Boolean)

/**
 * Index of CDS code -> issue type, for the decoder's exact-code path.
 * First claim wins, so a duplicated code can never flip meaning by list order.
 */
export function issueCodeIndex(list) {
  const index = {}
  for (const it of list ?? []) {
    const code = issueCode(it)
    if (code && !index[code]) index[code] = { name: issueName(it), description: issueDesc(it) }
  }
  return index
}

// Merge stored lists over the defaults (a saved category fully replaces its default).
export function mergeOptions(stored) {
  const out = {}
  for (const { key } of CATEGORIES) {
    const list = Array.isArray(stored?.[key]) ? stored[key] : DEFAULT_OPTIONS[key]
    out[key] = [...list]
  }
  // Chart toggles are a plain object, not a category list.
  const storedCharts = stored?.charts && typeof stored.charts === 'object' ? stored.charts : {}
  out.charts = { ...DEFAULT_CHARTS, ...storedCharts }
  return out
}
