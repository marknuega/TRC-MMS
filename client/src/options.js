// Default dropdown option lists, seeded from the MOTECO / TRC defaults.
// At runtime these are merged with the user-managed lists saved via /api/options,
// so the Manage Inputs panel can add / edit / delete any of them.

export const DEFAULT_OPTIONS = {
  technicians: ['AMIR', 'M. RASHEED', 'RASHEEDULLAH', 'IMRAN', 'BAGHDAD', 'MAROOF'],

  // `issiPrefixes` are the leading digits of an ISSI that belong to this agency,
  // so typing the number picks it (see issiPick). Agencies answer to the ISSI
  // and to nothing else — a Tel number names the device, never whose it is.
  agencies: [
    { name: 'PSD', issiPrefixes: ['180'] },
    { name: 'CD', issiPrefixes: ['191'] },
    'DOT',
    'BG',
    'PASS',
    // 191 is deliberately claimed by CD as well. Two agencies may hold one
    // prefix (see the note under PREFIX_RE); CD is higher in this list, so an
    // ISSI starting 191 selects CD and PRI stays one dropdown away. Move PRI
    // above CD in Manage inputs to reverse that.
    { name: 'PRI', issiPrefixes: ['191'] },
    'FSF',
    'SSF',
    'TA',
    'KFSC',
    'VIP',
    'MJ',
    'NA',
    'GIP',
    'GDCSS',
    'NIC',
    'AVS',
    'RA',
    'SFH',
    'SA',
    'AFW',
    'MOH',
    'IS',
    'EMH',
    { name: 'SRCA', issiPrefixes: ['214'] },
    'GPH',
    'MOD',
    'NG',
    'GSA',
    'PSS',
    'MEWA',
    'TM',
    'Kingdom',
    'MOF',
    'MOMRA',
    'MCIT',
    'NCA',
    'MEIM',
    'MEDIA',
    'CAI',
    'MCI',
    'SFES',
    'SFSP',
    'GACA',
    'CC',
    'MOFA',
    'SFOC',
    'SPL',
    // The agency a "no activity today" entry is filed under — see NO_ACTIVITY_ISSI.
    'No Activity',
  ],

  types: ['SEPURA', 'AIRBUS', 'HYTERA', 'OTHER'],

  // `prefixes` are the leading digits of a Tel number that belong to this
  // model, so typing the number picks the model (see modelsForTel below).
  //
  // `standIn` is the shorthand those numbers are TYPED as and `standInReal` the
  // prefix each is stored as: 103332645500 selects the car kit and the record
  // holds 109332645500, the number really on the radio (see the stand-in
  // section below). Every stand-in is listed as a Tel prefix too, because the
  // swap and the auto-select are two different lists and a shorthand that
  // selected nothing would be half a rule.
  models: [
    // 01 is the shorthand for the 35506 range, 09 for 20106, 08 for 7506 —
    // five digits of the same thing on every entry, typed as two.
    //
    // `letter` is the device letter this model is written by, and it works as a
    // stand-in of its own: H is TH1N and stands for 35506 exactly as 01 does.
    // It is the shorthand a technician already knows, because it is the letter
    // in front of every CDS code they send — so H, R, M, T are one keystroke
    // each and need nothing memorised that is not memorised already.
    //
    // The code map's equipmentCodes is the authority on what a letter means in
    // a CODE; this is the same letter offered in the Tel field, stored on the
    // row so the server's save-time swap reads it from the option list like
    // every other prefix rule rather than needing the map threaded in.
    { name: 'TH1N', letter: 'H', prefixes: ['355', '06', '01'], standIn: ['01'], standInReal: '35506' },
    { name: 'THR9', letter: 'R', prefixes: ['20106', '09'], standIn: ['09'], standInReal: '20106' },
    { name: 'TMR880i', letter: 'M', prefixes: ['7506', '08'], standIn: ['08'], standInReal: '7506' },
    { name: 'STP9000', letter: 'T', prefixes: ['190'] },
    // 109 is the number really on all three SRG3900 builds, so no Tel number
    // says which one is on the bench and the auto-select leads with the car kit
    // — first in this list, and list order is where that is decided. Each build
    // takes shorthand of its own to be picked by instead: 102 or 02 the bike,
    // 103 or 03 the car kit, 104 or 04 the desktop, each swapped back for the
    // 109 when the entry is saved.
    { name: 'SRG3900 CARKIT', letter: 'C', prefixes: ['109', '103', '03'], standIn: ['103', '03'], standInReal: '109' },
    {
      name: 'SRG3900 DESKTOP',
      letter: 'D',
      prefixes: ['109', '104', '04'],
      standIn: ['104', '04'],
      standInReal: '109',
    },
    { name: 'SRG3900 BIKE', letter: 'B', prefixes: ['109', '102', '02'], standIn: ['102', '02'], standInReal: '109' },
    // Letter only: these carry no shipped Tel range, and the ones an install has
    // are its admin's own. The letter is not a range — it is the same character
    // already written in front of every CDS code — so it ships for every model.
    { name: 'PT580H', letter: 'E' },
    { name: 'PT590', letter: 'N' },
    { name: 'MT680', letter: 'S' },
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
    'A COVER',
    'ANTENNA',
    'ANTENNA BASE',
    'ANTENNA CABLE',
    'ANTENNA STICK',
    'B COVER',
    'BATTERY 1590',
    'BATTERY 1880',
    'BATTERY 3180',
    'BATTERY CONNECTOR',
    'BELT CLIP',
    'CAPACITOR',
    'CHARGER',
    'DESK MIC',
    'DIODE',
    'DV15 CONNECTOR',
    'FIST MIC',
    'HAND MICRO LOUD SPEAKER',
    'HANDSET',
    'HANDSET BASE',
    'I/O PORT',
    'KEYMATE',
    'INDUCTOR',
    'LCD',
    'LCD BASE',
    'LCD CABLE',
    'LEATHER CASE',
    'MIC',
    'MIC BOTTOM',
    'MIC TOP',
    'NO TRANSMIT MODE',
    'NOT AVAILABLE',
    'POWER',
    'POWER SUPPLY',
    'PROGRAM ISSUE',
    'PTT',
    'RESISTOR',
    'ROT KNOB',
    'ROT SWITCH',
    'SIDE GRIP',
    'SIDE GRIP 3D',
    'SIGNAL',
    'SPEAKER BASE',
    'SPEAKER HIGH',
    'SPEAKER LOUD',
    'SPEAKER LOW',
    'SPEAKER MID',
    'TEMPORARY DISABLED',
    'TOP BOARD',
    'UI FRAME',
  ],

  // The report engine knows the codes for these built-ins (C/R/N/PCB/P/RP/I/RI/D).
  // Adding a custom action is fine — it just prints its own name as the code.
  // RTO (Return to Owner) means the device went back untouched; saving a report
  // that contains one auto-marks it reference-only (see savedReports.js).
  actions: ['CHANGE', 'REPAIR', 'NEW', 'PCB', 'PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE', 'RTO'],

  // The report engine knows the display codes for these (MOT (P2), MOI, ...).
  // Each entry is a plain string, or { name, code } where `code` is the SKU
  // prefix that company's stock is shelved under (MOT, X1, X2). The code is
  // what routes a fault to the right company's shelf when stock is drawn —
  // see client/src/company.js. Left off, the company simply is not narrowed,
  // exactly as before the field existed.
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
  TMR880I: 'AIRBUS',
  STP9000: 'SEPURA',
  'SRG3900 CARKIT': 'SEPURA',
  'SRG3900 DESKTOP': 'SEPURA',
  'SRG3900 BIKE': 'SEPURA',
  PT580H: 'HYTERA',
  PT590: 'HYTERA',
  MT680: 'HYTERA',
}

