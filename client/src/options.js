// Default dropdown option lists, seeded from the MOTECO / TRC defaults.
// At runtime these are merged with the user-managed lists saved via /api/options,
// so the Manage Inputs panel can add / edit / delete any of them.

export const DEFAULT_OPTIONS = {
  technicians: ['AMIR', 'M. RASHEED', 'RASHEEDULLAH', 'IMRAN', 'BAGHDAD', 'MAROOF'],

  // `prefixes` work exactly as they do for models below — the same Tel number,
  // matched against this list instead: 1804133 is the PSD, 1917670 the CD.
  // `issiPrefixes` are the same idea read off the ISSI instead (see below).
  agencies: [
    { name: 'PSD', prefixes: ['180'], issiPrefixes: ['180'] },
    { name: 'CD', prefixes: ['191'], issiPrefixes: ['191'] },
    'DOT', 'BG', 'PASS',
    // 191 is deliberately claimed by CD as well. Two agencies may hold one
    // prefix (see the note under PREFIX_RE); CD is higher in this list, so an
    // ISSI starting 191 selects CD and PRI stays one dropdown away. Move PRI
    // above CD in Manage inputs to reverse that.
    { name: 'PRI', issiPrefixes: ['191'] },
    'FSF', 'SSF', 'TA', 'KFSC',
    'VIP', 'MJ', 'NA', 'GIP', 'GDCSS', 'NIC', 'AVS', 'RA', 'SFH', 'SA',
    'AFW', 'MOH', 'IS', 'EMH', { name: 'SRCA', issiPrefixes: ['214'] }, 'GPH', 'MOD', 'NG', 'GSA', 'PSS',
    'MEWA', 'TM', 'Kingdom', 'MOF', 'MOMRA', 'MCIT', 'NCA', 'MEIM', 'MEDIA', 'CAI',
    'MCI', 'SFES', 'SFSP', 'GACA', 'CC', 'MOFA', 'SFOC', 'SPL',
    // The agency a "no activity today" entry is filed under — see NO_ACTIVITY_ISSI.
    'No Activity',
  ],

  types: ['SEPURA', 'AIRBUS', 'HYTERA', 'OTHER'],

  // `prefixes` are the leading digits of a Tel number that belong to this
  // model, so typing the number picks the model (see modelsForTel below).
  // 109 is deliberately on all three SRG3900 builds: a number says SEPURA
  // console, never which console.
  models: [
    { name: 'TH1N', prefixes: ['355', '06'] },
    'THR9', 'TMR 880i',
    { name: 'STP9000', prefixes: ['190'] },
    { name: 'SRG3900 CARKIT', prefixes: ['109'] },
    { name: 'SRG3900 DESKTOP', prefixes: ['109'] },
    { name: 'SRG3900 BIKE', prefixes: ['109'] },
    'PT580H', 'PT590', 'MT680',
    // Not a device: the Model a "no activity today" entry carries, so the day
    // is on the record without claiming a radio was worked on.
    'For Record Purpose Only.',
  ],

  issueTypes: [
    // Claims the fault code 50F, so "H50F RTO MT" decodes to a defective PCB
    // handed back to its owner. A claim needs no code-map entry: parts 50 and
    // variant F mean nothing on their own, only together and only here.
    { name: 'DEFECTIVE PCB', parts: '50', variant: 'F' },
    // The one "fault" that says no work was done — 00 being the parts number
    // that claims nothing. It is what an ISSI of 00 puts on the row.
    { name: 'No Activity', parts: '00', variant: 'A' },
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
  // RTO (Return to Owner) means the device went back untouched; saving a report
  // that contains one auto-marks it reference-only (see savedReports.js).
  actions: ['CHANGE', 'REPAIR', 'NEW', 'PCB', 'PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE', 'RTO'],

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

  // Region -> member branches. A director's workspace is exactly the branches
  // listed under their region, and an admin can narrow the whole app to one.
  //
  // These four are built in rather than left to server/scripts/seed-regions.js,
  // which writes the same map into AppOptions. A default that only existed in
  // the database meant the Region selector was empty until someone remembered
  // to run a script — and worse, an admin could pick a region the SERVER had
  // never heard of, which resolves to no branches and empties the whole app.
  // Shipping them makes the two agree out of the box; an admin-saved map still
  // wins, because mergeOptions() spreads the stored one over this.
  //
  // Membership names branches that may not exist yet in a given install (the
  // seed script adds them). That is not a problem: a region is a set of NAMES,
  // and one naming no branch that exists simply has nothing in it.
  regions: {
    'Western Region': ['Makkah', 'Jeddah', 'Taif'],
    'Northern Region': ['Tabuk', 'Al-Jawf', 'Hail'],
    'Southern Region': ['Asir', 'Jazan', 'Baha', 'Najran'],
    'Eastern Region': ['Dammam', 'Al Khobar', 'Dhahran'],
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

// Default regions. The live map is admin-managed and stored in AppOptions;
// this is the seed / fallback when none are saved.
export const REGIONS = DEFAULT_OPTIONS.regions

// Admin-only "don't narrow to a region" selection, the counterpart of
// ALL_BRANCHES above. Maps to '' on the wire, where absent means unnarrowed —
// so a region is either named or not, and there is no sentinel string for the
// server to have an opinion about. It is also the only view that spans regions:
// with a region selected, everything the app shows and totals comes from that
// region's branches alone.
export const ALL_REGIONS = 'All regions'

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

// ---------------------------------------------------------------------------
// Tel prefixes — shared by Models and Agencies
//
// A Tel number already says several things about the entry being written, and
// two of its fields can be read straight off it. An entry in either of those
// two lists may be a plain string (legacy, name only) or
//   { name, prefixes: ['355', '06'] }
// where each prefix is a run of the number's leading digits that belongs to
// that name: 190 is an STP9000 and 355 or 06 a TH1N; 180 is the PSD and 191 the
// CD. Typing the number then selects it, so what the number already states is
// not stated again by hand.
//
// Models and Agencies are matched INDEPENDENTLY, against their own list. They
// are separate questions about the same digits — 190 naming a model says
// nothing about which agency 190 might name — so one list never has to reserve
// numbers the other is using, and both can be extended without consulting the
// other.
//
// Prefixes are NOT one fixed length: they are whatever length distinguishes a
// range, which is why the longest matching one wins below rather than the first.
//
// A prefix may be held by several entries at once. That is not a mistake to be
// validated away — 109 covers the SRG3900 car kit, desktop AND bike, and no Tel
// number can say which of the three is on the bench. The first of them in the
// list is selected anyway, because a value that is right two times in three and
// one dropdown away from right the third beats an empty field that is never
// right. Which one leads is the admin's to set: it is list order, and Manage
// inputs is where the list is ordered.
// ---------------------------------------------------------------------------

// 2-6 digits. One digit would claim a tenth of every number in existence.
export const PREFIX_RE = /^\d{2,6}$/
export const optionName = (v) => (typeof v === 'string' ? v : String(v?.name ?? ''))
const digitPrefixes = (v) =>
  (Array.isArray(v) ? v : []).map((p) => String(p).replace(/\D/g, '')).filter(Boolean)
export const optionPrefixes = (v) => (typeof v === 'string' ? [] : digitPrefixes(v?.prefixes))

// ---------------------------------------------------------------------------
// ISSI prefixes — the same idea, read off the OTHER number
//
// A Tel number and an ISSI are two different numbering systems naming the same
// radio, and an installation is not obliged to have both. So an agency carries
// its own `issiPrefixes: ['180']` alongside `prefixes`, and the two are matched
// independently — exactly as Models and Agencies already are against the Tel
// number. 180 meaning the PSD in one says nothing about what 180 means in the
// other, and neither list has to reserve digits the other is using.
//
// Agencies only. What a Tel number says about the MODEL it does not also have
// to say twice; nobody asked for an ISSI to name a device, and a second source
// for a field the Model dropdown already fills from the Tel number is exactly
// the drift the note above telPick warns about.
// ---------------------------------------------------------------------------
export const optionIssiPrefixes = (v) => (typeof v === 'string' ? [] : digitPrefixes(v?.issiPrefixes))

/**
 * What an agency's acronym stands for: "PUBLIC SECURITY DEPARTMENT" for PSD.
 *
 * The NAME stays the acronym — it is the identity, it is what every saved
 * report stores, and it is what the dropdowns and the printed summaries show.
 * This is only what that acronym expands to, set in Manage inputs.
 *
 * Optional, and empty for most: the shared code map already carries these for
 * the agencies it knows, and Manage inputs falls back to it. What is set here
 * outranks it — same rule as an Issue type's code outranking Code Map's lookup
 * — so an installation can name its own agencies without waiting on the map.
 */
export const optionFullForm = (v) => (typeof v === 'string' ? '' : String(v?.fullForm ?? '').trim())

/** Just the names, for the dropdowns and for matchOption. */
export const optionNames = (list) => (list ?? []).map(optionName).filter(Boolean)

/** A Tel number as bare digits — what a prefix is compared against, so the
 *  spacing or punctuation someone types into the field cannot defeat a match. */
export const telDigits = (tel) => String(tel ?? '').replace(/\D/g, '')

/**
 * The entries of one list whose prefix a Tel number's leading digits match, or
 * null for none.
 *
 * Longest prefix wins, NOT the first: an installation that has both 06 and 0612
 * means 0612 to be the more specific of the two, and first-match order would
 * never let it be reached. Every entry holding that winning prefix comes back,
 * because a shared prefix is legitimate (see above).
 *
 * @returns {{ prefix: string, names: string[] } | null}
 */
export function prefixOwners(tel, list, getPrefixes = optionPrefixes) {
  const digits = telDigits(tel)
  if (!digits) return null
  let best = ''
  let hits = []
  for (const it of list ?? []) {
    const name = optionName(it).trim()
    if (!name) continue
    for (const prefix of getPrefixes(it)) {
      if (!PREFIX_RE.test(prefix) || !digits.startsWith(prefix)) continue
      if (prefix.length > best.length) {
        best = prefix
        hits = []
      }
      if (prefix.length === best.length && !hits.includes(name)) hits.push(name)
    }
  }
  return best ? { prefix: best, names: hits } : null
}

/**
 * The one entry a Tel number selects from a list, or '' when nothing claims it.
 * The first claimant wins a shared prefix — see the note above.
 *
 * A Model comes back without a Type, deliberately: the Type is already
 * auto-selected FROM the model by the MODEL_TYPE map the Model dropdown has
 * always used, so a number that names the model has said everything it needs
 * to. Returning a Type here would be a second, competing source for a field
 * that already has one.
 */
export function telPick(tel, list) {
  return prefixOwners(tel, list)?.names[0] ?? ''
}

/**
 * The one entry an ISSI selects, on the ISSI prefix list. telPick's twin, and
 * deliberately a separate function rather than a flag on it: the two read
 * different fields off the same entries, and a caller must say which number it
 * is holding — an ISSI matched against Tel prefixes would be silently wrong
 * rather than empty.
 */
export function issiPick(issi, list) {
  return prefixOwners(issi, list, optionIssiPrefixes)?.names[0] ?? ''
}

/** Index of prefix -> the names holding it, for Manage inputs' "who else uses
 *  this" hint. Built off the same accessors the matcher uses. */
export function prefixIndex(list, getPrefixes = optionPrefixes) {
  const index = {}
  for (const it of list ?? []) {
    const name = optionName(it).trim()
    if (!name) continue
    for (const prefix of getPrefixes(it)) {
      if (!index[prefix]) index[prefix] = []
      if (!index[prefix].includes(name)) index[prefix].push(name)
    }
  }
  return index
}

// ---------------------------------------------------------------------------
// "No activity today" — the ISSI 00
//
// A day on which nothing happened is still a day that has to be reported, and
// filing it means saying the same six things every time: a Model that is not a
// device, the OTHER type, a fault that is not a fault, no action, no company,
// and an Agency that is not an agency. Typing 00 into the ISSI says all of it
// at once.
//
// 00 rather than a button because it is where the technician's hands already
// are, and because it cannot collide with anything: an ISSI of exactly 00 is
// not a radio. It is matched EXACTLY, not as a prefix — 00 is nobody's leading
// digits, and PREFIX_RE would happily let a real number starting 00 through.
//
// What it selects is resolved against the LIVE lists rather than written out
// here, because these four are ordinary admin-managed options that any install
// may spell its own way ("Other/s:", "For Record Purpose Only."). A list that
// has no such option fills nothing for that field — better an empty dropdown
// the technician can see than a value stored behind a box that reads blank.
// ---------------------------------------------------------------------------

export const NO_ACTIVITY_ISSI = '00'

/** Whether an ISSI is the "nothing happened today" marker rather than a radio. */
export const isNoActivityIssi = (issi) => telDigits(issi) === NO_ACTIVITY_ISSI

// The issue text, which is written onto the fault row rather than picked from a
// dropdown — the Issue field is free text, so this one always has a value to
// give even where the option list has never heard of it.
export const NO_ACTIVITY_ISSUE = 'No Activity'

// Matched on the name with case and punctuation stripped, so "Other/s:",
// "OTHER" and "Others" are all the one type, and the trailing full stop on
// "For Record Purpose Only." is not something anyone has to type exactly.
const nameKey = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const NO_ACTIVITY_MATCH = {
  model: /^FORRECORDPURPOSE/,
  type: /^OTHER/,
  agency: /^NOACTIVITY/,
  issue: /^NOACTIVITY/,
}
const firstMatching = (list, re) => (list ?? []).map(optionName).find((n) => n && re.test(nameKey(n))) ?? ''

/**
 * Whether a Model is the record-purpose placeholder rather than a device.
 *
 * Read off the stored entry rather than off its ISSI: the number is what SETS
 * an entry up, but what it leaves behind is the model, and a report is rendered
 * from entries long after anyone typed into a field. It is also why this
 * matches the same way noActivityFill selects — one spelling rule, both ends.
 */
export const isNoActivityModel = (model) => NO_ACTIVITY_MATCH.model.test(nameKey(model))

/**
 * Whether a fault row's issue is the "no activity" one.
 *
 * The ISSI is one way to reach that row and typing the issue straight into the
 * field is another, so what makes a row mean "nothing was done" has to be the
 * row itself. Everything that follows from it — no action, quantity 0 — hangs
 * off this rather than off how the row came to be filled in.
 */
export const isNoActivityIssue = (issue) => NO_ACTIVITY_MATCH.issue.test(nameKey(issue))

/**
 * The entry an ISSI of 00 fills in: what each field becomes, resolved against
 * the live option lists. Empty string means "this list offers nothing for it" —
 * for Action and Company that is the answer itself, "— none —".
 *
 * The quantity is 0, alone among every row the app writes: nothing was done, so
 * there is no unit of anything to count. It is what keeps the record off the
 * totals — a 1 here would report a device maintained on a day nobody touched
 * one. Every other row is floored at 1 on submit; this is the exception.
 */
export function noActivityFill(options) {
  return {
    model: firstMatching(options?.models, NO_ACTIVITY_MATCH.model),
    type: firstMatching(options?.types, NO_ACTIVITY_MATCH.type),
    agency: firstMatching(options?.agencies, NO_ACTIVITY_MATCH.agency),
    issue: firstMatching(options?.issueTypes, NO_ACTIVITY_MATCH.issue) || NO_ACTIVITY_ISSUE,
    action: '',
    company: '',
    quantity: 0,
  }
}

// Category order + labels for the Manage Inputs panel.
export const CATEGORIES = [
  { key: 'technicians', label: 'Technicians' },
  { key: 'agencies', label: 'Agencies' },
  { key: 'types', label: 'Types' },
  { key: 'models', label: 'Models' },
  { key: 'issueTypes', label: 'Faulty / Parts' },
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
// Technicians
//
// A technician entry may be a plain string (legacy, name only) or
//   { name, id }
// where `id` is the numeric ID a technician types as the LAST token of a
// WhatsApp fault report to identify themselves (see server/src/whatsapp/decoder.js
// and codes.js parseCodeReport). Optional — a technician who never files by
// WhatsApp can be left without one.
//
// This is a second place an ID can be assigned: Code Map's own "Technician
// IDs" category is the older list the WhatsApp bot originally read. An ID set
// here OUTRANKS a same-numbered one there (mirrors how an Issue type's code
// outranks Code Map's parts+variant lookup) — see technicianCodes() in
// server/src/routes/codemap.js — so existing Code Map IDs keep working until
// moved here, and moving one here is a safe, incremental edit.
// ---------------------------------------------------------------------------

export const TECH_ID_RE = /^\d+$/
// Two separate letters-only namespaces from the numeric ID above: a 2-letter
// initial (e.g. "MA" for Muhammad Amir) and a 3-letter one (e.g. "MRA" with a
// middle initial). Independent fields — neither is derived from the other.
export const TECH_INITIALS2_RE = /^[A-Z]{2}$/i
export const TECH_INITIALS3_RE = /^[A-Z]{3}$/i
export const technicianName = (v) => (typeof v === 'string' ? v : String(v?.name ?? ''))
export const technicianId = (v) => (typeof v === 'string' ? '' : String(v?.id ?? ''))
export const technicianInitials2 = (v) => (typeof v === 'string' ? '' : String(v?.initials2 ?? ''))
export const technicianInitials3 = (v) => (typeof v === 'string' ? '' : String(v?.initials3 ?? ''))

/**
 * Map of technician ID/initials -> name, for publishing to the code map /
 * WhatsApp bot. A technician may claim a numeric ID, a 2-letter initial, a
 * 3-letter initial, any combination, or none — each claimed one is accepted
 * as the LAST token of a WhatsApp report. First claim in the list wins a
 * collision, matching faultCodes() (the three are disjoint by pattern, so
 * only same-kind collisions — e.g. two technicians both wanting "MA" — are
 * possible in practice).
 */
export function technicianIdMap(technicians) {
  const map = {}
  const rows = technicians ?? []
  for (const it of rows) {
    const id = technicianId(it).trim()
    const name = technicianName(it).trim()
    if (id && name && TECH_ID_RE.test(id) && !map[id]) map[id] = name
  }
  for (const it of rows) {
    const initials2 = technicianInitials2(it).trim().toUpperCase()
    const name = technicianName(it).trim()
    if (initials2 && name && TECH_INITIALS2_RE.test(initials2) && !map[initials2]) map[initials2] = name
  }
  for (const it of rows) {
    const initials3 = technicianInitials3(it).trim().toUpperCase()
    const name = technicianName(it).trim()
    if (initials3 && name && TECH_INITIALS3_RE.test(initials3) && !map[initials3]) map[initials3] = name
  }
  return map
}

// ---------------------------------------------------------------------------
// Issue types
//
// An issue type may be a plain string (legacy) or
//   { name, parts, variant }
// where `parts` is the 2-digit component number and `variant` the letter after
// it — together the fault code, e.g. 19 + B = 19B.
//
// NO device letter. The technician supplies that when reporting, and it points
// at the actual radio: H19B and T19B are the same fault on two different
// devices. Binding an issue type to one device would mean re-entering the same
// part once per radio, and every one of those rows could drift from the others.
//
// There is no separate description: for an issue type the description IS the
// name — "Fistmic" is both what the row describes and what gets written on the
// entry — so a second field could only ever disagree with the first.
//
// The variant letter is part of the part's identity here, not a build
// selector: 99A is the Charger-818 and 99B the Charger-DEY — two different
// chargers, not two builds of one.
// ---------------------------------------------------------------------------

export const PARTS_RE = /^\d{2}$/
export const VARIANT_RE = /^[A-Z]$/
const asObj = (v) => (typeof v === 'string' ? null : v)
const upTrim = (v) => String(v ?? '').trim().toUpperCase()

export const issueName = (v) => (typeof v === 'string' ? v : String(v?.name ?? ''))
// `base` is the superseded shape (a combined "43A" written alongside a device
// letter). Read it so rows saved by that version still resolve.
export const issueParts = (v) => upTrim(asObj(v)?.parts ?? upTrim(asObj(v)?.base).slice(0, 2))
export const issueVariant = (v) => upTrim(asObj(v)?.variant ?? upTrim(asObj(v)?.base).slice(2, 3))

/** The fault code, or '' when either half is missing — half a code is not a
 *  code, and must never be indexed as one. */
export function issueCode(v) {
  const parts = issueParts(v)
  const variant = issueVariant(v)
  return PARTS_RE.test(parts) && VARIANT_RE.test(variant) ? parts + variant : ''
}

/** Just the names, for the dropdowns and for matchOption. */
export const issueNames = (list) => (list ?? []).map(issueName).filter(Boolean)

/**
 * Index of fault code (parts + variant) -> issue name, for the decoder's
 * exact-code path. Keyed WITHOUT the device letter, so one entry covers the
 * same part on every radio.
 * First claim wins, so a duplicated code can never flip meaning by list order.
 * A nameless row is skipped: there would be nothing to decode the code TO.
 */
export function issueCodeIndex(list) {
  const index = {}
  for (const it of list ?? []) {
    const code = issueCode(it)
    const name = issueName(it).trim()
    if (code && name && !index[code]) index[code] = name
  }
  return index
}

// Actions the app itself reasons about, so they must exist whatever is stored.
// RTO drives the reference-only marking at save time (see savedReports.js); a
// stored `actions` list saved before RTO existed would otherwise hide it from
// every dropdown and the auto-detection could never fire.
const REQUIRED_ACTIONS = ['RTO']

// Actions that are WORK rather than a part. Nothing is consumed, so there is no
// part for a company to have supplied, and picking one of these auto-selects
// Company = "— none —" instead of carrying the last one over.
//
// Matched by name, uppercased, the same way REQUIRED_ACTIONS is. The RE- pair
// are the same job done a second time, so they are the same kind of thing.
//
// RTO is deliberately NOT here. It consumes no part either, but it already
// means something specific — the device went back untouched, which marks the
// whole report reference-only at save time (see savedReports.js) — and it was
// not among the actions asked for. Add it here if that turns out to be wanted.
export const SERVICE_ACTIONS = ['REPAIR', 'PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE']

/** Whether an action is work rather than a part — see SERVICE_ACTIONS. */
export const isServiceAction = (action) => SERVICE_ACTIONS.includes(String(action ?? '').trim().toUpperCase())

// Fault codes the shorthand is documented to understand, so a stored
// issueTypes list saved before they existed cannot make them undecodable.
// Re-added by CODE, not by name: an installation that already claims 50F for
// its own wording keeps that wording — the claim is what matters, not ours.
const REQUIRED_ISSUE_TYPES = [{ name: 'DEFECTIVE PCB', parts: '50', variant: 'F' }]

// The shipped prefixes of one category, keyed by name — read straight off the
// defaults above so there is only ever one place they are written down. The
// accessor says which of the two lists is being read.
const seedPrefixesOf = (list, get = optionPrefixes) =>
  Object.fromEntries(list.map((it) => [optionName(it).toUpperCase(), get(it)]).filter(([, p]) => p.length > 0))
const SEED_PREFIXES = {
  models: seedPrefixesOf(DEFAULT_OPTIONS.models),
  agencies: seedPrefixesOf(DEFAULT_OPTIONS.agencies),
}
const SEED_ISSI_PREFIXES = seedPrefixesOf(DEFAULT_OPTIONS.agencies, optionIssiPrefixes)

/**
 * Give a stored list the shipped prefixes it predates.
 *
 * Every install that has ever opened Manage inputs has saved these categories,
 * and a saved category fully replaces its default — so without this the
 * defaults above would reach nobody and the auto-select would be dead
 * everywhere it matters. Gap-filling only, on two rules:
 *
 *   - an entry that already carries prefixes keeps exactly what was set; an
 *     admin's mapping is never edited by an upgrade.
 *   - a prefix some OTHER stored entry already claims is skipped, so moving
 *     190 onto a different model is not undone by handing it back to STP9000.
 *
 * Claims are read from the stored list once, up front, rather than as the pass
 * goes: the three SRG3900 builds are each seeded 109 by name, and accumulating
 * would let whichever came first block the other two from the prefix they share.
 *
 * `get` and `field` say which of an entry's two prefix lists is being filled,
 * so the ISSI list is seeded by the same pass under the same two rules rather
 * than by a near-copy of it. The passes are independent: an agency that already
 * carries Tel prefixes can still be given the ISSI ones it predates.
 */
function withSeededPrefixes(list, seeds, get = optionPrefixes, field = 'prefixes') {
  const claimed = new Set(list.flatMap(get))
  return list.map((it) => {
    if (get(it).length > 0) return it
    const seed = (seeds[optionName(it).trim().toUpperCase()] ?? []).filter((p) => !claimed.has(p))
    if (!seed.length) return it
    return { ...(typeof it === 'string' ? {} : it), name: optionName(it), [field]: seed }
  })
}

// Merge stored lists over the defaults (a saved category fully replaces its
// default), then re-add anything the app itself depends on that is missing.
export function mergeOptions(stored) {
  const out = {}
  for (const { key } of CATEGORIES) {
    const list = Array.isArray(stored?.[key]) ? stored[key] : DEFAULT_OPTIONS[key]
    out[key] = [...list]
  }
  for (const action of REQUIRED_ACTIONS) {
    if (!out.actions.some((a) => String(a).trim().toUpperCase() === action)) out.actions.push(action)
  }
  const claimedCodes = issueCodeIndex(out.issueTypes)
  for (const it of REQUIRED_ISSUE_TYPES) {
    if (!claimedCodes[issueCode(it)]) out.issueTypes.push({ ...it })
  }
  out.models = withSeededPrefixes(out.models, SEED_PREFIXES.models)
  out.agencies = withSeededPrefixes(out.agencies, SEED_PREFIXES.agencies)
  out.agencies = withSeededPrefixes(out.agencies, SEED_ISSI_PREFIXES, optionIssiPrefixes, 'issiPrefixes')
  // Chart toggles are a plain object, not a category list.
  const storedCharts = stored?.charts && typeof stored.charts === 'object' ? stored.charts : {}
  out.charts = { ...DEFAULT_CHARTS, ...storedCharts }
  // Regions are a plain object (region name -> branch list), not a category list.
  const storedRegions = stored?.regions && typeof stored.regions === 'object' ? stored.regions : {}
  out.regions = { ...DEFAULT_OPTIONS.regions, ...storedRegions }
  return out
}
