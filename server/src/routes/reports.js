import { Router } from 'express'
import { prisma } from '../db.js'

const router = Router()

const ACTIONS = ['CHANGE', 'REPAIR', 'NEW', 'PCB', 'PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE']
const COMPANIES = ['MOTECO', 'MOI', 'PROJECT 2', 'PROJECT X', 'ONLINE', 'MOTECO LOCAL', 'FREE']
// Actions whose "fault" is the whole device — no component issue needed.
const DEVICE_LEVEL = new Set(['PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE'])
const MAX_FAULTS = 6

const withFaults = { faults: { orderBy: { position: 'asc' } } }

const repId = (seq) => `REP-${String(seq).padStart(4, '0')}`

// Turn a Date/ISO into the YYYY-MM-DD key we group reports by.
const dateKey = (value) => new Date(value).toISOString().slice(0, 10)

function parseEntry(body) {
  const reportDate = body?.reportDate
  const type = String(body?.type ?? '').trim()

  if (!reportDate || !type) {
    return { error: 'reportDate and type are required' }
  }

  // Model + agency are optional (e.g. OTHER transmittal items) — fall back to placeholders.
  const model = String(body?.model ?? '').trim() || '-'
  const agency = String(body?.agency ?? '').trim() || '-'

  // Optional — fall back to the MOTECO placeholders when left blank.
  const technician = String(body?.technician ?? '').trim()
  const telNumber = String(body?.telNumber ?? '').trim() || '-'
  const issiNumber = String(body?.issiNumber ?? '').trim() || '*'

  const rawFaults = Array.isArray(body?.faults) ? body.faults : []
  const faults = rawFaults
    .map((f) => ({
      issue: String(f?.issue ?? '').trim(),
      quantity: Math.max(1, Number(f?.quantity) || 1),
      action: String(f?.action ?? '').trim().toUpperCase(),
      company: String(f?.company ?? '').trim().toUpperCase(),
      status: String(f?.status ?? '').trim(),
    }))
    // Keep a fault if it names an issue, or is a device-level action (issue optional).
    .filter((f) => f.issue !== '' || DEVICE_LEVEL.has(f.action))
    .map((f, i) => ({ ...f, position: i }))

  if (faults.length === 0) return { error: 'At least one fault is required (issue, or a device-level action)' }

  // Actions/companies are user-managed via /api/options, so we only require a
  // non-empty action rather than a fixed whitelist. ACTIONS/COMPANIES stay as the
  // built-in defaults the report engine understands out of the box.
  const missingAction = faults.find((f) => !f.action)
  if (missingAction) return { error: 'each fault needs an action' }

  const comment = String(body?.comment ?? '').trim()
  const mode = String(body?.mode ?? 'report').trim().toLowerCase() === 'transmittal' ? 'transmittal' : 'report'

  return {
    data: {
      reportDate: new Date(reportDate),
      mode,
      technician,
      agency,
      telNumber,
      issiNumber,
      type,
      model,
      comment,
      faults: { create: faults },
    },
  }
}

// report | transmittal working set, from a ?mode= query (unset = all).
const modeWhere = (req) => {
  const m = String(req.query?.mode ?? '').trim().toLowerCase()
  return m === 'report' || m === 'transmittal' ? { mode: m } : {}
}

// Ensure a Report row (and its REP-#### seq) exists for a date; returns the seq.
async function ensureReportSeq(tx, reportDate) {
  const existing = await tx.report.findUnique({ where: { reportDate } })
  if (existing) return existing.seq
  const max = await tx.report.aggregate({ _max: { seq: true } })
  const seq = (max._max.seq ?? 0) + 1
  await tx.report.create({ data: { reportDate, seq } })
  return seq
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
        where: modeWhere(req),
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
    const { data, error } = parseEntry(req.body)
    if (error) return res.status(400).json({ error })

    const result = await prisma.$transaction(async (tx) => {
      const seq = await ensureReportSeq(tx, data.reportDate)
      const entry = await tx.reportEntry.create({ data, include: withFaults })
      return { ...entry, reportId: repId(seq) }
    })
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/reports - clear the working entries for a mode (?mode=), or all
// if no mode is given. Faults cascade. Returns the count removed.
router.delete('/', async (req, res, next) => {
  try {
    const { count } = await prisma.reportEntry.deleteMany({ where: modeWhere(req) })
    res.json({ cleared: count })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/reports/:id - faults cascade via the schema relation
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.reportEntry.delete({ where: { id: Number(req.params.id) } })
    res.status(204).end()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Entry not found' })
    next(err)
  }
})

export default router
