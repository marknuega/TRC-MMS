/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The CDS code map — the vocabulary that turns a short code like H43AC1MT into
 * a part, action, company and technician.
 *
 * This app is the home of that map. It is published unauthenticated at
 * GET /codemap in the exact shape the WhatsApp bridge used to serve, so the bot
 * only needs its URL repointed here — no payload changes on its side.
 */
import { Router } from 'express'
import { prisma } from '../db.js'
import { adminRequired } from '../auth.js'
import { CODEMAP_SEED } from '../codemapSeed.js'

// The categories the map is allowed to contain. Anything else in a PUT body is
// rejected rather than stored: the bot indexes these keys directly, so a typo'd
// category would be silently ignored by every consumer instead of erroring.
export const CODEMAP_CATEGORIES = [
  'equipmentCodes',
  'components',
  // Admin-assigned display grouping for a parts number, e.g. "10" -> "Housing &
  // Antenna". Keyed the same as `components` and same 2-digit rule, but kept
  // as its own category rather than folded into the component's value: the
  // component name is published to the WhatsApp bridge and must stay a plain
  // string, so a second attribute needs a second map. Optional — a code absent
  // here falls back to the numeric-range bucket (see refGroups.js).
  'componentCategories',
  'variants',
  'actions',
  'companies',
  'agencies',
  'technicians',
]

// Mirrors the parts group in FAULT_RE (client codes.js) and FAULT_PATTERN (the
// WhatsApp decoder) — the three must agree on what a parts number is. Also
// enforced client-side (CodeMapEditor), but re-checked here since this is what
// the WhatsApp bridge actually gets served.
const PARTS_ONLY_RE = /^\d{2}$/

// Actions the decoder itself reasons about, so they must be in the served map
// whatever is stored. A map saved before RTO existed would otherwise let
// FAULT_PATTERN match "RTO" and then fail to name it, rejecting a code the
// technician wrote correctly. Mirrors REQUIRED_ACTIONS in client/src/options.js.
const REQUIRED_ACTIONS = { RTO: 'RTO' }

/** The map with any missing required action filled in. Returns the SAME object
 *  when nothing is missing, so readCodeMap only writes when it must. */
export function withRequiredActions(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data
  const actions = data.actions && typeof data.actions === 'object' && !Array.isArray(data.actions) ? data.actions : {}
  const missing = Object.entries(REQUIRED_ACTIONS).filter(([code]) => !(code in actions))
  if (!missing.length) return data
  return { ...data, actions: { ...actions, ...Object.fromEntries(missing) } }
}

/**
 * Read the map, seeding the row on first use.
 *
 * Seeding happens here rather than at boot so a cold start never depends on a
 * write succeeding, and so tests get the same data without extra setup.
 */
export async function readCodeMap() {
  const row = await prisma.codeMap.findUnique({ where: { id: 1 } })
  const saved = row && row.data && Object.keys(row.data).length > 0 ? row.data : CODEMAP_SEED
  const clean = withRequiredActions(sanitizeCodeMap(saved))

  if (clean !== saved) {
    const updated = await prisma.codeMap.upsert({
      where: { id: 1 },
      create: { id: 1, data: clean },
      update: { data: clean },
    })
    return updated.data
  }

  if (!row) {
    const created = await prisma.codeMap.upsert({
      where: { id: 1 },
      create: { id: 1, data: CODEMAP_SEED },
      update: { data: CODEMAP_SEED },
    })
    return created.data
  }

  return saved
}

/**
 * Validate a whole-map payload. Returns an error string, or null when valid.
 *
 * Every value must be a string. An EMPTY string is allowed on purpose — the
 * blank variant suffix is what makes A the default build of a part, so
 * rejecting it would make that entry unrepresentable.
 */
export function sanitizeCodeMap(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data

  const clean = { ...data }
  let changed = false

  for (const cat of ['components', 'componentCategories']) {
    const entries = clean[cat]
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue

    const next = {}
    for (const [code, name] of Object.entries(entries)) {
      const key = String(code ?? '').trim()
      if (!key) {
        changed = true
        continue
      }
      if ((cat === 'components' || cat === 'componentCategories') && !PARTS_ONLY_RE.test(key)) {
        changed = true
        continue
      }
      next[key] = name
    }

    if (Object.keys(next).length !== Object.keys(entries).length) {
      clean[cat] = next
      changed = true
    }
  }

  return changed ? clean : data
}

export function validateCodeMap(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'Body must be an object of { category: { code: name } }'
  }
  const unknown = Object.keys(data).filter((k) => !CODEMAP_CATEGORIES.includes(k))
  if (unknown.length) return `Unknown categor${unknown.length > 1 ? 'ies' : 'y'}: ${unknown.join(', ')}`

  for (const [cat, entries] of Object.entries(data)) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      return `${cat} must be an object of { code: name }`
    }
    for (const [code, name] of Object.entries(entries)) {
      if (!code.trim()) return `${cat} has an entry with a blank code`
      if (typeof name !== 'string') return `${cat}.${code} must be a string`
      if ((cat === 'components' || cat === 'componentCategories') && !PARTS_ONLY_RE.test(code)) {
        return `${cat}.${code} is not a parts number — it must be exactly two digits, e.g. 43.`
      }
    }
  }
  return null
}

