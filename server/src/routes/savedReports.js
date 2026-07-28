import { Router } from 'express'
import { prisma } from '../db.js'

const router = Router()

const repId = (seq) => `REP-${String(seq).padStart(4, '0')}`
const withFaults = { faults: { orderBy: { position: 'asc' } } }

const dmy = (value) => {
  const d = new Date(value)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

// Next unused sequence number (max + 1) — guarantees no duplicate REP-####.
async function nextSeq() {
  const max = await prisma.savedReport.aggregate({ _max: { seq: true } })
  return (max._max.seq ?? 0) + 1
}

// GET /api/saved-reports - list newest first, plus the next id a Save would mint.
router.get('/', async (req, res, next) => {
  try {
    const [reports, seq] = await Promise.all([
      prisma.savedReport.findMany({
        orderBy: { seq: 'desc' },
        select: { id: true, seq: true, reportId: true, savedAt: true, dateLabel: true, entryCount: true },
      }),
      nextSeq(),
    ])
    res.json({ nextReportId: repId(seq), reports })
  } catch (err) {
    next(err)
  }
})

// GET /api/saved-reports/:id - full snapshot (entries included)
router.get('/:id', async (req, res, next) => {
  try {
    const report = await prisma.savedReport.findUnique({ where: { id: Number(req.params.id) } })
    if (!report) return res.status(404).json({ error: 'Saved report not found' })
    res.json(report)
  } catch (err) {
    next(err)
  }
})

// POST /api/saved-reports - snapshot the current working entries under the next REP-####.
router.post('/', async (req, res, next) => {
  try {
    const entries = await prisma.reportEntry.findMany({
      orderBy: [{ reportDate: 'asc' }, { id: 'asc' }],
      include: withFaults,
    })
    if (entries.length === 0) {
      return res.status(400).json({ error: 'Nothing to save — add entries first' })
    }

    const snapshot = entries.map((e) => ({
      reportDate: new Date(e.reportDate).toISOString().slice(0, 10),
      technician: e.technician,
      agency: e.agency,
      telNumber: e.telNumber,
      issiNumber: e.issiNumber,
      type: e.type,
      model: e.model,
      faults: e.faults.map((f) => ({
        position: f.position,
        issue: f.issue,
        quantity: f.quantity,
        action: f.action,
        company: f.company,
      })),
    }))

    const dates = [...new Set(snapshot.map((e) => e.reportDate))].sort()
    const dateLabel = dates.length === 1 ? dmy(dates[0]) : `${dmy(dates[0])} (+${dates.length - 1} more)`

    const seq = await nextSeq()
    const saved = await prisma.savedReport.create({
      data: { seq, reportId: repId(seq), dateLabel, entryCount: snapshot.length, entries: snapshot },
    })
    res.status(201).json(saved)
  } catch (err) {
    next(err)
  }
})

// POST /api/saved-reports/:id/load - replace the working entries with this snapshot.
router.post('/:id/load', async (req, res, next) => {
  try {
    const report = await prisma.savedReport.findUnique({ where: { id: Number(req.params.id) } })
    if (!report) return res.status(404).json({ error: 'Saved report not found' })

    const snapshot = Array.isArray(report.entries) ? report.entries : []
    await prisma.$transaction(async (tx) => {
      await tx.reportEntry.deleteMany({})
      for (const e of snapshot) {
        await tx.reportEntry.create({
          data: {
            reportDate: new Date(e.reportDate),
            technician: e.technician ?? '',
            agency: e.agency ?? '',
            telNumber: e.telNumber || '-',
            issiNumber: e.issiNumber || '*',
            type: e.type ?? '',
            model: e.model ?? '',
            faults: {
              create: (e.faults ?? []).map((f, i) => ({
                position: f.position ?? i,
                issue: f.issue ?? '',
                quantity: Math.max(1, Number(f.quantity) || 1),
                action: String(f.action ?? '').toUpperCase(),
                company: String(f.company ?? '').toUpperCase(),
              })),
            },
          },
        })
      }
    })
    res.json({ loaded: snapshot.length })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/saved-reports/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.savedReport.delete({ where: { id: Number(req.params.id) } })
    res.status(204).end()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Saved report not found' })
    next(err)
  }
})

export default router