/**
 * The Type a model belongs to — the lookup MODEL_TYPE is FOR.
 *
 * Through modelKey, so an entry stored under an older spelling of the name
 * ("TMR 880i", before the list settled on "TMR880i") still answers AIRBUS. A
 * bare MODEL_TYPE[up(model)] would have quietly stopped naming a type the day
 * the model was renamed, and the Type field would have gone blank on exactly
 * the devices with the longest history.
 */
// Built on first use, not at module load: modelKey is declared further down
// this file, and a map built up here would read it before it exists.
let keyedTypes = null
export const typeForModel = (model) => {
  keyedTypes ??= new Map(Object.entries(MODEL_TYPE).map(([m, t]) => [modelKey(m), t]))
  return keyedTypes.get(modelKey(model)) ?? ''
}

// ---------------------------------------------------------------------------
// Prefixes — the leading digits of a number that name one option
//
// Each of the two numbers on an entry answers exactly one question, and each
// answer has its own list:
//
//   Tel number  -> Model      `prefixes`      (this section)
//   ISSI        -> Agency     `issiPrefixes`  (the next one)
//   Model       -> Type       MODEL_TYPE, above
//
// One number, one field, one source. A Tel number says WHAT the device is and
// says nothing about whose it is; an ISSI says whose and nothing about what.
// The Type is not read from either — it follows from the Model, as it always
// has, so the chain is Tel -> Model -> Type rather than two numbers arguing
// over one field. Anything that reads a second field off a number is a second
// source for something that already has one, and that is how two dropdowns
// start disagreeing.
//
// A models entry may be a plain string (legacy, name only) or
//   { name, prefixes: ['355', '06'] }
// where each prefix is a run of the number's leading digits that belongs to
// that name: 190 is an STP9000, 355 or 06 a TH1N. Typing the number then
// selects it, so what the number already states is not stated again by hand.
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
/**
 * A device letter used as a Tel prefix — H for a TH1N, T for an STP9000.
 *
 * One character, and only ever the FIRST: it is the letter the technician
 * already writes in front of a CDS code, offered in the Tel field so the
 * device can be selected with a single keystroke. A letter anywhere else in a
 * Tel number is not a prefix, it is a typo.
 */
export const LETTER_PREFIX_RE = /^[A-Z]$/
export const optionName = (v) => (typeof v === 'string' ? v : String(v?.name ?? ''))

/**
 * The device letter a model is written by, or ''.
 *
 * Mirrors equipmentCodes in the code map, which stays the authority on what a
 * letter means inside a CODE. It is repeated on the model row because the Tel
 * rules are read from the option list alone — by the entry form AND by the
 * server at save time (reportEntry.js) — and threading the map through both
 * for one character would put a second argument on every one of them.
 */
