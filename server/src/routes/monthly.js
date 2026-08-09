import { Router } from 'express'
import { prisma } from '../db.js'
import { writeBranch } from '../scope.js'

const router = Router()

// GET /api/monthly?month=YYYY-MM&branch=... - stored sheet data, or null.
router.get('/', async (req, res, next) => {
  try {
    const monthKey = String(req.query.month ?? '')
    const branch = writeBranch(req, req.query.branch) // non-admins forced to their own branch
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return res.status(400).json({ error: 'month must be YYYY-MM' })
    const row = await prisma.monthlySheet.findUnique({ where: { monthKey_branch: { monthKey, branch } } })
    res.json({ data: row?.data ?? null, updatedAt: row?.updatedAt ?? null })
  } catch (err) {
    next(err)
  }
})

// PUT /api/monthly - upsert { month, branch, data }.
router.put('/', async (req, res, next) => {
  try {
    const monthKey = String(req.body?.month ?? '')
    const branch = writeBranch(req, req.body?.branch)
    const data = req.body?.data
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return res.status(400).json({ error: 'month must be YYYY-MM' })
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'data must be an object keyed by day' })
    }
    const row = await prisma.monthlySheet.upsert({
      where: { monthKey_branch: { monthKey, branch } },
      create: { monthKey, branch, data },
      update: { data },
    })
    res.json({ data: row.data })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/monthly?month=YYYY-MM&branch=... - revert to live-derived data.
router.delete('/', async (req, res, next) => {
  try {
    const monthKey = String(req.query.month ?? '')
    const branch = writeBranch(req, req.query.branch)
    await prisma.monthlySheet.deleteMany({ where: { monthKey, branch } })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

export default router
