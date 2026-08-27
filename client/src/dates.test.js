/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { formatDate, formatDateTime, monthKeyOf, storedDateLabel, parseDateLabel } from './dates.js'

describe('formatDate writes one date format, everywhere', () => {
  test('from the ISO a report date is stored as', () => {
    assert.equal(formatDate('2026-08-27'), '27 August 2026')
    assert.equal(formatDate('2026-08-27T00:00:00.000Z'), '27 August 2026')
  })

  test('from the dd/mm/yyyy a saved report label holds', () => {
    assert.equal(formatDate('27/08/2026'), '27 August 2026')
    // The whole reason for spelling the month: this one is unreadable as digits.
    assert.equal(formatDate('05/10/2026'), '5 October 2026')
  })

  test('from its own output, so formatting twice is harmless', () => {
    assert.equal(formatDate(formatDate('2026-08-27')), '27 August 2026')
  })

  test('from a Date', () => {
    assert.equal(formatDate(new Date('2026-01-01T00:00:00.000Z')), '1 January 2026')
  })

  test('anything unreadable is empty, never "Invalid Date"', () => {
    for (const bad of [null, undefined, '', 'not a date', {}]) assert.equal(formatDate(bad), '')
  })

  // A report date is a CALENDAR DAY. Read in local time the stored midnight
  // becomes the previous evening west of Greenwich, filing a day's work under
  // yesterday — so the day components are read in UTC.
  test('a stored midnight does not slip to the day before', () => {
    assert.equal(formatDate('2026-03-01T00:00:00.000Z'), '1 March 2026')
    assert.equal(formatDate('2026-01-01T00:00:00.000Z'), '1 January 2026')
  })
})

describe('monthKeyOf reads every shape dateLabel has ever had', () => {
  test('the stored dd/mm/yyyy', () => assert.equal(monthKeyOf('27/08/2026'), '2026-08'))
  test('the long form', () => assert.equal(monthKeyOf('27 August 2026'), '2026-08'))
  test('ISO', () => assert.equal(monthKeyOf('2026-08-27'), '2026-08'))
  test('an abbreviated month, as the printed report used to write', () =>
    assert.equal(monthKeyOf('27 Aug. 2026'), '2026-08'))
  test('a multi-date label keeps its first date', () => assert.equal(monthKeyOf('27/08/2026 (+2 more)'), '2026-08'))
  test('unreadable is empty, so it simply does not plot a month', () => assert.equal(monthKeyOf('later'), ''))
})

describe('storedDateLabel is the format on disk, and is not the display one', () => {
  test('pads to dd/mm/yyyy so every stored row sorts and matches alike', () => {
    assert.equal(storedDateLabel('2026-01-05'), '05/01/2026')
    assert.equal(storedDateLabel('27 August 2026'), '27/08/2026')
  })
  test('round trips against the display format without drifting', () => {
    assert.equal(formatDate(storedDateLabel('2026-08-27')), '27 August 2026')
  })
})

describe('formatDateTime', () => {
  test('spells the month and keeps a 24-hour clock', () => {
    // Built in local time on purpose — a saved-at stamp is a moment at a
    // keyboard, not a calendar day — so the expectation is built the same way.
    const d = new Date(2026, 7, 27, 9, 5)
    assert.equal(formatDateTime(d), '27 August 2026, 09:05')
  })
  test('unreadable is empty', () => assert.equal(formatDateTime('nope'), ''))
})

test('parseDateLabel hands back the calendar parts', () => {
  assert.deepEqual(parseDateLabel('27/08/2026'), { y: 2026, m: 7, d: 27 })
  assert.equal(parseDateLabel('nonsense'), null)
})