export const optionLetter = (v) => {
  const l =
    typeof v === 'string'
      ? ''
      : String(v?.letter ?? '')
          .trim()
          .toUpperCase()
  return LETTER_PREFIX_RE.test(l) ? l : ''
}

const digitPrefixes = (v) => (Array.isArray(v) ? v : []).map((p) => String(p).replace(/\D/g, '')).filter(Boolean)

/**
 * A Tel number reduced to what a prefix is matched against: an optional leading
 * device LETTER, then digits.
 *
 * telDigits drops everything that is not a digit, which is right for a stored
 * number and wrong here — it would throw away the one character that says which
 * device this is. Only a leading letter survives, and only one: "H3326" is a
 * TH1N, while a letter in the middle of a number is a mistake and is dropped as
 * it always was.
 */
export const telKey = (tel) => {
  const s = String(tel ?? '')
    .trim()
    .toUpperCase()
  const lead = /^([A-Z])/.exec(s)
  return lead ? lead[1] + s.slice(1).replace(/\D/g, '') : s.replace(/\D/g, '')
}

/** The Tel ranges an admin listed for this entry. Digits, and only digits —
 *  the device letter is a separate thing with a separate source, and it is
 *  added by modelTelPrefixes below, where it is actually matched. */
export const optionPrefixes = (v) => (typeof v === 'string' ? [] : digitPrefixes(v?.prefixes))

/**
 * What the TEL FIELD matches a model on: its listed ranges, and its device
 * letter in front of them.
 *
 * Separate from optionPrefixes because they answer different questions.
 * optionPrefixes is the admin's mapping — what the Manage inputs row says, what
 * prefixShareHint warns about, what the seeding pass writes. This is the wider
 * set the entry form selects against, and the letter belongs only here: it is
 * not a range anybody assigned, it cannot clash with another range, and it must
 * not appear in a row's prefix list as though it had been typed there.
 *
 * Not used for agencies. An ISSI names whose radio it is rather than which
 * device, so a device letter has nothing to say about one.
 */
export const modelTelPrefixes = (v) => {
  const letter = optionLetter(v)
  return letter ? [letter, ...optionPrefixes(v)] : optionPrefixes(v)
}

// ---------------------------------------------------------------------------
// ISSI prefixes — the agency's own list, read off the OTHER number
//
// Agencies carry `issiPrefixes: ['180']` and nothing else: the ISSI is the
// number that says whose radio it is, and it is the only one that does. An
// agency's Tel prefixes were removed rather than left inert — a field that is
// still shown and still saved but no longer selects anything is worse than one
// that is gone, because it looks like it works.
//
// The two lists are read against their own number and never compared: 180
// meaning the PSD here says nothing about what 180 means among the models, so
// neither list has to reserve digits the other is using. Everything below is
// shared with the Tel matcher, because the RULES are the same — longest match
// wins, a prefix may be shared, list order breaks the tie. Only which number is
// held against which list differs.
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

/** A Tel number or ISSI as bare digits — what a prefix is compared against, so
 *  the spacing or punctuation someone types into the field cannot defeat a
 *  match. Named for the Tel field it was written for; both numbers use it. */
export const telDigits = (tel) => String(tel ?? '').replace(/\D/g, '')

/**
 * The entries of one list whose prefix a number's leading digits match, or
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
  // telKey rather than telDigits: a leading device letter IS a prefix now, and
  // stripping it would throw away the character being matched on.
  const key = telKey(tel)
  if (!key) return null
  let best = ''
  let hits = []
  for (const it of list ?? []) {
    const name = optionName(it).trim()
    if (!name) continue
    for (const prefix of getPrefixes(it)) {
      if (!(PREFIX_RE.test(prefix) || LETTER_PREFIX_RE.test(prefix)) || !key.startsWith(prefix)) continue
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
 * The Model a Tel number selects, or '' when nothing claims it. The first
 * claimant wins a shared prefix — see the note above.
 *
 * The MODEL, and nothing else. A Tel number says what the device is; whose it
 * is comes off the ISSI (issiPick) and the Type off the model, so this answers
 * one question and leaves the other two to the one source each already has.
 * Reading a second field here would be exactly the competing source that makes
 * two dropdowns disagree.
 */
export function telPick(tel, list) {
  return prefixOwners(tel, list, modelTelPrefixes)?.names[0] ?? ''
}

/**
 * A Tel number with its leading `from` prefix swapped for `to`, or unchanged
 * when it does not start with `from`.
 *
 * Rewritten in place rather than rebuilt from digits: the record holds the
 * number as it was TYPED (see displayNumber in report.js), so whatever spacing
 * someone used survives and only the leading run of digits is touched. Finding
 * the first digit rather than assuming position 0 also means a blank number and
 * the '-' a blank one is stored as fall straight through.
 *
 * The one thing that swaps a prefix is the stand-in rule below, so what a swap
 * does to the spacing someone typed is settled here and in one place.
 */
export function replaceTelPrefix(tel, from, to) {
  const raw = String(tel ?? '')
  // The first digit OR letter: a stand-in may be the device letter now, and
  // looking only for a digit would skip straight past the H in "H332645500"
  // and try to match the prefix against the number behind it.
  const at = raw.search(/[0-9A-Za-z]/)
  if (at < 0 || !from) return raw
  const rest = raw.slice(at)
  // Case-insensitively, because the letter is typed by a person and "h" is the
  // same device as "H" — the digits either side are unaffected either way.
  if (!rest.toUpperCase().startsWith(from.toUpperCase())) return raw
  return raw.slice(0, at) + to + rest.slice(from.length)
}

