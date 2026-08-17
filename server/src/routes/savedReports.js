import { Router } from 'express'
import { prisma } from '../db.js'
import { branchWhere, writeBranch, canAccessBranch } from '../scope.js'
// The daily text is also sent to a technician who texts "report", so it is
// built in one place rather than once per caller. See src/dailyText.js, which
// also owns dmy() and repLabel().
import { dailyReportText, dmy } from '../dailyText.js'
import { isNoActivityIssue } from '../reportEntry.js'
// The id a document is shown by, so a clash names the OTHER document the way
// its holder would read it — same rendering the page and the print sheet use.
import { shortIdOf } from '../../../client/src/report.js'

const router = Router()

// Human id per document type. Three series, each numbering itself per branch:
// REP daily reports, TRANS transmittals, REF reference-only reports — the last
// kept apart so the record-keeping numbers never interleave with real activity.
const normMode = (m) => (String(m ?? 'report').trim().toLowerCase() === 'transmittal' ? 'transmittal' : 'report')

// The series a save mints. Reference-only is decided BEFORE the number, so the
// badge and the number can never disagree at the moment of saving. Toggling the
// flag afterwards does not renumber — see the note on `series` in schema.prisma.
export const seriesFor = (mode, isReferenceOnly) =>
  normMode(mode) === 'transmittal' ? 'TRANS' : isReferenceOnly ? 'REF' : 'REP'

const docId = (series, n) => `${series}-${String(n).padStart(4, '0')}`
const withFaults = { faults: { orderBy: { position: 'asc' } } }

// RTO (Return to Owner) means the device went back untouched — no part was
// consumed. It pairs with any parts code (a defective PCB handed back is
// 50F + RTO), so the action alone carries the meaning. Mirrors RTO_ACTIONS in
// client/src/report.js, which keeps it out of the service totals for the same
// reason.
const RTO_ACTIONS = new Set(['RTO'])
export const isRtoAction = (action) => RTO_ACTIONS.has(String(action ?? '').trim().toUpperCase())

// A snapshot containing an RTO is a reference/record-only document. Detected
// here at save time; the saver can still override it either way, and the flag
// stays editable afterwards via PATCH.
export const hasRtoAction = (snapshot) =>
  (snapshot ?? []).some((e) => (e.faults ?? []).some((f) => isRtoAction(f.action)))

