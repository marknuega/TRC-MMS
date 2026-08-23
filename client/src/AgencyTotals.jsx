/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { useMemo, useState } from 'react'
import { agencyBlocks, foldMaintenance } from './report'
import { ALL_BRANCHES } from './options'
import SearchSelect from './SearchSelect'

const today = () => new Date().toISOString().slice(0, 10)
const up = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()

// yyyy-mm-dd (an entry's own service date) -> Date (local midnight), or null.
function parseIso(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}

// Inclusive [start, end] for the period containing refDate.
function periodRange(refDate, period) {
  const d = new Date(refDate)
  if (period === 'year') return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear(), 11, 31)]
  if (period === 'month')
    return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)]
  // day: the single date itself — start and end are the same midnight, which the
  // caller's `d < start || d > end` test treats as inclusive.
  if (period === 'day')
    return [new Date(d.getFullYear(), d.getMonth(), d.getDate()), new Date(d.getFullYear(), d.getMonth(), d.getDate())]
  // week: Sunday–Saturday containing refDate
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return [start, end]
}

const fmt = (d) => d.toLocaleDateString('en-GB')

export default function AgencyTotals({
  saved,
  branches,
  embedded = false,
  lockBranch = null,
  branchSel = '',
  onBranch,
}) {
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [period, setPeriod] = useState('month')
  const [refDate, setRefDate] = useState(today)
  // Branch selection is shared app-wide (controlled by the parent).
  const branch = lockBranch != null ? lockBranch : branchSel === ALL_BRANCHES ? '' : branchSel

  const [start, end] = useMemo(() => periodRange(refDate, period), [refDate, period])

  // Aggregate every saved report's entries by each entry's own service date
  // within the period (reports are disjoint snapshots — saving clears the set).
  const rows = useMemo(() => {
    const entries = []
    for (const r of saved ?? []) {
      if (up(r.mode) === 'TRANSMITTAL') continue
      if (branch && up(r.branch) !== up(branch)) continue
      for (const e of Array.isArray(r.entries) ? r.entries : []) {
        const d = parseIso(e.reportDate)
        if (!d || d < start || d > end) continue
        entries.push(e)
      }
    }
    // Installation and Dismantle count as maintenance here, the same as they do
    // in the report's own Agency Summary (see foldMaintenance) — this screen is
    // the same tally over a longer period, so it must not tell a different story.
    return agencyBlocks(entries).map((b) => ({ ...b, cats: foldMaintenance(b.cats) }))
  }, [saved, branch, start, end])

  const get = (b, label) => b.cats.find(([l]) => l === label)?.[1] || 0
  const grand = rows.reduce(
    (acc, b) => {
      acc.m += get(b, 'MAINTENANCE')
      acc.p += get(b, 'PROGRAMMING')
      acc.t += b.total
      return acc
    },
    { m: 0, p: 0, t: 0 },
  )

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Agency', 'Maintenance', 'Programming', 'Total']
    const lines = [head.map(esc).join(',')]
    for (const b of rows) {
      lines.push([b.agency, get(b, 'MAINTENANCE'), get(b, 'PROGRAMMING'), b.total].map(esc).join(','))
    }
    lines.push(['TOTAL', grand.m, grand.p, grand.t].map(esc).join(','))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Agency-${period}-${refDate}${branch ? `-${branch}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="agency">
      {embedded ? (
        <h2 className="page-title">🏢 Agency totals</h2>
      ) : (
        <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>🏢 Agency totals</span>
          <span className="chev">{open ? '▲' : '▼'}</span>
        </button>
      )}

      {open && (
        <div className="agency-body">
          <div className="monthly-controls">
            <label>
              Period
              <SearchSelect
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                options={[
                  { value: 'day', label: 'Day / Date' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                  { value: 'year', label: 'Year' },
                ]}
              />
            </label>
            <label>
              Date in period
              <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} />
            </label>
            <label>
              Branch
              {lockBranch != null ? (
                <input value={branch} readOnly aria-label="Branch" />
              ) : (
                <SearchSelect
                  value={branchSel}
                  onChange={(e) => onBranch?.(e.target.value)}
                  options={[...branches, ALL_BRANCHES]}
                />
              )}
            </label>
            <button type="button" className="btn-txt" onClick={exportCsv} disabled={!rows.length}>
              ⭳ CSV
            </button>
          </div>
          <p className="saved-hint">
            Action counts per agency across saved <strong>reports</strong>,{' '}
            {period === 'day'
              ? 'for'
              : period === 'week'
                ? 'for the week of'
                : period === 'year'
                  ? 'for the year of'
                  : 'for the month of'}{' '}
            <strong>{fmt(start)}</strong>
            {period !== 'day' && (
              <>
                {' – '}
                <strong>{fmt(end)}</strong>
              </>
            )}
            {branch ? ` · ${branch}` : ''}.
          </p>

          {rows.length === 0 ? (
            <p className="empty">No saved reports in this period.</p>
          ) : (
            <div className="inv-scroll">
              <table className="inv-table agency-table">
                <thead>
                  <tr>
                    <th>Agency</th>
                    <th className="num">Maintenance</th>
                    <th className="num">Programming</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.agency}>
                      <td className="nowrap">{b.agency}</td>
                      <td className="num">{get(b, 'MAINTENANCE') || ''}</td>
                      <td className="num">{get(b, 'PROGRAMMING') || ''}</td>
                      <td className="num avail">{b.total}</td>
                    </tr>
                  ))}
                  <tr className="totals">
                    <td className="nowrap">TOTAL</td>
                    <td className="num">{grand.m}</td>
                    <td className="num">{grand.p}</td>
                    <td className="num">{grand.t}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
