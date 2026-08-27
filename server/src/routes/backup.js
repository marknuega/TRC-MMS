/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The two routes that move a whole database between installations — the live
 * server and an offline desktop machine being the pair they were written for.
 *
 * Admin-only, and admin ONLY: the router mounted at /api/admin admits directors
 * too, and a director runs one region rather than the installation. An export
 * is every branch's reports and every account's password hash in one file, and
 * an import replaces all of it.
 *
 * See ../backup.js for what these carry and why the ordinary API cannot.
 */
import { Router } from 'express'
import { prisma } from '../db.js'
import { adminRequired } from '../auth.js'
import { exportAll, importAll, validateExport, resyncSequences, SKIPPABLE, TABLES } from '../backup.js'

const router = Router()
router.use(adminRequired)

// GET /api/backup/export - the whole database as one document.
//
// Sent as a download with a dated filename, because the overwhelmingly common
// thing to do with it is keep it: a restore is only ever as good as the file
// somebody actually saved, and a JSON blob rendered into a browser tab is a
// file nobody saved.
router.get('/export', async (req, res, next) => {
  try {
    const doc = await exportAll(prisma)
    const stamp = doc.exportedAt.slice(0, 19).replace(/[:T]/g, '-')
    res.setHeader('Content-Disposition', `attachment; filename="trc-mms-${doc.edition}-${stamp}.json"`)
    res.json(doc)
  } catch (err) {
    next(err)
  }
})

// GET /api/backup/counts - what is here, without moving any of it.
//
// So a machine about to be overwritten can say what it is about to lose, and
// the person clicking can see that the thing they are copying FROM is the one
// with the reports in it. Cheap enough to poll.
router.get('/counts', async (req, res, next) => {
  try {
    const counts = {}
    for (const { key, model } of TABLES) counts[key] = await prisma[model].count()
    res.json({ edition: process.env.APP_EDITION || 'server', counts })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/backup/import - replace this database with the document posted.
 *
 * The body is an export document VERBATIM, so a file saved from /export can be
 * posted back without unwrapping. Everything else rides on the query string:
 *
 *   ?confirm=replace          required — see below
 *   ?skip=users,processedMessages
 *
 * `confirm` is not ceremony. This route destroys every row it is given a
 * replacement for, and it is one fetch away from any admin session — a
 * mis-aimed request with a stale body would wipe a live server and answer 200.
 * Requiring the word makes that impossible to do by accident.
 */
router.post('/import', async (req, res, next) => {
  try {
    if (String(req.query.confirm) !== 'replace') {
      return res.status(400).json({
        error: 'This REPLACES every table in the export. Re-send with ?confirm=replace once you mean it.',
      })
    }
    const doc = req.body
    const problem = validateExport(doc)
    if (problem) return res.status(400).json({ error: problem })

    const skip = String(req.query.skip ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const unknown = skip.filter((s) => !(s in SKIPPABLE))
    if (unknown.length) {
      return res.status(400).json({
        error: `Cannot skip ${unknown.join(', ')}. Skippable: ${Object.keys(SKIPPABLE).join(', ')}.`,
      })
    }

    // One transaction: a half-restored database — this month's inventory beside
    // last month's reports — is not a state anyone could reason about after.
    // The timeout is generous because this is a whole database, not a request.
    const result = await prisma.$transaction((tx) => importAll(tx, doc, { skip }), {
      timeout: 120_000,
      maxWait: 15_000,
    })
    // Outside the transaction: on PostgreSQL an explicit id does not advance
    // the sequence behind it, so without this the next ordinary save collides
    // with an imported row — the restore looks perfect and the first thing
    // anybody types fails. No-op on the desktop build's SQLite.
    result.resequenced = await resyncSequences(prisma, { skip })
    // Said plainly because the admin who posted this may have just deleted
    // their own account: nothing references a user by foreign key, so the
    // import is sound either way, but their session now names a row that is
    // gone and the next request is anonymous.
    result.signedOut = !skip.includes('users')
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