// Deduct stock for materials/faults that match an inventory item (by itemCode,
// case-insensitive). Quantities across the snapshot are summed per item, and
// `out` is incremented (so `avail` = begin - out drops). Unmatched issues are
// ignored. Runs inside the save transaction so it's all-or-nothing.
//
// The skip is per FAULT, not per report: an RTO line returns the device
// untouched and must never draw stock, but a reference-only report that also
// records real part usage still deducts for those parts normally.
async function applyInventoryUsage(tx, snapshot, reference, branch) {
  const used = new Map() // itemCode(upper) -> total qty
  for (const e of snapshot) {
    for (const f of e.faults ?? []) {
      if (isRtoAction(f.action)) continue // returned, not consumed
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

// Next number within a SERIES and branch — each branch keeps its own
// independent run (Makkah REP-0001…, Dammam REP-0001…, and likewise for REF and
// TRANS). Branch '' is the unassigned/legacy series.
//
// Keyed on series rather than mode so taking a REF number never advances REP,
// and vice versa: the two run side by side inside mode='report'.
//
// The lowest number NOT already taken, not the highest-ever plus one — a
// number picked by hand out of order (matching a paper document already
// numbered ahead of where the digital run has reached) must not strand every
// number below it forever. Backfilling old paper reports relies on this: save
// #12, then #13, and the suggestion keeps counting up through the gap instead
// of jumping straight past a #19 someone typed in early.
async function nextDocNumber(series, branch) {
  const rows = await prisma.savedReport.findMany({
    where: { series, branch: branch ?? '' },
    select: { docNumber: true },
  })
  const used = new Set(rows.map((r) => r.docNumber))
  let n = 1
  while (used.has(n)) n++
  return n
}

// ---------------------------------------------------------------------------
// Saving under a date or a number chosen by hand.
//
// Both are normally drawn automatically — the date from the entries, the number
// from the series counter — and both can be overridden at the moment of saving,
// for the report written up a day late or the number that has to match a
// document already issued on paper.
//
// Each is validated here rather than trusted: the client offers the pair it
// rendered, but a save is a write and the request is the only thing that
// reaches this route.
//
// Both answer { value } or { error } instead of throwing. A thrown error would
// reach the error middleware, which replaces every message with "Internal
// server error" in production — and "that number is already taken" is precisely
// the sentence the person saving needs to read.
// ---------------------------------------------------------------------------

// 'YYYY-MM-DD' -> itself; absent -> null (use the entries' own dates). A value
// that is present but not a date is refused rather than ignored: falling back
// would file the report on a day nobody chose.
export function requestedDate(value) {
  if (value == null || value === '') return { value: null }
  const s = String(value).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: 'Report date must be YYYY-MM-DD' }
  const d = new Date(`${s}T00:00:00.000Z`)
  // Rejects 2026-02-31 and friends, which Date happily rolls forward into March.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    return { error: `${s} is not a real date` }
  }
  return { value: s }
}

// The point past which blockNumber runs out of letters (Z999) and the short id
// degrades to a plain number. Past here it is a typo, not a filing decision.
const MAX_DOC_NUMBER = 26 * 999

// A whole number ≥ 1; absent -> null (draw the next one in the series).
export function requestedDocNumber(value) {
  if (value == null || value === '') return { value: null }
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > MAX_DOC_NUMBER) {
    return { error: `Document number must be a whole number between 1 and ${MAX_DOC_NUMBER}` }
  }
  return { value: n }
}