// ---------------------------------------------------------------------------
// Stand-in Tel prefixes — the shorthand a number is typed as
//
// The number on the radio is not always the number worth typing. 109 is the
// SRG3900 car kit, the desktop AND the bike, so no Tel number can say which is
// on the bench and the auto-select lands on whichever is listed first; 35506 is
// five digits of the same thing on every TH1N entry.
//
// A model may take stand-ins for that: prefixes typed in place of the real one
// and swapped back for it at the moment the entry is saved. Type 103332645500
// and the car kit is selected with no argument with the dropdown afterwards,
// while 109332645500 — the number really on the radio — is what gets stored.
//
// Several stand-ins, one real prefix. 102 and 02 are one rule written twice,
// and a model that answers to both should not need two rows to say so. What
// they stand for is single because the point of the whole rule is the ONE
// number the radio really carries.
//
// A stand-in is a fiction of the entry form. The record holds the real number,
// so every report, search and export downstream sees one numbering rather than
// two — which is also why the swap runs at the save (see telForModel) and not
// as the field is typed: the form still needs the shorthand to select the Model.
//
// Gated on the Model, and only the model that declares it. The same digits
// typed against another model are somebody's real number and are stored as
// typed: a stand-in means "this is that device" or it means nothing at all, and
// a blanket rewrite would quietly edit numbers nobody asked it to.
//
// Two stored fields rather than one, because the real prefix cannot be
// inferred: a model may hold several Tel prefixes (TH1N holds 355 and 06) and
// there is no non-arbitrary way to pick which of them a stand-in stands for.
// Written out, the whole rule is on the row an admin is reading.
// ---------------------------------------------------------------------------

/** The prefixes that are TYPED to select this model but never stored. A list:
 *  102 and 02 are one rule written twice. A lone string counts as a list of
 *  one, which is how a stand-in saved before the field took several reads. */
export const optionStandIns = (v) =>
  typeof v === 'string' ? [] : digitPrefixes(Array.isArray(v?.standIn) ? v.standIn : [v?.standIn])

/** The prefix a stand-in is stored AS — the one really on the radio. */
export const optionStandInReal = (v) => (typeof v === 'string' ? '' : String(v?.standInReal ?? '').replace(/\D/g, ''))

/**
 * This model's usable stand-in rules as [{ standIn, real }], longest stand-in
 * first — the same "most specific wins" prefixOwners applies, so 102 is still
 * reached on a model that also holds 10.
 *
 * Half a rule does nothing, so half a rule is no rule: a stand-in with nothing
 * to be stored as, or a "stored as" that nothing is typed for, drops out here
 * rather than being carried around as something that might swap. It is the call
 * codeProblem makes about a parts code with no variant. A stand-in equal to the
 * real prefix would rewrite a number to itself, and goes the same way.
 */
export function optionStandInRules(v) {
  // A model may hold a letter without ever having been given a "stored as"
  // prefix — STP9000 has one Tel prefix, 190, and needed no shorthand before
  // the letter existed. Its single prefix is then unambiguously what T stands
  // for. This fallback is used ONLY for that case: where an admin has written a
  // standInReal, that is the answer, and where a model holds several prefixes
  // there is no non-arbitrary choice to make and the letter swaps nothing.
  const declared = optionStandInReal(v)
  const prefixes = optionPrefixes(v)
  const real = declared || (prefixes.length === 1 ? prefixes[0] : '')
  if (!real) return []
  // The device letter stands in for the same real prefix the digits do: H is
  // typed and 35506 is stored, exactly as 01 is. It is added here rather than
  // to optionStandIns because that reader is the row AS STORED — what an admin
  // typed and what the seeding pass writes — and the letter was never typed.
  const letter = optionLetter(v)
  const all = letter ? [letter, ...optionStandIns(v)] : optionStandIns(v)
  return all
    .filter((standIn) => standIn !== real)
    .sort((a, b) => b.length - a.length)
    .map((standIn) => ({ standIn, real }))
}

/**
 * The Tel number as it should be STORED for `model` — the stand-in it begins
 * with swapped for the real prefix, or the number untouched when no stand-in
 * applies.
 *
 * Reads the live models list, so a stand-in added in Manage inputs takes effect
 * without a release and a device that never needed one is unaffected. Matching
 * the model by name is the same thing MODEL_TYPE does, past case and padding.
 *
 * Rewrites in place rather than rebuilding from digits: the record holds the
 * number as it was TYPED (see displayNumber in report.js), so whatever spacing
 * someone used survives and only the leading run of digits is touched.
 *
 * The first stand-in the number actually starts with wins, longest first: one
 * swap, never the swap of a swap.
 *
 * Called at the save boundary, not as the field is typed — the form still needs
 * the stand-in to select the Model with.
 */
export function telForModel(tel, model, models) {
  const raw = String(tel ?? '')
  const want = String(model ?? '')
    .trim()
    .toUpperCase()
  if (!want) return raw
  const it = (models ?? []).find((m) => optionName(m).trim().toUpperCase() === want)
  for (const { standIn, real } of optionStandInRules(it)) {
    const swapped = replaceTelPrefix(raw, standIn, real)
    if (swapped !== raw) return swapped
  }
  return raw
}

