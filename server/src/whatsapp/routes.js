/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// The WhatsApp webhook: technicians file reports by texting a short code.
//
// Two-message flow:
//   1) A batch of fault codes (+ optional tel/issi + technician id) — held as
//      "pending", nothing saved yet.
//   2) The agency code alone (e.g. "PSD") — this both confirms AND supplies the
//      agency, finalizing the save.
//
// Ported from the standalone trc-mms-whatsapp service. Two things changed in
// the move: entries are created through createEntry() rather than by POSTing to
// this app's own API with a service account, and the dedup guard is a Postgres
// table rather than a file on a Railway volume (this service has no disk).
//
// Mounted OUTSIDE /api and before the SPA fallback — see app.js.

import { Router } from 'express'
import { decodeBatch, decodeAgencyOnly } from './decoder.js'
import { sendText } from './send.js'
import { alreadyProcessed } from './dedup.js'
import { fullCodeMap } from '../routes/codemap.js'
import { parseEntry, createEntry } from '../reportEntry.js'
import { dailyReportText } from '../dailyText.js'

const router = Router()

const allowedSenders = (process.env.WA_ALLOWED_SENDERS || '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean)

const REPORT_TRIGGERS = ['report', 'ulat', 'export']
const isReportRequest = (text) => REPORT_TRIGGERS.includes(String(text ?? '').trim().toLowerCase())

// The branch every texted entry is tagged with. "All Branches" collapses to
// blank exactly as writeBranch() does, so the two write paths agree.
function botBranch() {
  const b = String(process.env.TRC_MMS_BRANCH ?? '').trim()
  return b === 'All Branches' ? '' : b
}

// --- Pending batches awaiting agency confirmation ---
// In-memory on purpose: the window is 10 seconds, so the only thing a redeploy
// can lose is a batch a technician is mid-confirmation on, and they simply
// resend. Persisting it would trade that for a table to keep clean.
const CONFIRM_WINDOW_MS = 10 * 1000
const pendingBatches = new Map() // from -> { batch, timestamp }

function sweepPendingBatches() {
  const now = Date.now()
  for (const [key, { timestamp }] of pendingBatches) {
    if (now - timestamp > CONFIRM_WINDOW_MS) pendingBatches.delete(key)
  }
}

function formatBatchSummary(batch, agencyCode) {
  const groupLines = batch.groups.map((g) => {
    const faultList = g.faults
      .map((f) => `${f.componentName} (${f.actionCode}) ${f.quantity} ${f.companyName.slice(0, 3).toUpperCase()}`)
      .join(', ')
    return `(${g.equipmentType} ${g.equipmentModel}) ${faultList}.`
  })

  const contactSuffix = [batch.telNumber, batch.issiNumber]
    .filter(Boolean)
    .map((v) => `***${v}`)
    .join(' ')

  return (
    `✅ Logged (verified):\n` +
    groupLines.join('\n') +
    `\n${agencyCode}${contactSuffix ? ` ${contactSuffix}` : ''} ${batch.techName}\n` +
    `Time: ${new Date(batch.timestamp).toLocaleString('en-PH', { timeZone: process.env.TZ || 'Asia/Riyadh' })}`
  )
}

/** Save one equipment group as a report entry. Returns nothing; throws on failure. */
async function saveGroup(batch, group, agencyCode) {
  const { data, error } = parseEntry({
    reportDate: batch.timestamp.slice(0, 10),
    technician: batch.techName.toUpperCase(),
    agency: agencyCode,
    telNumber: batch.telNumber || '',
    issiNumber: batch.issiNumber || '',
    mode: 'report',
    model: group.equipmentModel,
    type: group.equipmentType.toUpperCase(),
    comment: '',
    faults: group.faults.map((f) => ({
      issue: f.componentName.toUpperCase(),
      quantity: f.quantity,
      action: f.actionName.toUpperCase(),
      company: f.companyName,
      status: f.actionName,
    })),
  })
  if (error) throw new Error(error)

  // There is no session here, so the branch comes from configuration rather
  // than from a user. Normalised the same way writeBranch() does for an admin —
  // which is what the bot's service account was — so an entry filed by text is
  // tagged identically to one filed in the browser.
  data.branch = botBranch()
  await createEntry(data)
}

// --- Meta's webhook verification handshake ---
// A GET, which is why this router must be mounted before the SPA fallback:
// that fallback answers any unmatched GET with index.html, and Meta would see
// HTML instead of the challenge and mark the callback URL invalid.
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WA_WEBHOOK_VERIFY_TOKEN) {
    console.log('[whatsapp] webhook verified successfully')
    return res.status(200).send(challenge)
  }
  return res.sendStatus(403)
})

