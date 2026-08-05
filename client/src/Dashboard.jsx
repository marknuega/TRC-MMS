/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { useMemo, useState } from 'react'
import { monthEntries, dashboardSummary, technicianTotals, topParts, monthlyTrend, agencyTransactions } from './report'

const ALL = '__all__'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthShort = (mk) => {
  const [y, m] = String(mk || '').split('-').map(Number)
  return y && m ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : mk
}
const monthLong = (mk) => {
  const [y, m] = String(mk || '').split('-').map(Number)
  return y && m ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}` : ''
}

// A compact horizontal bar for ranked lists.
function Bar({ value, max, label, right }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="dash-bar-row">
      <span className="dash-bar-label" title={label}>{label}</span>
      <span className="dash-bar-track">
        <span className="dash-bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="dash-bar-val">{right ?? value}</span>
    </div>
  )
}

export default function Dashboard({ saved, branches, embedded = false }) {
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [monthValue, setMonthValue] = useState(() => new Date().toISOString().slice(0, 7))
  const [branchSel, setBranchSel] = useState(ALL)
  const branch = branchSel === ALL ? '' : branchSel

  const entries = useMemo(() => monthEntries(saved, monthValue, branch), [saved, monthValue, branch])
  const summary = useMemo(() => dashboardSummary(entries), [entries])
  const techs = useMemo(() => technicianTotals(entries), [entries])
  const agencies = useMemo(() => agencyTransactions(entries), [entries])
  const parts = useMemo(() => topParts(entries, 10), [entries])
  const trend = useMemo(() => monthlyTrend(saved, branch), [saved, branch])

  const hasData = summary.devices > 0
  const activityMix = [
    ['Maintenance', summary.maintenance, '#2563eb'],
    ['Programming', summary.programming, '#7c3aed'],
    ['Installation', summary.install, '#059669'],
    ['Dismantle', summary.dismantle, '#d97706'],
  ]
  const mixMax = Math.max(1, ...activityMix.map(([, v]) => v))
  const techMax = Math.max(1, ...techs.map((t) => t.total))
  const partMax = Math.max(1, ...parts.map((p) => p.qty))
  const trendMax = Math.max(1, ...trend.map((t) => t.devices))
  const agencyMax = Math.max(1, ...agencies.map((a) => a.total))
  const sumBy = (list, keys) =>
    list.reduce((a, r) => {
      keys.forEach((k) => (a[k] = (a[k] || 0) + (r[k] || 0)))
      return a
    }, {})
  const agencyGrand = sumBy(agencies, ['maintenance', 'programming', 'install', 'dismantle', 'total'])
  const trendGrand = sumBy(trend, ['devices', 'maintenance', 'programming', 'install', 'dismantle'])

  const kpis = [
    ['Devices serviced', summary.devices, '📟'],
    ['Maintenance', summary.maintenance, '🔧'],
    ['Programming', summary.programming, '💾'],
    ['Installations', summary.install, '📥'],
    ['Dismantles', summary.dismantle, '📤'],
    ['Parts used', summary.parts, '🧰'],
    ['Technicians', summary.technicians, '👷'],
    ['Agencies', summary.agencies, '🏢'],
  ]

  return (
    <section className="dashboard">
      {embedded ? (
        <h2 className="page-title">📊 Dashboard <span className="hint">· {monthLong(monthValue)}{branch ? ` · ${branch}` : ' · all branches'}</span></h2>
      ) : (
        <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>📊 Dashboard</span>
          <span className="chev">{open ? '▲' : '▼'}</span>
        </button>
      )}

      {open && (
        <div className="dash-body">
          <div className="monthly-controls">
            <label>
              Month
              <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
            </label>
            <label>
              Branch
              <select value={branchSel} onChange={(e) => setBranchSel(e.target.value)}>
                <option value={ALL}>All branches</option>
                {(branches ?? []).map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
          </div>

          {!hasData ? (
            <p className="empty">No saved reports for this month/branch yet.</p>
          ) : (
            <>
              <div className="kpi-grid">
                {kpis.map(([label, value, ico]) => (
                  <div className="kpi-tile" key={label}>
                    <span className="kpi-ico">{ico}</span>
                    <span className="kpi-value">{value}</span>
                    <span className="kpi-label">{label}</span>
                  </div>
                ))}
              </div>

              <div className="dash-grid">
                <div className="dash-card">
                  <h3 className="sp-brand-h">Activity mix</h3>
                  {activityMix.map(([label, value, color]) => (
                    <div className="dash-bar-row" key={label}>
                      <span className="dash-bar-label">{label}</span>
                      <span className="dash-bar-track">
                        <span className="dash-bar-fill" style={{ width: `${Math.round((value / mixMax) * 100)}%`, background: color }} />
                      </span>
                      <span className="dash-bar-val">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="dash-card">
                  <h3 className="sp-brand-h">Top technicians <span className="hint">by activity</span></h3>
                  {techs.slice(0, 8).map((t) => (
                    <Bar key={t.technician} value={t.total} max={techMax} label={t.technician} right={t.total} />
                  ))}
                </div>

                <div className="dash-card">
                  <h3 className="sp-brand-h">Busiest agencies</h3>
                  {agencies
                    .slice()
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 8)
                    .map((a) => (
                      <Bar key={a.agency} value={a.total} max={agencyMax} label={a.agency} right={a.total} />
                    ))}
                </div>

                <div className="dash-card">
                  <h3 className="sp-brand-h">Top spare parts</h3>
                  {parts.length === 0 ? (
                    <p className="empty">No parts recorded.</p>
                  ) : (
                    parts.map((p) => (
                      <Bar key={`${p.part}|${p.company}`} value={p.qty} max={partMax} label={`${p.part}${p.company ? ` · ${p.company}` : ''}`} right={p.qty} />
                    ))
                  )}
                </div>

                <div className="dash-card dash-wide">
                  <h3 className="sp-brand-h">Monthly trend <span className="hint">· devices serviced</span></h3>
                  <div className="dash-trend">
                    {trend.map((t) => (
                      <div className="dash-col" key={t.monthKey} title={`${monthLong(t.monthKey)}: ${t.devices} devices`}>
                        <span className="dash-col-val">{t.devices}</span>
                        <span className="dash-col-bar" style={{ height: `${Math.max(2, Math.round((t.devices / trendMax) * 120))}px` }} />
                        <span className="dash-col-x">{monthShort(t.monthKey)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="dash-card">
                <h3 className="sp-brand-h">Technician performance</h3>
                <div className="inv-scroll">
                  <table className="inv-table sp-table">
                    <thead>
                      <tr>
                        <th className="num">#</th>
                        <th>Technician</th>
                        <th className="num">Devices</th>
                        <th className="num">Maint.</th>
                        <th className="num">Prog.</th>
                        <th className="num">Install</th>
                        <th className="num">Dismantle</th>
                        <th className="num">Parts</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {techs.map((t, i) => (
                        <tr key={t.technician}>
                          <td className="num idx">{i + 1}</td>
                          <td className="nowrap">{t.technician}</td>
                          <td className="num">{t.devices}</td>
                          <td className="num">{t.maintenance || ''}</td>
                          <td className="num">{t.programming || ''}</td>
                          <td className="num">{t.install || ''}</td>
                          <td className="num">{t.dismantle || ''}</td>
                          <td className="num">{t.parts || ''}</td>
                          <td className="num avail">{t.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="dash-card">
                <h3 className="sp-brand-h">Agency performance <span className="hint">· transactions · {monthLong(monthValue)}</span></h3>
                <div className="inv-scroll">
                  <table className="inv-table sp-table">
                    <thead>
                      <tr>
                        <th className="num">#</th>
                        <th>Agency</th>
                        <th className="num">Maintenance</th>
                        <th className="num">Programming</th>
                        <th className="num">Installation</th>
                        <th className="num">Dismantle</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agencies.map((a, i) => (
                        <tr key={a.agency}>
                          <td className="num idx">{i + 1}</td>
                          <td className="nowrap">{a.agency}</td>
                          <td className="num">{a.maintenance || ''}</td>
                          <td className="num">{a.programming || ''}</td>
                          <td className="num">{a.install || ''}</td>
                          <td className="num">{a.dismantle || ''}</td>
                          <td className="num avail">{a.total}</td>
                        </tr>
                      ))}
                      <tr className="totals">
                        <td colSpan={2}>TOTAL</td>
                        <td className="num">{agencyGrand.maintenance}</td>
                        <td className="num">{agencyGrand.programming}</td>
                        <td className="num">{agencyGrand.install}</td>
                        <td className="num">{agencyGrand.dismantle}</td>
                        <td className="num">{agencyGrand.total}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="dash-card">
                <h3 className="sp-brand-h">Service reports <span className="hint">· transactions per month{branch ? ` · ${branch}` : ' · all branches'}</span></h3>
                <div className="inv-scroll">
                  <table className="inv-table sp-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="num">Devices</th>
                        <th className="num">Maintenance</th>
                        <th className="num">Programming</th>
                        <th className="num">Installation</th>
                        <th className="num">Dismantle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((t) => (
                        <tr key={t.monthKey} className={t.monthKey === monthValue ? 'row-active' : ''}>
                          <td className="nowrap">{monthLong(t.monthKey)}</td>
                          <td className="num avail">{t.devices}</td>
                          <td className="num">{t.maintenance || ''}</td>
                          <td className="num">{t.programming || ''}</td>
                          <td className="num">{t.install || ''}</td>
                          <td className="num">{t.dismantle || ''}</td>
                        </tr>
                      ))}
                      <tr className="totals">
                        <td>TOTAL</td>
                        <td className="num">{trendGrand.devices}</td>
                        <td className="num">{trendGrand.maintenance}</td>
                        <td className="num">{trendGrand.programming}</td>
                        <td className="num">{trendGrand.install}</td>
                        <td className="num">{trendGrand.dismantle}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
