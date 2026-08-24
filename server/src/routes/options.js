import { Router } from 'express'
import { prisma } from '../db.js'
import { CODEMAP_SEED } from '../codemapSeed.js'
// Giving an issue a parts code supersedes the provisional Model Code every
// inventory item of that name is held under — see promotePairCodes.js.
import { promotePairCodes } from '../promotePairCodes.js'

const router = Router()

// GET /api/options - the stored option lists, or {} if never saved.
router.get('/', async (req, res, next) => {
  try {
    const row = await prisma.appOptions.findUnique({ where: { id: 1 } })
    res.json(row?.data ?? {})
  } catch (err) {
    next(err)
  }
})

// PUT /api/options - replace the whole option set. Body is the { category: [...] } object.
//
// Also the moment a part can gain its permanent code: this route is where BOTH
// ways of claiming one land (Manage inputs -> Issue types, and the code button
// on the entry form's Issue field). Any item still held under that name's
// provisional Model Code is moved onto the real one in the same transaction, so
// the vocabulary and the shelf can never disagree about what a fault draws.
router.put('/', async (req, res, next) => {
  try {
    const data = req.body
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Body must be an object of { category: string[] }' })
    }
    const { row, promotion } = await prisma.$transaction(async (tx) => {
      const existing = await tx.appOptions.findUnique({ where: { id: 1 } })
      const saved = await tx.appOptions.upsert({
        where: { id: 1 },
        create: { id: 1, data },
        update: { data },
      })
      const mapRow = await tx.codeMap.findUnique({ where: { id: 1 } })
      const promotion = await promotePairCodes(tx, {
        before: existing?.data?.issueTypes,
        after: data?.issueTypes,
        equipmentCodes: mapRow?.data?.equipmentCodes ?? CODEMAP_SEED.equipmentCodes,
      })
      return { row: saved, promotion }
    })
    // Logged rather than returned: the client saves options in the background
    // and ignores the body, and a promotion is a bookkeeping consequence of an
    // edit someone already made, not an answer they are waiting on.
    for (const p of promotion.promoted) {
      console.log(`[inventory] ${p.sku} (${p.branch || 'no branch'}) promoted ${p.from} -> ${p.to}`)
    }
    for (const s of promotion.skipped) {
      console.warn(`[inventory] ${s.sku} kept its provisional Model Code — ${s.to} is already ${s.heldBy}`)
    }
    res.json(row.data)
  } catch (err) {
    next(err)
  }
})

export default router