// --- Incoming messages ---
router.post('/webhook', async (req, res) => {
  res.sendStatus(200) // ack immediately — Meta retries aggressively on non-200s

  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) return

    // Records the id as a side effect, so a retry of THIS delivery is caught
    // even if the processing below throws.
    let duplicate
    try {
      duplicate = await alreadyProcessed(message.id)
    } catch (err) {
      // The dedup table is unreachable. Fail CLOSED: processing without a
      // working guard risks filing the same report twice on Meta's next retry,
      // and a duplicate entry is harder to notice than a missing reply.
      console.error('[whatsapp] dedup check failed, dropping message:', err.message)
      return
    }
    if (duplicate) {
      console.log(`[whatsapp] ignored duplicate message id: ${message.id} (Meta retry, most likely)`)
      return
    }

    const from = message.from
    const text = message.text?.body
    if (!text) return

    if (allowedSenders.length > 0 && !allowedSenders.includes(from)) {
      console.warn(`[whatsapp] ignored message from unauthorized number: ${from}`)
      return
    }

    if (isReportRequest(text)) {
      try {
        const branch = botBranch()
        const { text: reportText, count, dateLabel } = await dailyReportText({
          where: branch ? { branch } : {},
        })
        await sendText(
          from,
          count === 0 ? `No saved reports for ${dateLabel} yet.` : reportText,
        )
      } catch (err) {
        console.error('[whatsapp] report send failed:', err.message)
        await sendText(from, "⚠️ Couldn't generate the report right now. Please try again later.")
      }
      return
    }

    const map = await fullCodeMap()

    sweepPendingBatches()
    const pending = pendingBatches.get(from)
    const agencyAttempt = decodeAgencyOnly(text, map)

    // --- Case 1: an agency code AND a pending batch — this is the confirmation ---
    if (agencyAttempt && pending) {
      pendingBatches.delete(from)
      const { batch } = pending

      // Save first, THEN confirm — so "Logged (verified)" only goes out when the
      // record actually landed. Any group that fails is surfaced to the
      // technician instead of silently looking saved.
      const failed = []
      for (const group of batch.groups) {
        try {
          await saveGroup(batch, group, agencyAttempt.agencyCode)
        } catch (err) {
          console.error(`[whatsapp] save failed for ${group.equipmentType} ${group.equipmentModel}:`, err.message)
          failed.push(`${group.equipmentType} ${group.equipmentModel}`)
        }
      }

      if (failed.length === 0) {
        await sendText(from, formatBatchSummary(batch, agencyAttempt.agencyCode))
      } else {
        const savedOk = batch.groups.length - failed.length
        await sendText(
          from,
          `⚠️ Could NOT save to TRC MMS: ${failed.join(', ')}.\n` +
            (savedOk > 0 ? `(${savedOk} of ${batch.groups.length} item(s) saved.)\n` : '') +
            `The failed item(s) were NOT recorded — please resend the fault code(s) in a moment, ` +
            `and tell the admin if it keeps failing.`,
        )
      }
      return
    }

    // --- Case 2: an agency code with nothing pending to confirm ---
    if (agencyAttempt && !pending) {
      await sendText(
        from,
        `⚠️ No pending batch to confirm. Send the fault code(s) first before sending the agency (${agencyAttempt.agencyCode}).`,
      )
      return
    }

    // --- Case 3: try to parse as a new batch ---
    const result = decodeBatch(text, map)
    if (!result.ok) {
      await sendText(from, `⚠️ ${result.reason}`)
      return
    }

    pendingBatches.set(from, { batch: result.batch, timestamp: Date.now() })

    const faultCount = result.batch.groups.reduce((n, g) => n + g.faults.length, 0)
    await sendText(
      from,
      `📝 Received ${faultCount} fault(s) for ${result.batch.techName}.\n` +
        `To confirm, send the AGENCY CODE (e.g. PSD) within 10 seconds.`,
    )
  } catch (err) {
    console.error('[whatsapp] error handling incoming message:', err)
  }
})

export default router
