import { Router } from 'express'
import { prisma } from '../db.js'
import { branchWhere, writeBranch, canAccessBranch } from '../scope.js'

const router = Router()

// Human id per document type: transmittals get their own TRANS-#### series.
const normMode = (m) => (String(m ?? 'report').trim().toLowerCase() === 'transmittal' ? 'transmittal' : 'report')
const docId = (mode, n) => `${normMode(mode) === 'transmittal' ? 'TRANS' : 'REP'}-${String(n).padStart(4, '0')}`
const withFaults = { faults: { orderBy: { position: 'asc' } } }

const dmy = (value) => {
  const d = new Date(value)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

// Deduct stock for materials/faults that match an inventory item (by itemCode,
// case-insensitive). Quantities across the snapshot are summed per item, and
// `out` is incremented (so `avail` = begin - out drops). Unmatched issues are
// ignored. Runs inside the save transaction so it's all-or-nothing.
async function applyInventoryUsage(tx, snapshot, reference, branch) {
  const used = new Map() // itemCode(upper) -> total qty
  for (const e of snapshot) {
    for (const f of e.faults ?? []) {
      const key = String(f.issue ?? '').trim().toUpperCase()
      if (!key) continue
      used.set(key, (used.get(key) || 0) + Math.max(0, Number(f.quantity) || 0))
    }
  }
  if (used.size === 0) return
  // Only deduct from the saving branch's own stock (each branch has separate inventory).
  const items = await tx.inventoryItem.findMany({
    where: { branch: branch ?? '' },
    select: { id: true, sku: true, itemCode: true, begin: true, out: true },
  })
  for (const it of items) {
    const qty = used.get(String(it.itemCode ?? '').trim().toUpperCase())
    if (!qty) continue
    const newOut = it.out + qty
    await tx.inventoryItem.update({ where: { id: it.id }, data: { out: newOut } })
    await tx.inventoryTxn.create({
      data: {
        itemId: it.id,
        sku: it.sku,
        type: 'usage',
        change: -qty,
        availAfter: it.begin - newOut,
        reference: reference ?? '',
        branch: branch ?? '',
        material: it.itemCode,
      },
    })
  }
}

// Global insertion counter (ordering + latest-per-date dedup) — never duplicate.
async function nextSeq() {
  const max = await prisma.savedReport.aggregate({ _max: { seq: true } })
  return (max._max.seq ?? 0) + 1
}

// Next series number within a document type AND branch — each branch keeps its
// own independent series (Makkah REP-0001…, Dammam REP-0001…, and likewise for
// TRANS-####). Branch '' is the unassigned/legacy series.
async function nextDocNumber(mode, branch) {
  const max = await prisma.savedReport.aggregate({
    where: { mode: normMode(mode), branch: branch ?? '' },
    _max: { docNumber: true },
  })
  return (max._max.docNumber ?? 0) + 1
}

// GET /api/saved-reports - list newest first, plus the next id a Save would mint.
router.get('/', async (req, res, next) => {
  try {
    // Preview the next id for the branch in view (client also derives its own).
    const previewBranch = writeBranch(req, req.query.branch)
    const [reports, repNo, transNo] = await Promise.all([
      prisma.savedReport.findMany({
        where: branchWhere(req, req.query.branch),
        orderBy: { seq: 'desc' },
        select: {
          id: true, seq: true, docNumber: true, reportId: true, branch: true, mode: true,
          transmittedBy: true, receivedBy: true, savedAt: true, dateLabel: true, entryCount: true,
          entries: true, // snapshot, so the client can search inside report data
        },
      }),
      nextDocNumber('report', previewBranch),
      nextDocNumber('transmittal', previewBranch),
    ])
    // Per-mode "next id" previews so each document type numbers independently.
    res.json({ nextReportId: docId('report', repNo), nextTransmittalId: docId('transmittal', transNo), reports })
  } catch (err) {
    next(err)
  }
})

// GET /api/saved-reports/:id - full snapshot (entries included)
router.get('/:id', async (req, res, next) => {
  try {
    const report = await prisma.savedReport.findUnique({ where: { id: Number(req.params.id) } })
    if (!report || !canAccessBranch(req, report.branch)) return res.status(404).json({ error: 'Saved report not found' })
    res.json(report)
  } catch (err) {
    next(err)
  }
})

// POST /api/saved-reports - snapshot the current working entries under the next REP-####.
router.post('/', async (req, res, next) => {
  try {
    const mode = String(req.body?.mode ?? 'report').trim().toLowerCase() === 'transmittal' ? 'transmittal' : 'report'
    // Only snapshot the working entries for the branch being saved, so a
    // non-admin never sweeps up another branch's entries.
    const branch = writeBranch(req, req.body?.branch)
    const entries = await prisma.reportEntry.findMany({
      where: { mode, branch },
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
      comment: e.comment,
      faults: e.faults.map((f) => ({
        position: f.position,
        issue: f.issue,
        quantity: f.quantity,
        action: f.action,
        company: f.company,
        status: f.status,
      })),
    }))

    const dates = [...new Set(snapshot.map((e) => e.reportDate))].sort()
    const dateLabel = dates.length === 1 ? dmy(dates[0]) : `${dmy(dates[0])} (+${dates.length - 1} more)`

    const transmittedBy = String(req.body?.transmittedBy ?? '').trim()
    const receivedBy = String(req.body?.receivedBy ?? '').trim()
    const seq = await nextSeq()
    const docNumber = await nextDocNumber(mode, branch)
    const saved = await prisma.$transaction(async (tx) => {
      const created = await tx.savedReport.create({
        data: {
          seq, docNumber, reportId: docId(mode, docNumber), branch, mode, transmittedBy, receivedBy,
          dateLabel, entryCount: snapshot.length, entries: snapshot,
        },
      })
      await applyInventoryUsage(tx, snapshot, created.reportId, branch) // auto stock deduction + ledger
      // Auto-clear the working set for this mode+branch so the next report starts
      // fresh — every saved report stays a disjoint snapshot (no cross-report
      // double-counting in the monthly/spare-parts/agency aggregations).
      await tx.reportEntry.deleteMany({ where: { mode, branch } })
      return created
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
    if (!report || !canAccessBranch(req, report.branch)) return res.status(404).json({ error: 'Saved report not found' })

    const snapshot = Array.isArray(report.entries) ? report.entries : []
    const mode = String(report.mode ?? 'report').toLowerCase() === 'transmittal' ? 'transmittal' : 'report'
    const branch = report.branch || '' // load into this report's branch workspace
    await prisma.$transaction(async (tx) => {
      // Replace only this document type's working set for this branch, leaving
      // the other mode and other branches intact.
      await tx.reportEntry.deleteMany({ where: { mode, branch } })
      for (const e of snapshot) {
        await tx.reportEntry.create({
          data: {
            reportDate: new Date(e.reportDate),
            mode,
            branch,
            technician: e.technician ?? '',
            agency: e.agency ?? '',
            telNumber: e.telNumber || '-',
            issiNumber: e.issiNumber || '*',
            type: e.type ?? '',
            model: e.model ?? '',
            comment: e.comment ?? '',
            faults: {
              create: (e.faults ?? []).map((f, i) => ({
                position: f.position ?? i,
                issue: f.issue ?? '',
                quantity: Math.max(1, Number(f.quantity) || 1),
                action: String(f.action ?? '').toUpperCase(),
                company: String(f.company ?? '').toUpperCase(),
                status: String(f.status ?? ''),
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
    const id = Number(req.params.id)
    const report = await prisma.savedReport.findUnique({ where: { id }, select: { branch: true } })
    if (!report || !canAccessBranch(req, report.branch)) {
      return res.status(404).json({ error: 'Saved report not found' })
    }
    await prisma.savedReport.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Saved report not found' })
    next(err)
  }
})

export default router