/**
 * Fault codes claimed by an issue type, as { '19B': 'Fistmic' }.
 *
 * These live in AppOptions (Manage inputs -> Issue types), not in the code map,
 * because they are the app's own vocabulary rather than the shared one. But the
 * WhatsApp bot has no session and so cannot read /api/options, and a code it
 * cannot resolve is a report it cannot file. Publishing them on the public
 * mirror is what lets the bot decode the same 19B the app does.
 *
 * Keyed on parts + variant WITHOUT the device letter: the technician supplies
 * that, and 19B is the same fault whichever radio it came off.
 *
 * Mirrors issueCode() / issueName() in client/src/options.js — the two are
 * pinned together by codemap.test.js, which runs the same rows through both.
 */
const VARIANT_RE = /^[A-Z]$/
const upTrim = (v) => String(v ?? '').trim().toUpperCase()

export function faultCodes(issueTypes) {
  const out = {}
  for (const it of issueTypes ?? []) {
    // Plain strings are issue types with no code — nothing to publish.
    if (!it || typeof it !== 'object') continue
    // `base` is the superseded shape (a combined "43A"); read it so rows saved
    // by that version still publish.
    const parts = upTrim(it.parts ?? upTrim(it.base).slice(0, 2))
    const variant = upTrim(it.variant ?? upTrim(it.base).slice(2, 3))
    const name = String(it.name ?? '').trim()
    if (!name || !PARTS_ONLY_RE.test(parts) || !VARIANT_RE.test(variant)) continue
    const code = parts + variant
    // First claim wins, matching the client — order must not flip a meaning.
    if (!out[code]) out[code] = name
  }
  return out
}

/**
 * Technician IDs claimed in AppOptions (Manage inputs -> Technicians), as
 * { '1': 'Amir', 'MA': 'Muhammad Amir', 'MRA': 'Muhammad Rashid Amir' }.
 * Mirrors technicianIdMap() in client/src/options.js — the two are pinned
 * together by codemap.test.js.
 *
 * A technician may claim a numeric ID, a 2-letter initial, a 3-letter
 * initial, any combination, or none — each claimed one is published. A
 * blank or invalid one is skipped: there is nothing here for the WhatsApp
 * decoder to key on for it. First claim wins, matching faultCodes(), so a
 * duplicate can never flip meaning by list order.
 */
const TECH_ID_RE = /^\d+$/
const TECH_INITIALS2_RE = /^[A-Z]{2}$/i
const TECH_INITIALS3_RE = /^[A-Z]{3}$/i

export function technicianCodes(technicians) {
  const out = {}
  const rows = technicians ?? []
  for (const it of rows) {
    // Plain strings are technicians with no ID — nothing to publish.
    if (!it || typeof it !== 'object') continue
    const id = String(it.id ?? '').trim()
    const name = String(it.name ?? '').trim()
    if (!id || !name || !TECH_ID_RE.test(id)) continue
    if (!out[id]) out[id] = name
  }
  for (const it of rows) {
    if (!it || typeof it !== 'object') continue
    const initials2 = String(it.initials2 ?? '').trim().toUpperCase()
    const name = String(it.name ?? '').trim()
    if (!initials2 || !name || !TECH_INITIALS2_RE.test(initials2)) continue
    if (!out[initials2]) out[initials2] = name
  }
  for (const it of rows) {
    if (!it || typeof it !== 'object') continue
    const initials3 = String(it.initials3 ?? '').trim().toUpperCase()
    const name = String(it.name ?? '').trim()
    if (!initials3 || !name || !TECH_INITIALS3_RE.test(initials3)) continue
    if (!out[initials3]) out[initials3] = name
  }
  return out
}

/**
 * The whole decoding vocabulary: the stored map plus the derived `faults`
 * and (merged with the stored map's own) `technicians`.
 *
 * `faults` is derived on read, never stored: it is a projection of AppOptions,
 * so persisting it would create a second copy free to disagree with the list
 * the app actually edits. It is also absent from CODEMAP_CATEGORIES, so a PUT
 * can never write it back and turn the projection into state.
 *
 * `technicians` is a MERGE rather than a full override: an ID assigned in
 * AppOptions outranks the same ID in the stored map (mirrors how an Issue
 * type's code outranks the parts+variant lookup), but an ID only ever set in
 * Code Map's older Technician IDs list keeps working until it too is moved
 * over — so shipping this never silently locks an existing technician out of
 * texting reports.
 *
 * Both consumers go through here — the public mirror below and the WhatsApp
 * webhook — so a technician's code can never decode against a different
 * vocabulary than the one published.
 */
export async function fullCodeMap() {
  const [map, opts] = await Promise.all([
    readCodeMap(),
    prisma.appOptions.findUnique({ where: { id: 1 } }),
  ])
  return {
    ...map,
    faults: faultCodes(opts?.data?.issueTypes),
    technicians: { ...map.technicians, ...technicianCodes(opts?.data?.technicians) },
  }
}

/** Public, read-only, CORS-open mirror — mounted at GET /codemap. */
export async function publicCodeMap(req, res, next) {
  try {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cache-Control', 'no-store')
    res.json(await fullCodeMap())
  } catch (err) {
    next(err)
  }
}

const router = Router()

// GET /api/codemap - the map, for the admin editor.
router.get('/', async (req, res, next) => {
  try {
    res.json(await readCodeMap())
  } catch (err) {
    next(err)
  }
})

// PUT /api/codemap - replace the whole map. Admin-only: every technician's
// decode resolves through this, so a bad edit misfiles reports app-wide.
router.put('/', adminRequired, async (req, res, next) => {
  try {
    const data = req.body
    const problem = validateCodeMap(data)
    if (problem) return res.status(400).json({ error: problem })

    const row = await prisma.codeMap.upsert({
      where: { id: 1 },
      create: { id: 1, data },
      update: { data },
    })
    res.json(row.data)
  } catch (err) {
    next(err)
  }
})

export default router
