import { Router } from 'express'
import { prisma } from '../db.js'

const router = Router()

// GET /api/reports - newest first
router.get('/', async (req, res, next) => {
  try {
    const reports = await prisma.dailyReport.findMany({
      orderBy: { reportDate: 'desc' },
      take: 100,
    })
    res.json(reports)
  } catch (err) {
    next(err)
  }
})

// GET /api/reports/:id
router.get('/:id', async (req, res, next) => {
  try {
    const report = await prisma.dailyReport.findUnique({
      where: { id: Number(req.params.id) },
    })
    if (!report) return res.status(404).json({ error: 'Report not found' })
    res.json(report)
  } catch (err) {
    next(err)
  }
})

// POST /api/reports
router.post('/', async (req, res, next) => {
  try {
    const { reportDate, author, summary, hoursWorked } = req.body

    if (!reportDate || !author || !summary) {
      return res.status(400).json({ error: 'reportDate, author and summary are required' })
    }

    const report = await prisma.dailyReport.create({
      data: {
        reportDate: new Date(reportDate),
        author,
        summary,
        hoursWorked: hoursWorked ?? null,
      },
    })
    res.status(201).json(report)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/reports/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.dailyReport.delete({ where: { id: Number(req.params.id) } })
    res.status(204).end()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Report not found' })
    next(err)
  }
})

export default router
