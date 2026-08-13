import { Router } from 'express'
import { prisma } from '../db.js'

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
router.put('/', async (req, res, next) => {
  try {
    const data = req.body
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Body must be an object of { category: string[] }' })
    }
    const row = await prisma.appOptions.upsert({
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
