/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// Tracks WhatsApp message ids (wamid) already acted on, so a retried webhook
// delivery of the same message is never processed twice.
//
// Keyed on the message's own id rather than on decoded text within a time
// window, so it catches a retry no matter how much later it arrives — Meta has
// redelivered ~40 minutes after the first attempt.
//
// The bot kept this in a JSON file on its Railway volume. This service has no
// volume, so it lives in Postgres: an in-memory Map would be forgotten on every
// redeploy, and this app redeploys far more often than the bot did.

import { prisma } from '../db.js'

// Meta does not retry forever, so ids need not be kept forever.
const RETENTION_DAYS = 30

// Prune at most once an hour. The sweep is cheap but pointless to run on every
// message, and the retention window is measured in weeks — an hour of slack in
// when rows disappear changes nothing.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000
let lastPrune = 0

/**
 * Returns true if this message id was already processed; otherwise records it
 * and returns false. Callers must skip processing entirely on true.
 *
 * Recording happens BEFORE the caller does its work, so a retry of this same
 * delivery is caught even if that work then throws. A lost message is visible —
 * the technician gets no reply and resends — whereas a duplicate silently files
 * a second report.
 */
export async function alreadyProcessed(messageId) {
  if (!messageId) return false

  try {
    await prisma.processedMessage.create({ data: { messageId } })
  } catch (err) {
    // P2002 = unique violation: another delivery of this id got here first.
    // That is the whole point of the table, so it is a normal answer, not an
    // error. Anything else is a real database problem and must not be
    // swallowed into "not a duplicate" — see the caller's fail-closed handling.
    if (err?.code === 'P2002') return true
    throw err
  }

  void prune()
  return false
}

/** Drop ids past the retention window. Never throws — pruning is housekeeping. */
async function prune() {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  try {
    await prisma.processedMessage.deleteMany({
      where: { processedAt: { lt: new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
    })
  } catch (err) {
    console.error('[whatsapp/dedup] prune failed:', err.message)
  }
}
