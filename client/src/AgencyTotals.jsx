/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { useMemo, useState } from 'react'
import { agencyBlocks } from './report'

const today = () => new Date().toISOString().slice(0, 10)
const up = (v) => String(v ?? '').trim().toUpperCase()

// dd/mm/yyyy -> Date (local midnight), or null.
function parseDmy(label) {
  const m = String(label || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null
}

// Inclusive [start, end] for the period containing refDate.
function periodRange(refDate, period) {
  const d = new Date(refDate)
  if (period === 'year') return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear(), 11, 31)]
  if (period === 'month') return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)]
  // week: Sunday–Saturday containing refDate
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return [start, end]
}

const fmt = (d) => d.toLocaleDateString('en-GB')

export default function AgencyTotals({ saved, branches, embedded = false, lockBranch = null }) {
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [period, setPeriod] = useState('month')
  const [refDate, setRefDate] = useState(today)
  const [branchSel, setBranch] = useState('')
  const branch = lockBranch != null ? lockBranch : branchSel

  const [start, end] = useMemo(() => periodRange(refDate, period), [refDate, period])

  // Latest saved 'report' per date within the period + branch → flatten entries.
  const rows = useMemo(() => {
    const byDay = new Map()
    for (const r of saved ?? []) {
      if (up(r.mode) === 'TRANSMITTAL') continue
      if (branch && up(r.branch) !== up(branch)) continue
      const d = parseDmy(r.dateLabel)
      if (!d || d < start || d > end) continue
      // Keep each branch's day separate so "All branches" merges every branch.
      const key = `${up(r.branch)}|${r.dateLabel}`
      const prev = byDay.get(key)
      if (!prev || (r.seq ?? 0) > (prev.seq ?? 0)) byDay.set(key, r)
    }
    const entries = [...byDay.values()].flatMap((r) => (Array.isArray(r.entries) ? r.entries : []))
    return agencyBlocks(entries)
  }, [saved, branch, start, end])

  const get = (b, label) => b.cats.find(([l]) => l === label)?.[1] || 0
  const grand = rows.reduce(
    (acc, b) => {
      acc.m += get(b, 'MAINTENANCE')
      acc.p += get(b, 'PROGRAMMING')
      acc.i += get(b, 'INSTALLATION')
      acc.d += get(b, 'DISMANTLE')
      acc.t += b.total
      return acc
    },
    { m: 0, p: 0, i: 0, d: 0, t: 0 },
  )

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Agency', 'Maintenance', 'Programming', 'Installation', 'Dismantle', 'Total']
    const lines = [head.map(esc).join(',')]
    for (const b of rows) {
      lines.push([b.agency, get(b, 'MAINTENANCE'), get(b, 'PROGRAMMING'), get(b, 'INSTALLATION'), get(b, 'DISMANTLE'), b.total].map(esc).join(','))
    }
    lines.push(['TOTAL', grand.m, grand.p, grand.i, grand.d, grand.t].map(esc).join(','))
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
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
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
                <select value={branchSel} onChange={(e) => setBranch(e.target.value)}>
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              )}
            </label>
            <button type="button" className="btn-txt" onClick={exportCsv} disabled={!rows.length}>
              ⭳ CSV
            </button>
          </div>
          <p className="saved-hint">
            Action counts per agency across saved <strong>reports</strong>, {period === 'week' ? 'for the week' : period === 'year' ? 'for the year' : 'for the month'} of{' '}
            <strong>{fmt(start)}</strong> – <strong>{fmt(end)}</strong>
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
                    <th className="num">Installation</th>
                    <th className="num">Dismantle</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.agency}>
                      <td className="nowrap">{b.agency}</td>
                      <td className="num">{get(b, 'MAINTENANCE') || ''}</td>
                      <td className="num">{get(b, 'PROGRAMMING') || ''}</td>
                      <td className="num">{get(b, 'INSTALLATION') || ''}</td>
                      <td className="num">{get(b, 'DISMANTLE') || ''}</td>
                      <td className="num avail">{b.total}</td>
                    </tr>
                  ))}
                  <tr className="totals">
                    <td className="nowrap">TOTAL</td>
                    <td className="num">{grand.m}</td>
                    <td className="num">{grand.p}</td>
                    <td className="num">{grand.i}</td>
                    <td className="num">{grand.d}</td>
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