// ---------------------------------------------------------------------------
// Teaching the ISSI auto-select a range it has never seen
//
// An ISSI whose leading digits no agency claims selects nothing, so whoever
// typed it picked the agency by hand — and the next number of that same range
// will make them pick again. The pair they just entered is the mapping, so the
// entry form offers to keep it.
//
// An OFFER, not an automatic write. The agency lists are admin-managed, and a
// prefix that appeared because somebody saved an entry is a mapping nobody
// chose — it would start selecting agencies for everyone, out of one person's
// typing. Deciding is one click; undoing an unnoticed write is a hunt through
// Manage inputs.
//
// Offered only when the range is genuinely unclaimed. An ISSI that already
// selects the WRONG agency is a different question — the answer there is to
// move the prefix, which is an admin's call and belongs in Manage inputs.
// ---------------------------------------------------------------------------

/** Digits of an ISSI prefix to offer. Three, matching the shipped 180/191/214. */
const ISSI_OFFER_LEN = 3

/**
 * The { prefix, agency } worth offering to wire up, or null when there is
 * nothing to offer: too few digits, no agency, the no-activity ISSI, an agency
 * the list has never heard of, or a range something already claims.
 */
export function issiWireOffer(issi, agency, agencies) {
  const digits = telDigits(issi)
  const name = String(agency ?? '').trim()
  if (digits.length < ISSI_OFFER_LEN || !name) return null
  // 00 is not an agency range — it is the whole of "nothing happened today".
  if (isNoActivityIssi(issi) || isNoActivityAgency(name)) return null
  const known = (agencies ?? []).some((a) => optionName(a).trim().toUpperCase() === name.toUpperCase())
  if (!known) return null
  if (prefixOwners(digits, agencies, optionIssiPrefixes)) return null
  return { prefix: digits.slice(0, ISSI_OFFER_LEN), agency: name }
}

/**
 * The agencies list with `prefix` added to `agency`'s ISSI prefixes — what the
 * offer above writes when it is taken up. Everything else is left exactly as it
 * was, including an agency that already holds the prefix.
 */
export function withIssiPrefix(agencies, agency, prefix) {
  const want = String(agency ?? '')
    .trim()
    .toUpperCase()
  const p = String(prefix ?? '').replace(/\D/g, '')
  if (!want || !PREFIX_RE.test(p)) return agencies ?? []
  return (agencies ?? []).map((a) => {
    if (optionName(a).trim().toUpperCase() !== want) return a
    const have = optionIssiPrefixes(a)
    if (have.includes(p)) return a
    return { ...(typeof a === 'string' ? {} : a), name: optionName(a), issiPrefixes: [...have, p] }
  })
}

/**
 * The Agency an ISSI selects, on the ISSI prefix list. telPick's twin, and
 * deliberately a separate function rather than a flag on it: the two read
 * different fields off different lists, and a caller must say which number it
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
const nameKey = (v) =>
  String(v ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
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
 * Whether an agency name is the "no activity" one rather than a real agency.
 *
 * Its twin above, for the field the ISSI fills in alongside them. Nothing about
 * a day nobody worked is a range of numbers, so it is what issiWireOffer checks
 * before offering to wire an ISSI up to it.
 */
export const isNoActivityAgency = (agency) => NO_ACTIVITY_MATCH.agency.test(nameKey(agency))

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

// A companies item may be a plain string (legacy) or { name, code }. Defined in
// company.js because the server resolves stock through the same helpers, and
// re-exported here so the option lists are all reached the one way.
export { companyName, companyCode, companyCodeMap, normalizeCompany } from './company.js'

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
// selector: 99A is the charger that ships with the radio and 99B the spare
// desk charger — two different chargers, not two builds of one.
//
// But WHICH charger that is depends on the radio. 99A is the ACP-12 on a TH1N
// and a THR9, and the Charger818 on an STP9000: one slot in the vocabulary,
// three devices, two physical parts. So a coded row may carry `names`, a
// per-device override:
//
//   { name: 'ACP-12', parts: '99', variant: 'A',
//     models: ['TH1N', 'THR9', 'STP9000'],
//     names:  { STP9000: 'Charger818' } }
//
// `name` stays the row's own name and the answer for every device without an
// override, so a row that has never needed one is byte-for-byte what it always
// was. Only the exceptions are stored, which is also what keeps the list
// readable: a part called the same thing everywhere says so by staying silent.
// ---------------------------------------------------------------------------

export const PARTS_RE = /^\d{2}$/
export const VARIANT_RE = /^[A-Z]$/
const asObj = (v) => (typeof v === 'string' ? null : v)
const upTrim = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()

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

/**
 * The models a part can appear on, or [] for one that appears on all of them.
 *
 * A parts code still means the same component on every radio — the claim is
 * keyed without a device and the WhatsApp decoder reads it that way. This says
 * something different and narrower: whether that component EXISTS on a given
 * device. A Charger-DEY is a real part with a real code, and a TH1n has never
 * had one, so offering it under a TH1n is offering a fault nobody can file.
 *
 * Empty is "every model", so a part nobody has narrowed keeps behaving exactly
 * as it did before this field existed — which is all of them today.
 */
