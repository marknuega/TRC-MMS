/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// The combined "Report text" for a calendar date — the same text the Report
// page shows, built from every saved report whose dateLabel matches.
//
// Shared by GET /api/saved-reports/daily-text (a signed-in user, or an external
// caller) and the WhatsApp webhook, so a technician texting "report" gets
// byte-for-byte what the page would have shown. The formatting itself lives in
// client/src/report.js and is not duplicated here.

import { prisma } from './db.js'
import { buildDateReport, buildTxt, shortDocId, seriesOf } from '../../client/src/report.js'

export const dmy = (value) => {
  const d = new Date(value)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

// Branch-prefixed id, e.g. "MAKKAH-REP-0001" — mirrors the client's repLabel()
// so the WhatsApp-bound text matches what the Report page displayed.
export const repLabel = (id, branch, mode) =>
  `${branch ? `${branch.toUpperCase()}-` : ''}${mode === 'transmittal' ? String(id ?? '-').replace('REP-', 'TRANS-') : id ?? '-'}`

/**
 * @param {object} opts
 * @param {object} opts.where branch filter, already resolved by the caller
 * @param {string} opts.mode 'report' | 'transmittal'
 * @param {string|Date} [opts.date] defaults to today
 * @returns {Promise<{text: string, count: number, dateLabel: string}>}
 */
export async function dailyReportText({ where = {}, mode = 'report', date } = {}) {
  const dateLabel = dmy(date ?? new Date())
  const reports = await prisma.savedReport.findMany({
    // Reference-only records are left out: this is the day's activity, sent to
    // a technician who asked for "report", and a document kept purely for the
    // record is not part of it. It stays exportable on its own from the app.
    where: { ...where, mode, dateLabel, isReferenceOnly: false },
    orderBy: { seq: 'asc' },
  })

  if (reports.length === 0) return { text: '', count: 0, dateLabel }

  const text = reports
    .map((r) =>
      buildTxt(
        buildDateReport(r.dateLabel, repLabel(r.reportId, r.branch, r.mode), r.entries, {
          branch: r.branch,
          mode: r.mode,
          // Same short id the page shows — shortDocId is imported rather than
          // mirrored, so unlike repLabel above there is no second copy to drift.
          shortId: shortDocId(r.branch, seriesOf(r), r.docNumber),
        }),
      ),
    )
    .join('\n\n\n')

  return { text, count: reports.length, dateLabel }
}
