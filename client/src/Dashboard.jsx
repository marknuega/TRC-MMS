/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { useMemo, useState } from 'react'
import { monthEntries, dashboardSummary, technicianTotals, topParts, monthlyTrend, agencyTransactions, buildSparePartsReport } from './report'
import { Pie } from './Pie'
import { toPie } from './chartUtils'
import { ALL_BRANCHES } from './options'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthShort = (mk) => {
  const [y, m] = String(mk || '').split('-').map(Number)
  return y && m ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : mk
}
const monthLong = (mk) => {
  const [y, m] = String(mk || '').split('-').map(Number)
  return y && m ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}` : ''
}

export default function Dashboard({ saved, branches, embedded = false, lockBranch = null, charts = {}, branchSel = '', onBranch }) {
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [monthValue, setMonthValue] = useState(() => new Date().toISOString().slice(0, 7))
  // Branch selection is shared app-wide (controlled by the parent).
  const branch = lockBranch != null ? lockBranch : branchSel === ALL_BRANCHES ? '' : branchSel

  const entries = useMemo(() => monthEntries(saved, monthValue, branch), [saved, monthValue, branch])
  const summary = useMemo(() => dashboardSummary(entries), [entries])
  const techs = useMemo(() => technicianTotals(entries), [entries])
  const agencies = useMemo(() => agencyTransactions(entries), [entries])
  const parts = useMemo(() => topParts(entries, 10), [entries])
  const trend = useMemo(() => monthlyTrend(saved, branch), [saved, branch])

  const hasData = summary.devices > 0
  const trendMax = Math.max(1, ...trend.map((t) => t.devices))
  // Pie datasets for the analytics cards.
  const mixPie = [
    { label: 'Maintenance', value: summary.maintenance, color: '#2563eb' },
    { label: 'Programming', value: summary.programming, color: '#7c3aed' },
    { label: 'Installation', value: summary.install, color: '#059669' },
    { label: 'Dismantle', value: summary.dismantle, color: '#d97706' },
  ]
  const techPie = toPie(techs, (t) => t.technician, (t) => t.total)
  const agencyPie = toPie(agencies, (a) => a.agency, (a) => a.total)
  const partsPie = toPie(parts, (p) => `${p.part}${p.company ? ` · ${p.company}` : ''}`, (p) => p.qty)
  // Spare-parts breakdowns, duplicated from the Spare Parts page.
  const spReport = useMemo(() => buildSparePartsReport(entries), [entries])
  const companyPie = useMemo(() => spReport.companyTotals.map((c) => ({ label: c.company, value: c.qty })), [spReport])
  const brandPie = useMemo(
    () => Object.keys(spReport.parts).map((type) => ({ label: type, value: spReport.parts[type].reduce((s, m) => s + m.total, 0) })),
    [spReport],
  )
  const showTopTech = charts.dashTopTech !== false
  const showCompanyPie = charts.dashPartsCompany !== false && companyPie.length > 0
  const showBrandPie = charts.dashPartsBrand !== false && brandPie.some((b) => b.value > 0)
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
              {lockBranch != null ? (
                <input value={lockBranch || 'Your branch'} readOnly aria-label="Branch" />
              ) : (
                <select value={branchSel} onChange={(e) => onBranch?.(e.target.value)}>
                  {(branches ?? []).map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                  <option value={ALL_BRANCHES}>{ALL_BRANCHES}</option>
                </select>
              )}
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
                  <Pie data={mixPie} />
                </div>

                {showTopTech && (
                  <div className="dash-card">
                    <h3 className="sp-brand-h">Top technicians <span className="hint">by activity</span></h3>
                    <Pie data={techPie} />
                  </div>
                )}

                <div className="dash-card">
                  <h3 className="sp-brand-h">Busiest agencies</h3>
                  <Pie data={agencyPie} />
                </div>

                <div className="dash-card">
                  <h3 className="sp-brand-h">Top spare parts</h3>
                  <Pie data={partsPie} />
                </div>

                {showCompanyPie && (
                  <div className="dash-card">
                    <h3 className="sp-brand-h">Parts by company</h3>
                    <Pie data={companyPie} />
                  </div>
                )}
                {showBrandPie && (
                  <div className="dash-card">
                    <h3 className="sp-brand-h">Parts by brand</h3>
                    <Pie data={brandPie} />
                  </div>
                )}

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
