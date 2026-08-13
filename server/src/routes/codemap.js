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

/** Public, read-only, CORS-open mirror — mounted at GET /codemap. */
export async function publicCodeMap(req, res, next) {
  try {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cache-Control', 'no-store')
    res.json(await readCodeMap())
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
