/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDate,
  formatDateTime,
  monthKeyOf,
  storedDateLabel,
  parseDateLabel,
  dateMatches,
  dateOptions,
  dateFiltered,
  NO_DATE_PICK,
} from './dates.js'

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

// Narrowing a Saved card to a day, a month or a year. The labels are the
// dd/mm/yyyy a saved report stores; the month in a pick is 0-based.
describe('the saved-list date filter', () => {
  const LABELS = ['30/08/2026', '27/08/2026', '05/10/2026', '14/01/2025']

  const kept = (pick) => LABELS.filter((l) => dateMatches(l, pick))

  test('nothing picked keeps everything', () => {
    assert.deepEqual(kept(NO_DATE_PICK), LABELS)
    assert.deepEqual(kept({}), LABELS)
    assert.equal(dateFiltered(NO_DATE_PICK), false)
  })

  test('a year, a month and a day each narrow on their own', () => {
    assert.deepEqual(kept({ y: '2026' }), ['30/08/2026', '27/08/2026', '05/10/2026'])
    assert.deepEqual(kept({ m: '7' }), ['30/08/2026', '27/08/2026']) // August
    assert.deepEqual(kept({ d: '5' }), ['05/10/2026'])
  })

  test('they combine — one specific day', () => {
    assert.deepEqual(kept({ y: '2026', m: '7', d: '30' }), ['30/08/2026'])
    assert.deepEqual(kept({ y: '2025', m: '7' }), []) // no August 2025
  })

  // '0' is January and a real choice; '' is "any". The one place a 0-based
  // month and an empty-means-any convention could quietly meet.
  test('January is a choice, not an absent one', () => {
    assert.deepEqual(kept({ m: '0' }), ['14/01/2025'])
    assert.equal(dateFiltered({ m: '0' }), true)
    assert.equal(dateFiltered({ y: '', m: '', d: '' }), false)
  })

  test('a label nothing can read is excluded while a filter is on, and kept while it is off', () => {
    assert.equal(dateMatches('not a date', { y: '2026' }), false)
    assert.equal(dateMatches('not a date', NO_DATE_PICK), true)
  })

  describe('the choices offered', () => {
    test('are only the years, months and days actually held', () => {
      const o = dateOptions(LABELS)
      assert.deepEqual(o.years, [2026, 2025]) // newest first
      assert.deepEqual(o.months, [0, 7, 9]) // January, August, October
      assert.deepEqual(o.days, [5, 14, 27, 30])
    })

    test('each list narrows to the pick above it', () => {
      assert.deepEqual(dateOptions(LABELS, { y: '2025' }).months, [0])
      assert.deepEqual(dateOptions(LABELS, { y: '2026' }).months, [7, 9])
      assert.deepEqual(dateOptions(LABELS, { y: '2026', m: '7' }).days, [27, 30])
      // The years never narrow — they are the top of the chain.
      assert.deepEqual(dateOptions(LABELS, { y: '2026', m: '7' }).years, [2026, 2025])
    })

    test('an empty list offers nothing rather than throwing', () => {
      assert.deepEqual(dateOptions([]), { years: [], months: [], days: [] })
      assert.deepEqual(dateOptions(undefined), { years: [], months: [], days: [] })
    })
  })
})