export const issueModels = (v) => {
  const raw = asObj(v)?.models
  return Array.isArray(raw) ? raw.map((m) => String(m ?? '').trim()).filter(Boolean) : []
}

/**
 * Whether a part has been narrowed at all — whether somebody has answered the
 * question, rather than what the answer was.
 *
 * The list being ABSENT is "every device", the state every part starts in. The
 * list being EMPTY is "no device", which is a different thing: someone cleared
 * the row, usually on the way to ticking the two devices the part is really
 * on. Reading both as an empty array would make the second one silently mean
 * the first, and a part cleared to none would go on being offered everywhere.
 */
export const issueNarrowed = (v) => Array.isArray(asObj(v)?.models)

/**
 * The key two model names are compared by. Case and punctuation carry no
 * meaning between them — "TMR 880i", "TMR880I" and "tmr-880i" are the one
 * device, and so are "TH1N Carkit" and "TH1N CAR KIT".
 *
 * Exported because a model name is written down in more places than this file:
 * an entry saved last year holds the spelling of the day, the report engine
 * carries a fixed column layout and a fixed sort order, and Manage Inputs can
 * rename the model under all of them. Matching on this key is what lets the
 * name be renamed without a single stored record going unrecognised.
 */
export const modelKey = (v) => upTrim(v).replace(/[^A-Z0-9]/g, '')

/**
 * The per-device name overrides, as stored: { <model name>: <part name> }.
 *
 * Keyed by the model's own name rather than a normalised key so the stored
 * JSON stays readable by a person — matching is done through modelKey below,
 * which is what makes "TMR 880i" and "TMR880I" the one device anyway.
 */
export const issueNameOverrides = (v) => {
  const raw = asObj(v)?.names
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [model, name] of Object.entries(raw)) {
    const m = String(model ?? '').trim()
    const n = String(name ?? '').trim()
    if (m && n) out[m] = n
  }
  return out
}

/**
 * What this part is CALLED on a given device.
 *
 * Falls back to the row's own name, which is the answer for every device
 * nobody has overridden — and for every row saved before overrides existed.
 * With no device asked about there is nothing to override against, so the
 * row's own name is again the answer.
 */
export function issueNameForModel(v, model) {
  const want = modelKey(model)
  if (want) {
    for (const [m, name] of Object.entries(issueNameOverrides(v))) {
      if (modelKey(m) === want) return name
    }
  }
  return issueName(v)
}

/**
 * Every name this one row answers to — its own, plus each override.
 *
 * Used where a name has to be resolved back to its code without knowing which
 * device it came off: a fault stores the NAME it was written by, and
 * "Charger818" has to find 99A the same way "ACP-12" does. Deduped past case
 * and punctuation, so a row whose override merely re-spells its own name does
 * not answer twice.
 */
export function issueAllNames(v) {
  const out = []
  const seen = new Set()
  for (const n of [issueName(v), ...Object.values(issueNameOverrides(v))]) {
    const name = String(n ?? '').trim()
    const key = upTrim(name).replace(/[^A-Z0-9]/g, '')
    if (name && !seen.has(key)) {
      seen.add(key)
      out.push(name)
    }
  }
  return out
}

/**
 * A row with one device's name changed. An override equal to the row's own
 * name, or blank, is REMOVED rather than stored: the row already says that,
 * and a stored duplicate is a second copy to drift out of step with the first.
 */
export function withIssueName(v, model, name) {
  const base = asObj(v) ? { ...v } : { name: String(v ?? '') }
  const want = modelKey(model)
  if (!want) return base
  const next = {}
  for (const [m, n] of Object.entries(issueNameOverrides(v))) {
    if (modelKey(m) !== want) next[m] = n
  }
  const clean = String(name ?? '').trim()
  if (clean && modelKey(clean) !== modelKey(issueName(v))) next[String(model).trim()] = clean
  if (Object.keys(next).length) base.names = next
  else delete base.names
  return base
}

/**
 * Whether a part may be offered for a model. A part that names no models is
 * offered for every one of them; so is any part when no model is chosen yet,
 * because there is nothing yet to narrow against.
 */
export function issueFitsModel(v, model) {
  if (!issueNarrowed(v)) return true // nobody has narrowed it — every device
  const want = modelKey(model)
  if (!want) return true // no device chosen, so nothing to narrow against
  return issueModels(v).some((m) => modelKey(m) === want)
}

/**
 * Whether two rows could both be the answer for one and the same device.
 *
 * This is what decides whether two rows may share a fault code. A code is
 * resolved by parts + variant AND the device letter in front of it, so 44A can
 * be Battery 1590 on a TH1n and Battery 1880 on an STP9000 — two genuinely
 * different batteries, two claims, one code. What it can NOT be is two things
 * on the same radio: H44A must have exactly one answer.
 *
 * An un-narrowed row covers every device (that is what un-narrowed means), so
 * it overlaps anything that covers at least one. A row narrowed to NO device
 * covers nothing and so overlaps nothing — an empty list is a real state here
 * (see issueNarrowed), usually a row on its way to being ticked.
 */
export function issueModelsOverlap(a, b) {
  const an = issueNarrowed(a)
  const bn = issueNarrowed(b)
  if (!an && !bn) return true
  if (!an) return issueModels(b).length > 0
  if (!bn) return issueModels(a).length > 0
  const set = new Set(issueModels(b).map(modelKey))
  return issueModels(a).some((m) => set.has(modelKey(m)))
}

