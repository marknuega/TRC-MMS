/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// Creating a report entry, shared by the two things that create one: the
// POST /api/reports route (a signed-in user in the browser) and the WhatsApp
// webhook (a technician texting a code).
//
// The WhatsApp side used to reach this logic by POSTing to /api/reports over
// HTTP with a service-account login, back when it ran as a separate service.
// Now that it runs in this process, it calls createEntry directly: no second
// account, no session cookie to keep alive, and no database write making a
// round trip through the network stack back into the same process.
//
// Validation lives here rather than in the route so both callers get it. The
// route owns only what is request-shaped: which branch the caller may write to.

import { prisma } from './db.js'
// A stand-in Tel prefix is typed to select a model the real prefix cannot name
// (107 the SRG3900 bike, 108 the desktop) and is swapped back for the real one
// here, at the one point every entry passes through — the browser's POST and
// PUT and the WhatsApp webhook alike. Imported rather than restated: the rule
// is written down beside the prefix matcher it exists because of, and auth.js
// already reads that module the same way.
import { telForModel, mergeOptions } from '../../client/src/options.js'

// Actions whose "fault" is the whole device — no component issue needed.
const DEVICE_LEVEL = new Set(['PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE'])

// "No Activity" is not a fault: nothing was done, so there is no action to
// name. Matched the same way the client does (client/src/options.js) — name
// with case and punctuation stripped, prefix rather than exact, so "No
// Activity", "No-Activity" and "No Activity Today" are all the one thing.
export const isNoActivityIssue = (issue) => /^NOACTIVITY/.test(String(issue ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''))

export const withFaults = { faults: { orderBy: { position: 'asc' } } }

export const repId = (seq) => `REP-${String(seq).padStart(4, '0')}`

// Turn a Date/ISO into the YYYY-MM-DD key we group reports by.
export const dateKey = (value) => new Date(value).toISOString().slice(0, 10)

/**
 * The Tel number as it should be stored — see telForModel.
 *
 * Reads the admin's live models list, because a stand-in is set in Manage
 * inputs and must take effect without a release. mergeOptions applies the same
 * fallbacks the browser applies, so an install that has never saved the
 * category still gets the shipped stand-ins.
 *
 * A failed read gives the number back untouched rather than failing the save:
 * an entry stored with the prefix that was typed is a wrong prefix someone can
 * correct, an entry that would not save is work lost.
 */
async function settledTel(tel, model) {
  if (!tel || model === '-') return tel // nothing to swap, and no model to swap it for
  try {
    const row = await prisma.appOptions.findUnique({ where: { id: 1 } })
    return telForModel(tel, model, mergeOptions(row?.data ?? {}).models)
  } catch {
    return tel
  }
}

export async function parseEntry(body) {
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
  // Settled against the Model decided above, not the raw body: an entry saved
  // with no model keeps whatever number it was given.
  const telNumber = (await settledTel(String(body?.telNumber ?? '').trim(), model)) || '-'
  const issiNumber = String(body?.issiNumber ?? '').trim() || '*'

  const rawFaults = Array.isArray(body?.faults) ? body.faults : []
  const faults = rawFaults
    .map((f) => ({
      issue: String(f?.issue ?? '').trim(),
      // Floored at 1 — a row worth writing down is a row of at least one
      // thing — except "No Activity", where 0 is the whole point (see
      // client/src/App.jsx's withSavedQuantity, which this mirrors).
      quantity: isNoActivityIssue(f?.issue) ? Math.max(0, Number(f?.quantity) || 0) : Math.max(1, Number(f?.quantity) || 1),
      action: String(f?.action ?? '').trim().toUpperCase(),
      company: String(f?.company ?? '').trim().toUpperCase(),
      status: String(f?.status ?? '').trim(),
    }))
    // Keep a fault if it names an issue, or is a device-level action (issue optional).
    .filter((f) => f.issue !== '' || DEVICE_LEVEL.has(f.action))
    .map((f, i) => ({ ...f, position: i }))

  if (faults.length === 0) return { error: 'At least one fault is required (issue, or a device-level action)' }

  // Actions/companies are user-managed via /api/options, so we only require a
  // non-empty action rather than a fixed whitelist.
  const missingAction = faults.find((f) => !f.action && !isNoActivityIssue(f.issue))
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

/** Ensure a Report row (and its REP-#### seq) exists for a date; returns the seq. */
export async function ensureReportSeq(tx, reportDate) {
  const existing = await tx.report.findUnique({ where: { reportDate } })
  if (existing) return existing.seq
  const max = await tx.report.aggregate({ _max: { seq: true } })
  const seq = (max._max.seq ?? 0) + 1
  await tx.report.create({ data: { reportDate, seq } })
  return seq
}

/**
 * Create one entry and return it with its REP-#### id.
 * `data` must already be branch-tagged by the caller — only the caller knows
 * whether that came from a session or from configuration.
 */
export async function createEntry(data) {
  return prisma.$transaction(async (tx) => {
    const seq = await ensureReportSeq(tx, data.reportDate)
    const entry = await tx.reportEntry.create({ data, include: withFaults })
    return { ...entry, reportId: repId(seq) }
  })
}
