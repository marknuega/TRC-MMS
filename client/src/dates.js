/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * How a date is written wherever a person reads one: 27 August 2026.
 *
 * Day, month, year — the British and international convention, and the one
 * form that cannot be misread. The app had three at once: 27/08/2026 from
 * toLocaleDateString('en-GB'), "Aug. 27, 2026" from the printed report, and
 * whatever the browser's locale produced for a timestamp. The first is the
 * dangerous one — 05/10/2026 is the fifth of October to half the world and the
 * tenth of May to the other half, and a spare-parts report crossing a border
 * has no way to say which was meant. Spelling the month removes the question.
 *
 * DISPLAY ONLY. SavedReport.dateLabel is STORED as dd/mm/yyyy and read back as
 * data — client/src/report.js derives the dashboard's months from it, and the
 * WhatsApp daily text finds today's report by matching it. That format is a
 * contract with every row already saved, so it is left exactly as it is and
 * formatted on the way to the screen instead. parseDateLabel below is what
 * turns one back into a date for that purpose, and it takes the long form too
 * so nothing breaks if a stored label is ever written the other way.
 *
 * No React and no Intl: the server imports this (dailyText.js builds the same
 * text the page shows), and Intl's month names follow the machine's locale —
 * which would have a report print in Arabic on one PC and English on the next.
 */

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const MONTH_KEY = new Map(
  MONTHS.flatMap((m, i) => [
    [m.toUpperCase(), i],
    [m.slice(0, 3).toUpperCase(), i],
  ]),
)

const two = (n) => String(n).padStart(2, '0')

/**
 * Anything the app holds a date in, as a UTC {y, m, d} — or null.
 *
 * UTC throughout, deliberately. A report date is a calendar day, not a moment:
 * read in local time, the ISO midnight the database stores becomes the previous
 * evening anywhere west of Greenwich, and a day's work files itself under
 * yesterday. Every branch of this reads the UTC components for that reason.
 */
function parts(value) {
  if (value == null || value === '') return null
  // Already a plain calendar day — take the digits, never a Date, so no zone
  // can shift it.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (iso) return { y: +iso[1], m: +iso[2] - 1, d: +iso[3] }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(value))
  if (dmy) return { y: +dmy[3], m: +dmy[2] - 1, d: +dmy[1] }
  const long = /^(\d{1,2})\s+([A-Za-z.]+)\s+(\d{4})/.exec(String(value))
  if (long) {
    const m = MONTH_KEY.get(long[2].replace(/\./g, '').toUpperCase())
    if (m !== undefined) return { y: +long[3], m, d: +long[1] }
  }
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }
}

/** '2026-08-27' | '27/08/2026' | Date -> '27 August 2026'. '' for anything unreadable. */
export function formatDate(value) {
  const p = parts(value)
  return p ? `${p.d} ${MONTHS[p.m]} ${p.y}` : ''
}

/** The same, with the clock: '27 August 2026, 14:32'. For a timestamp, not a report date. */
export function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  // Local time here, and correctly: a saved-at stamp is a moment somebody was
  // at the keyboard, so it belongs in the reader's own clock — the opposite of
  // a report DATE, which is a calendar day and must not move.
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** A stored label back to its calendar parts, for grouping and matching. */
export const parseDateLabel = (value) => parts(value)

/** '2026-08' from anything, for the monthly dashboard. '' when unreadable. */
export function monthKeyOf(value) {
  const p = parts(value)
  return p ? `${p.y}-${two(p.m + 1)}` : ''
}

/**
 * The STORED form of a report label: dd/mm/yyyy.
 *
 * Not a display format and not to be used as one. It exists so the one place
 * that writes SavedReport.dateLabel and the one place that reads it back agree
 * in writing rather than by coincidence.
 */
export function storedDateLabel(value) {
  const p = parts(value)
  return p ? `${two(p.d)}/${two(p.m + 1)}/${p.y}` : ''
}
