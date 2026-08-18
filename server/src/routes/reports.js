import { Router } from 'express'
import { prisma } from '../db.js'
import { branchWhere, writeBranch, canAccessBranch } from '../scope.js'
// Entry validation and creation are shared with the WhatsApp webhook, which
// creates the same entries from a texted code. See src/reportEntry.js.
import { parseEntry, createEntry, ensureReportSeq, withFaults, repId, dateKey } from '../reportEntry.js'

const router = Router()

const ACTIONS = ['CHANGE', 'REPAIR', 'NEW', 'PCB', 'PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE']
const COMPANIES = ['MOTECO', 'MOI', 'PROJECT 2', 'PROJECT X', 'ONLINE', 'MOTECO LOCAL', 'FREE']
const MAX_FAULTS = 6

// report | transmittal working set, from a ?mode= query (unset = all).
const modeWhere = (req) => {
  const m = String(req.query?.mode ?? '').trim().toLowerCase()
  return m === 'report' || m === 'transmittal' ? { mode: m } : {}
}

// Map of YYYY-MM-DD -> "REP-####" for attaching ids to listed entries.
async function reportIdMap() {
  const reports = await prisma.report.findMany()
  const map = {}
  for (const r of reports) map[dateKey(r.reportDate)] = repId(r.seq)
  return map
}

// GET /api/reports - newest first, faults + reportId included
router.get('/', async (req, res, next) => {
  try {
    const [entries, ids] = await Promise.all([
      prisma.reportEntry.findMany({
        where: { ...modeWhere(req), ...branchWhere(req, req.query.branch, req.query.region) },
        orderBy: [{ reportDate: 'desc' }, { id: 'asc' }],
        take: 500,
        include: withFaults,
      }),
      reportIdMap(),
    ])
    res.json(entries.map((e) => ({ ...e, reportId: ids[dateKey(e.reportDate)] ?? null })))
  } catch (err) {
    next(err)
  }
})

// POST /api/reports
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = await parseEntry(req.body)
    if (error) return res.status(400).json({ error })
    data.branch = writeBranch(req, req.body?.branch) // tag with the owning branch
    if (data.branch === null) return res.status(400).json({ error: 'That branch is outside your region' })

    res.status(201).json(await createEntry(data))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/reports - clear the working entries for a mode (?mode=), or all
// if no mode is given. Faults cascade. Returns the count removed.
router.delete('/', async (req, res, next) => {
  try {
    const { count } = await prisma.reportEntry.deleteMany({
      where: { ...modeWhere(req), ...branchWhere(req, req.query.branch, req.query.region) },
    })
    res.json({ cleared: count })
  } catch (err) {
    next(err)
  }
})

// PUT /api/reports/:id - replace an entry's fields + faults in place.
router.put('/:id', async (req, res, next) => {
  try {
    const { data, error } = await parseEntry(req.body)
    if (error) return res.status(400).json({ error })
    const id = Number(req.params.id)
    const { faults, ...scalar } = data
    // Non-admins may only edit entries in their own branch.
    const existing = await prisma.reportEntry.findUnique({ where: { id }, select: { branch: true } })
    if (!existing) return res.status(404).json({ error: 'Entry not found' })
    if (!canAccessBranch(req, existing.branch)) return res.status(404).json({ error: 'Entry not found' })
    const result = await prisma.$transaction(async (tx) => {
      const seq = await ensureReportSeq(tx, data.reportDate)
      const entry = await tx.reportEntry.update({
        where: { id },
        data: { ...scalar, faults: { deleteMany: {}, create: faults.create } },
        include: withFaults,
      })
      return { ...entry, reportId: repId(seq) }
    })
    res.json(result)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Entry not found' })
    next(err)
  }
})

// DELETE /api/reports/:id - faults cascade via the schema relation
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.reportEntry.findUnique({ where: { id }, select: { branch: true } })
    if (!existing || !canAccessBranch(req, existing.branch)) {
      return res.status(404).json({ error: 'Entry not found' })
    }
    await prisma.reportEntry.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Entry not found' })
    next(err)
  }
})

export default router
