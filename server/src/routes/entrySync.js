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
 *
 * THERE IS NO CLOCK CHECK HERE, and there used to be. While the winner of a
 * conflict was whichever side claimed the later timestamp, a machine with a
 * wrong clock won arguments it should have lost, so this route measured the
 * skew and refused above five minutes. The ordering is a counter now and
 * consults no clock at all, which makes the check meaningless: a machine an
 * hour out syncs correctly, because its clock was never what decided anything.
 * The refusal went with it rather than being left in place to reject syncs
 * that would have been perfectly correct.
 */
import { Router } from 'express'
import { prisma } from '../db.js'
import { branchWhere, canAccessBranch } from '../scope.js'
import { applyChanges, pullChanges, pruneTombstones, currentSeq } from '../entrySync.js'

const router = Router()

// GET /api/sync/entries?since=<seq> - everything changed since, plus deletions.
// `since` is a change-sequence number this server handed out on a previous
// pull, not a time and not the caller's own counter.
router.get('/entries', async (req, res, next) => {
  try {
    const where = branchWhere(req, req.query.branch, req.query.region)
    res.json(await pullChanges(prisma, { since: req.query.since, where }))
  } catch (err) {
    next(err)
  }
})

// POST /api/sync/entries - push a batch; the higher revision wins, per entry.
router.post('/entries', async (req, res, next) => {
  try {
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
    res.json({ seq: await currentSeq(prisma), ...result })
  } catch (err) {
    next(err)
  }
})

export default router
