/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Shared Day / Month / Year period selector.
 *
 * A period is stored as a FULL anchor date plus the granularity you are viewing
 * it through — never as a truncated string. That is what lets you flip Year ->
 * Day and land back on the exact day you started from instead of the 1st of
 * January. `periodValue()` does the truncating, and its length (10 / 7 / 4) is
 * also the prefix length report.js matches entry dates against.
 */

import SearchSelect from './SearchSelect'

const pad = (n) => String(n).padStart(2, '0')
export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const KINDS = [
  { kind: 'day', label: 'Day / Date' },
  { kind: 'month', label: 'Month' },
  { kind: 'year', label: 'Year' },
]

export const makePeriod = (kind = 'month', anchor = todayIso()) => ({ kind, anchor })

// 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY' — the prefix an entry date must start with.
export const periodValue = (p) =>
  p?.kind === 'day'
    ? String(p.anchor)
    : p?.kind === 'year'
      ? String(p?.anchor).slice(0, 4)
      : String(p?.anchor).slice(0, 7)

const MONTH_NAMES = [
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

export function periodLabel(p) {
  const [y, m, d] = String(p?.anchor ?? '')
    .split('-')
    .map(Number)
  if (!y) return ''
  if (p.kind === 'year') return String(y)
  if (p.kind === 'month') return `${MONTH_NAMES[m - 1]} ${y}`
  return `${pad(d)} ${MONTH_NAMES[m - 1]} ${y}`
}

// Rebuild an anchor from parts, clamping the day into the target month so that
// picking February off a 31st, or a non-leap year off Feb 29, cannot produce an
// impossible date like 2026-02-31.
function anchorOf(year, month1, day) {
  const lastDay = new Date(year, month1, 0).getDate()
  return `${year}-${pad(month1)}-${pad(Math.min(day, lastDay))}`
}

/**
 * Two form controls: the granularity, then the date/month/year for it.
 *
 * `anyLabel` adds a fourth granularity — no period at all — for the callers
 * where narrowing is optional rather than the point. Choosing it reports null,
 * and a null period draws the granularity control alone: there is no date to
 * pick for "any date", and an input sitting there disabled would only invite
 * someone to try. The monthly views pass no anyLabel and always hold a period,
 * so nothing about them changes.
 */
export function PeriodPicker({ period, onChange, label = 'View by', anyLabel = '' }) {
  const kindField = (
    <label>
      {label}
      <SearchSelect
        value={period?.kind ?? ''}
        onChange={(e) => {
          const kind = e.target.value
          if (!kind) return onChange(null) // only reachable when anyLabel is set
          onChange(period ? { ...period, kind } : makePeriod(kind))
        }}
        options={[
          ...(anyLabel ? [{ value: '', label: anyLabel }] : []),
          ...KINDS.map((k) => ({ value: k.kind, label: k.label })),
        ]}
      />
    </label>
  )
  if (!period) return kindField

  const [y, m, d] = String(period.anchor).split('-').map(Number)
  const set = (anchor) => onChange({ ...period, anchor })

  return (
    <>
      {kindField}
      <label>
        {period.kind === 'day' ? 'Date' : period.kind === 'month' ? 'Month' : 'Year'}
        {period.kind === 'day' && (
          <input type="date" value={period.anchor} onChange={(e) => e.target.value && set(e.target.value)} />
        )}
        {period.kind === 'month' && (
          <input
            type="month"
            value={`${y}-${pad(m)}`}
            onChange={(e) => {
              const [ny, nm] = e.target.value.split('-').map(Number)
              if (ny && nm) set(anchorOf(ny, nm, d))
            }}
          />
        )}
        {period.kind === 'year' && (
          <input
            type="number"
            min="2000"
            max="2100"
            step="1"
            value={y}
            onChange={(e) => {
              const ny = Number(e.target.value)
              if (ny >= 2000 && ny <= 2100) set(anchorOf(ny, m, d))
            }}
          />
        )}
      </label>
    </>
  )
}
