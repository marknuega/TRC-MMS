/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The two-way entry sync, over HTTP. See ../entrySync.js for what is being
 * synced and, more importantly, what is not and why.
 *
 * Scoped like every other data route: a caller only ever pulls and pushes
 * entries for branches they may write to, so syncing cannot be a way around
 * the branch rules the rest of the app enforces.
 */
import { Router } from 'express'
import { prisma } from '../db.js'
import { branchWhere, canAccessBranch } from '../scope.js'
import { applyChanges, pullChanges, pruneTombstones, skewOf, MAX_CLOCK_SKEW_MS } from '../entrySync.js'

const router = Router()

/**
 * Refuse to sync with a machine whose clock is badly wrong.
 *
 * The winner of a conflict is whichever side says it edited later, so a clock
 * an hour fast wins every argument it is in — including the ones it should
 * lose, quietly, with a result that looks perfectly ordinary afterwards. This
 * cannot make last-write-wins correct. It turns the one failure nobody would
 * notice into a message somebody can act on.
 */
function clockProblem(req) {
  const skew = skewOf(req.get('x-sync-now') ?? req.query.now)
  if (skew === null) return '' // not claimed — an ordinary caller, not a sync client
  if (Math.abs(skew) <= MAX_CLOCK_SKEW_MS) return ''
  const mins = Math.round(Math.abs(skew) / 60000)
  return (
    `This machine's clock is ${mins} minute${mins === 1 ? '' : 's'} ${skew > 0 ? 'ahead of' : 'behind'} the server. ` +
    `Sync decides which of two edits to keep by which happened later, so a clock this far out would silently ` +
    `discard the newer one. Correct the clock and sync again.`
  )
}

// GET /api/sync/entries?since=<iso> - everything changed since, plus deletions.
router.get('/entries', async (req, res, next) => {
  try {
    const problem = clockProblem(req)
    if (problem) return res.status(409).json({ error: problem })
    const where = branchWhere(req, req.query.branch, req.query.region)
    res.json(await pullChanges(prisma, { since: req.query.since, where }))
  } catch (err) {
    next(err)
  }
})

// POST /api/sync/entries - push a batch; last write wins, per entry.
router.post('/entries', async (req, res, next) => {
  try {
    const problem = clockProblem(req)
    if (problem) return res.status(409).json({ error: problem })
    const body = req.body ?? {}
    const result = await applyChanges(
      prisma,
      {
        entries: Array.isArray(body.entries) ? body.entries : [],
        tombstones: Array.isArray(body.tombstones) ? body.tombstones : [],
      },
      { canWrite: (branch) => canAccessBranch(req, branch) },
    )
    // Cheap, and this is the only route that cares — a tombstone table nobody
    // prunes grows for the life of the installation.
    await pruneTombstones(prisma).catch(() => {})
    res.json({ now: new Date().toISOString(), ...result })
  } catch (err) {
    next(err)
  }
})

export default router