/**
 * Every row claiming one fault code, in list order.
 *
 * More than one is legal now, and normal: the claims are kept apart by the
 * devices they are narrowed to (issueModelsOverlap is what guarantees they do
 * not collide). Callers that need ONE answer must say which device they are
 * asking about.
 */
export const issueClaimants = (list, code) =>
  code ? (list ?? []).filter((it) => issueCode(it) === code && issueName(it).trim()) : []

/**
 * What a fault code means ON A GIVEN MODEL — the row, or null.
 *
 * With no model named there is nothing to narrow against, so this answers only
 * when the code is undisputed; a contested code genuinely has no device-free
 * answer, and guessing one is how a TH1n battery gets filed against an STP9000.
 */
export function issueClaimFor(list, code, model) {
  const claimants = issueClaimants(list, code)
  if (!modelKey(model)) return claimants.length === 1 ? claimants[0] : null
  return claimants.find((it) => issueFitsModel(it, model)) ?? null
}

/**
 * Whether a part is OFFERED in the ISSUE menu for the model in hand.
 *
 * Two things narrow the menu and they are not equal in authority.
 *
 * `issueFitsModel` is a STATEMENT: somebody listed this part's devices in
 * Manage inputs, and a device off that list does not get it. That always wins.
 *
 * `elsewhere` — the caller's stockedElsewhere answer — is an INFERENCE: this
 * part is only stocked under C, so it is probably the Carkit's. Right for the
 * great majority of the store, which nobody has said anything about, and the
 * only thing narrowing it at all.
 *
 * So the inference only speaks where nobody has. An Antenna With Cable listing
 * SRG Carkit, Desktop, Bike and TH1N Carkit is one part serving four devices
 * out of one box; inferring from the single shelf it sits on that it belongs
 * to that device alone contradicts the person who listed them, and hid it from
 * three of the four.
 *
 * @param v         the issue type
 * @param model     the model on the bench
 * @param elsewhere whether the shelf inference says this belongs to another device
 */
export function issueOffered(v, model, elsewhere = false) {
  if (!issueFitsModel(v, model)) return false
  return issueNarrowed(v) || !elsewhere
}

/** Just the names, for the dropdowns and for matchOption. */
export const issueNames = (list) => (list ?? []).map(issueName).filter(Boolean)

/**
 * Index of fault code (parts + variant) -> issue name: which codes are spoken
 * for, and by what.
 *
 * Keyed WITHOUT the device letter, so it answers "is 44A claimed at all" — the
 * question mergeOptions and the inventory form actually ask. It is NOT the
 * decoder's index any more: a code may now be claimed once per device (44A is
 * Battery 1590 on a TH1n and Battery 1880 on an STP9000), and a decode has a
 * device letter to resolve with. That lives in claimIndex (pairCode.js), which
 * is the only place a fault code is turned into a name.
 *
 * First claim wins here, so a contested code can never flip meaning by list
 * order. A nameless row is skipped: there would be nothing to decode the code
 * TO.
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
// RTO is here, and it is the clearest case of the lot: the device went back to
// its owner untouched, so not only was no part fitted, nothing was done at all.
// It was held out at first only because it had not been asked for — it already
// carries its own separate meaning, marking the whole report reference-only at
// save time (see savedReports.js), and that is unaffected: isRtoAction is what
// drives it, and this list is read in exactly one place, the Company
// auto-select. Nothing else changes by RTO being named here.
// INSTALLATION/RE-INSTALLATION included alongside INSTALL/RE-INSTALL: Manage
// inputs lets an admin rename the Actions list, and "Installation" is a
// renaming of the same action, not a different one.
export const SERVICE_ACTIONS = [
  'RTO',
  'REPAIR',
  'PROGRAM',
  'RE-PROGRAM',
  'INSTALL',
  'INSTALLATION',
  'RE-INSTALL',
  'RE-INSTALLATION',
  'DISMANTLE',
]

/** Whether an action is work rather than a part — see SERVICE_ACTIONS. */
export const isServiceAction = (action) =>
  SERVICE_ACTIONS.includes(
    String(action ?? '')
      .trim()
      .toUpperCase(),
  )

// Fault codes the shorthand is documented to understand, so a stored
// issueTypes list saved before they existed cannot make them undecodable.
// Re-added by CODE, not by name: an installation that already claims 50F for
// its own wording keeps that wording — the claim is what matters, not ours.
const REQUIRED_ISSUE_TYPES = [{ name: 'DEFECTIVE PCB', parts: '50', variant: 'F' }]

// The shipped prefixes of one category, keyed by name — read straight off the
// defaults above so there is only ever one place they are written down. The
// accessor says which list is being read: Tel prefixes for the models, ISSI
// ones for the agencies. Neither category has both.
//
// Keyed through modelKey, not the raw name: a stored list holds the spelling of
// the day it was saved, and "TMR 880i" must still be seeded the 7506 and the 08
// that the shipped "TMR880i" carries. Matching on the exact name meant renaming
// a model in the defaults silently cut every install's stored copy off from its
// own prefixes — the auto-select dying quietly on the oldest terminals.
const seedPrefixesOf = (list, get = optionPrefixes) =>
  Object.fromEntries(list.map((it) => [modelKey(optionName(it)), get(it)]).filter(([, p]) => p.length > 0))
