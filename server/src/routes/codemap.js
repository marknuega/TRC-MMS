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
  'variants',
  'actions',
  'companies',
  'agencies',
  'technicians',
]

/**
 * Read the map, seeding the row on first use.
 *
 * Seeding happens here rather than at boot so a cold start never depends on a
 * write succeeding, and so tests get the same data without extra setup.
 */
export async function readCodeMap() {
  const row = await prisma.codeMap.findUnique({ where: { id: 1 } })
  if (row && row.data && Object.keys(row.data).length > 0) return row.data

  const created = await prisma.codeMap.upsert({
    where: { id: 1 },
    create: { id: 1, data: CODEMAP_SEED },
    update: { data: CODEMAP_SEED },
  })
  return created.data
}

/**
 * Validate a whole-map payload. Returns an error string, or null when valid.
 *
 * Every value must be a string. An EMPTY string is allowed on purpose — the
 * blank variant suffix is what makes A the default build of a part, so
 * rejecting it would make that entry unrepresentable.
 */
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
const PARTS_RE = /^\d{2}$/
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
    if (!name || !PARTS_RE.test(parts) || !VARIANT_RE.test(variant)) continue
    const code = parts + variant
    // First claim wins, matching the client — order must not flip a meaning.
    if (!out[code]) out[code] = name
  }
  return out
}

/**
 * The whole decoding vocabulary: the stored map plus the derived `faults`.
 *
 * `faults` is derived on read, never stored: it is a projection of AppOptions,
 * so persisting it would create a second copy free to disagree with the list
 * the app actually edits. It is also absent from CODEMAP_CATEGORIES, so a PUT
 * can never write it back and turn the projection into state.
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
  return { ...map, faults: faultCodes(opts?.data?.issueTypes) }
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