// GET /api/saved-reports - list newest first, plus the next id a Save would mint.
router.get('/', async (req, res, next) => {
  try {
    // Preview the next id for the branch in view (client also derives its own).
    const previewBranch = writeBranch(req, req.query.branch)
    if (previewBranch === null) return res.status(400).json({ error: 'That branch is outside your region' })
    const [reports, repNo, refNo, transNo] = await Promise.all([
      prisma.savedReport.findMany({
        where: branchWhere(req, req.query.branch, req.query.region),
        orderBy: { seq: 'desc' },
        select: {
          id: true, seq: true, docNumber: true, reportId: true, branch: true, mode: true, series: true,
          transmittedBy: true, receivedBy: true, savedAt: true, dateLabel: true, entryCount: true,
          isReferenceOnly: true,
          entries: true, // snapshot, so the client can search inside report data
        },
      }),
      nextDocNumber('REP', previewBranch),
      nextDocNumber('REF', previewBranch),
      nextDocNumber('TRANS', previewBranch),
    ])
    // Per-series "next id" previews so each numbers independently. The client
    // picks between REP and REF by whether the pending save is reference-only.
    res.json({
      nextReportId: docId('REP', repNo),
      nextReferenceId: docId('REF', refNo),
      nextTransmittalId: docId('TRANS', transNo),
      reports,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/saved-reports/daily-text?date=YYYY-MM-DD&mode=report - the same
// combined "Report text" the Report page shows, for every saved report whose
// dateLabel matches that calendar date. Used by the WhatsApp integration's
// scheduled daily send, so the report formatting lives in one place.
router.get('/daily-text', async (req, res, next) => {
  try {
    res.json(
      await dailyReportText({
        where: branchWhere(req, req.query.branch, req.query.region),
        mode: normMode(req.query?.mode),
        date: req.query?.date,
      }),
    )
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
    if (branch === null) return res.status(400).json({ error: 'That branch is outside your region' })
    const entries = await prisma.reportEntry.findMany({
      where: { mode, branch },
      orderBy: [{ reportDate: 'asc' }, { id: 'asc' }],
      include: withFaults,
    })
    if (entries.length === 0) {
      return res.status(400).json({ error: 'Nothing to save — add entries first' })
    }

    // A date chosen by hand re-dates the whole snapshot, so the sheet and the
    // roll-ups built from it (monthly, spare parts, agency) agree on when this
    // work happened. Applied to the snapshot rather than to the working rows
    // because those rows are deleted at the end of this same transaction — the
    // snapshot IS the record from here on.
    const chosenDate = requestedDate(req.body?.reportDate)
    if (chosenDate.error) return res.status(400).json({ error: chosenDate.error })

    const snapshot = entries.map((e) => ({
      reportDate: chosenDate.value ?? new Date(e.reportDate).toISOString().slice(0, 10),
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
    // Auto-detect RTO, but let an explicit isReferenceOnly in the body win, so
    // the saver can mark a normal report as reference-only (or clear a
    // false positive) without a second round-trip.
    const isReferenceOnly =
      req.body?.isReferenceOnly == null ? hasRtoAction(snapshot) : Boolean(req.body.isReferenceOnly)
    // Reference-only is settled before the number is drawn, so a reference-only
    // save is a REF from the start rather than a REP that is corrected later.
    const series = seriesFor(mode, isReferenceOnly)
    const seq = await nextSeq()

    // A number chosen by hand takes the place of the next one in the series.
    // The series itself is NOT chosen: it follows the mode and the RTO rule
    // above, so a document can never be filed under a series its own contents
    // contradict.
    const chosenNumber = requestedDocNumber(req.body?.docNumber)
    if (chosenNumber.error) return res.status(400).json({ error: chosenNumber.error })
    const docNumber = chosenNumber.value ?? (await nextDocNumber(series, branch))

    // Named before the write, so the answer is the id the holder of the other
    // document would recognise rather than a constraint name. The unique index
    // is still the authority — see the P2002 catch below, which covers the gap
    // between this check and the insert.
    if (chosenNumber.value != null) {
      const taken = await prisma.savedReport.findFirst({ where: { series, branch, docNumber } })
      if (taken) {
        return res.status(409).json({
          error: `${shortIdOf(taken)} already exists (saved ${taken.dateLabel || 'earlier'}) — choose another number`,
        })
      }
    }

    const saved = await prisma.$transaction(async (tx) => {
      const created = await tx.savedReport.create({
        data: {
          seq, docNumber, reportId: docId(series, docNumber), branch, mode, series, transmittedBy, receivedBy,
          dateLabel, entryCount: snapshot.length, isReferenceOnly, entries: snapshot,
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
    // Two saves racing for the same hand-picked number: the check above passed
    // for both, and the unique index caught the loser. It is the same answer as
    // the check, so it reads the same way.
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'That document number was just taken — choose another number' })
    }
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
                // Loading must reproduce the saved row exactly — a No Activity
                // fault was stored at quantity 0 (see reportEntry.js), and
                // flooring it back to 1 here resurrected the Device/Agency
                // Summary sections a no-activity day is supposed to have none of.
                quantity: isNoActivityIssue(f.issue)
                  ? Math.max(0, Number(f.quantity) || 0)
                  : Math.max(1, Number(f.quantity) || 1),
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

// PATCH /api/saved-reports/:id - manual override of the reference-only mark
// (the RTO auto-detection at save time is only the starting value).
router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const report = await prisma.savedReport.findUnique({ where: { id }, select: { branch: true } })
    if (!report || !canAccessBranch(req, report.branch)) {
      return res.status(404).json({ error: 'Saved report not found' })
    }
    if (req.body?.isReferenceOnly == null) {
      return res.status(400).json({ error: 'isReferenceOnly is required' })
    }
    const updated = await prisma.savedReport.update({
      where: { id },
      data: { isReferenceOnly: Boolean(req.body.isReferenceOnly) },
      select: { id: true, isReferenceOnly: true },
    })
    res.json(updated)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Saved report not found' })
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
