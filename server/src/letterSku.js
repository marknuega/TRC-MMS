/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The letter series an inventory SKU is filed under.
 *
 *     MOT-MAK-1117-1   ->  MOT-MAK-1117A
 *     MOT-MAK-1117-2   ->  MOT-MAK-1117B
 *     MOT-MAK-1116     ->  MOT-MAK-1116A
 *
 * A is the base series, so a SKU that never carried a suffix gains one rather
 * than staying the odd shape out — after this every SKU ends in a letter, and
 * "the 1117s" is a thing you can read down a column instead of a thing you
 * have to know.
 *
 * The COMPANY prefix is untouched and unaffected: it is read from the segment
 * before the FIRST hyphen (client/src/company.js), and this only ever rewrites
 * the tail. MOT-MAK-1117-1 and MOT-MAK-1117A are both MOT.
 *
 * No Prisma in this file: the migration script imports it, and so does its
 * test, which has no database to talk to.
 */

/** A-Z for 1-26, or '' for anything outside it. There is no 27th letter. */
export const letterFor = (n) => (Number.isInteger(n) && n >= 1 && n <= 26 ? String.fromCharCode(64 + n) : '')

/**
 * What one SKU becomes.
 *
 *   { to }     — rename it to this
 *   { done }   — already on the letter series, leave it
 *   { skip }   — cannot be done, and why, in words meant for the console
 *
 * A reason rather than an approximation for the cases that cannot be done: a
 * suffix past -26 has no letter, and a SKU whose stem does not end in a digit
 * has nothing to hang one off. Both are reported rather than guessed at, since
 * a SKU is the thing every ledger row and every count is keyed by.
 */
export function letterSku(sku) {
  const raw = String(sku ?? '').trim()
  if (!raw) return { skip: 'blank' }

  // Already on the letter series — a digit then a single letter, and nothing
  // after it. Checked FIRST so re-running the migration is free rather than a
  // march to MOT-MAK-1117AA.
  if (/\d[A-Za-z]$/.test(raw)) return { done: true }

  // -1, -2, -13. The stem is everything before that final hyphen.
  //
  // Two conditions, because "-1116" and "-1" are the same shape and mean
  // opposite things: MOT-MAK-1116 is one item, MOT-MAK-1117-1 is the first of
  // several. What separates them is what comes BEFORE the hyphen — a suffix
  // qualifies something already numbered, so the stem has to end in a digit
  // (MOT-MAK-1117 does, MOT-MAK does not) — and how big the number is, since
  // a series that ran to 1116 is not a series, it is a part number.
  const numbered = raw.match(/^(.*\d)-(\d{1,2})$/)
  if (numbered) {
    const [, stem, digits] = numbered
    const letter = letterFor(Number(digits))
    if (!letter) return { skip: `suffix -${digits} is past -26, which has no letter` }
    return { to: `${stem}${letter}` }
  }

  // No suffix to convert: this is the first of its stem, and A is what "first"
  // is called from here on.
  if (/\d$/.test(raw)) return { to: `${raw}A` }

  return { skip: 'ends in neither a number suffix nor a digit' }
}