const SEED_MODEL_PREFIXES = seedPrefixesOf(DEFAULT_OPTIONS.models)
const SEED_ISSI_PREFIXES = seedPrefixesOf(DEFAULT_OPTIONS.agencies, optionIssiPrefixes)

// The shipped stand-in rules, keyed by name — read off the same defaults, so a
// shorthand is still written down in exactly one place.
const SEED_STAND_INS = Object.fromEntries(
  DEFAULT_OPTIONS.models
    .map((it) => [modelKey(optionName(it)), { standIn: optionStandIns(it), standInReal: optionStandInReal(it) }])
    .filter(([, r]) => r.standIn.length > 0 && r.standInReal),
)

// The device letter each shipped model is written by, for the seeding pass —
// every install already has a saved models list, and a saved category fully
// replaces its default, so without this the letters above would reach nobody.
const SEED_MODEL_LETTERS = Object.fromEntries(
  DEFAULT_OPTIONS.models.map((it) => [modelKey(optionName(it)), optionLetter(it)]).filter(([, l]) => l),
)

/**
 * Give a stored models list the device letters it predates.
 *
 * Gap-filling like the prefixes beside it: a model that already declares a
 * letter keeps it, and a letter another stored model has already claimed is
 * skipped rather than handed to two devices — H selects one model, and which
 * one is a decision an admin has already made if they made it at all.
 */
function withSeededLetters(list) {
  const claimed = new Set(list.map(optionLetter).filter(Boolean))
  return list.map((it) => {
    if (optionLetter(it)) return it
    const letter = SEED_MODEL_LETTERS[modelKey(optionName(it))]
    if (!letter || claimed.has(letter)) return it
    claimed.add(letter)
    return { ...(typeof it === 'string' ? {} : it), name: optionName(it), letter }
  })
}

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
 * `get` and `field` say which list is being filled, so the models' Tel prefixes
 * and the agencies' ISSI ones are seeded by the same pass under the same two
 * rules rather than by a near-copy of it.
 */
function withSeededPrefixes(list, seeds, get = optionPrefixes, field = 'prefixes') {
  const claimed = new Set(list.flatMap(get))
  return list.map((it) => {
    if (get(it).length > 0) return it
    const seed = (seeds[modelKey(optionName(it))] ?? []).filter((p) => !claimed.has(p))
    if (!seed.length) return it
    return { ...(typeof it === 'string' ? {} : it), name: optionName(it), [field]: seed }
  })
}

/**
 * Give a stored models list the shipped stand-in rules it predates.
 *
 * Seeding the prefixes alone is half the rule: it hands the car kit back 109,
 * 103 and 03, so typing 103 selects it again, but with nothing to say those
 * digits are shorthand the entry saves as 103 — a number no radio carries. The
 * swap has to come back with the prefixes or the prefixes mean the wrong thing.
 *
 * Gap-filling on the same two rules the prefixes follow, plus the one that
 * makes a shorthand a shorthand:
 *
 *   - a model that already declares a stand-in keeps exactly what was set.
 *   - a shorthand some OTHER stored model already declares is skipped, so an
 *     admin who moved 103 does not have it handed back here.
 *   - only a shorthand this model actually claims as a Tel prefix is seeded.
 *     One it does not claim selects nothing, and seeding it would leave a rule
 *     that rewrites a number the admin never routed here.
 *
 * Runs after the prefix pass, so a model seeded its prefixes a moment ago is
 * read as claiming them.
 */
function withSeededStandIns(list) {
  // Digits throughout: the letter is not a shorthand anybody declared, it is
  // attached to every model, so counting it here would make every row look as
  // though it already had a stand-in and no shipped rule would ever be seeded.
  const declared = new Set(list.flatMap(optionStandIns))
  return list.map((it) => {
    if (optionStandIns(it).length > 0) return it
    const seed = SEED_STAND_INS[modelKey(optionName(it))]
    if (!seed) return it
    const claimed = optionPrefixes(it)
    const standIn = seed.standIn.filter((p) => claimed.includes(p) && !declared.has(p) && p !== seed.standInReal)
    if (!standIn.length) return it
    return { ...(typeof it === 'string' ? {} : it), name: optionName(it), standIn, standInReal: seed.standInReal }
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
  out.models = withSeededLetters(out.models)
  out.models = withSeededPrefixes(out.models, SEED_MODEL_PREFIXES)
  // Then the swap that makes the shorthand among them mean anything.
  out.models = withSeededStandIns(out.models)
  // Agencies are seeded their ISSI prefixes only. Any `prefixes` a stored
  // agency still carries is left where it is — inert now that a Tel number
  // selects nothing but the Model, and not worth rewriting saved data over.
  out.agencies = withSeededPrefixes(out.agencies, SEED_ISSI_PREFIXES, optionIssiPrefixes, 'issiPrefixes')
  // Chart toggles are a plain object, not a category list.
  const storedCharts = stored?.charts && typeof stored.charts === 'object' ? stored.charts : {}
  out.charts = { ...DEFAULT_CHARTS, ...storedCharts }
  // Regions are a plain object (region name -> branch list), not a category list.
  const storedRegions = stored?.regions && typeof stored.regions === 'object' ? stored.regions : {}
  out.regions = { ...DEFAULT_OPTIONS.regions, ...storedRegions }
  return out
}
