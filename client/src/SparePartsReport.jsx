/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { useMemo, useState } from 'react'
import { monthEntries, buildSparePartsReport } from './report'
import { Pie } from './Pie'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthLabel = (mk) => {
  const [y, m] = String(mk || '').split('-').map(Number)
  return y && m ? `${MONTHS[m - 1]} ${y}` : ''
}
const ACT_COLS = [
  ['maintenance', 'Maintenance'],
  ['programming', 'Programming'],
  ['install', 'Installation'],
  ['dismantle', 'Dismantle'],
]
// Regroup one brand's model blocks (rows carry a company) into per-company
// groups, each keeping its model sub-blocks. -> [{ company, models, total }].
function splitByCompany(models) {
  const byCompany = new Map()
  for (const m of models) {
    for (const r of m.rows) {
      const c = r.company || '—'
      if (!byCompany.has(c)) byCompany.set(c, new Map())
      const mm = byCompany.get(c)
      if (!mm.has(m.model)) mm.set(m.model, [])
      mm.get(m.model).push(r)
    }
  }
  const modelOrder = models.map((m) => m.model)
  return [...byCompany.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((company) => {
      const mm = byCompany.get(company)
      const modelList = modelOrder
        .filter((md) => mm.has(md))
        .map((md) => {
          const rows = mm.get(md)
          return { model: md, rows, total: rows.reduce((s, r) => s + r.qty, 0) }
        })
      return { company, models: modelList, total: modelList.reduce((s, x) => s + x.total, 0) }
    })
}

export default function SparePartsReport({ saved, branches, embedded = false, lockBranch = null, charts = {} }) {
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [monthValue, setMonthValue] = useState(() => new Date().toISOString().slice(0, 7))
  const [branchSel, setBranch] = useState(branches?.[0] ?? '')
  const branch = lockBranch != null ? lockBranch : branchSel

  const [collapsed, setCollapsed] = useState(() => new Set()) // collapsed company cards
  const toggleCard = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const entries = useMemo(() => monthEntries(saved, monthValue, branch), [saved, monthValue, branch])
  const report = useMemo(() => buildSparePartsReport(entries), [entries])
  // Per-brand, per-company groups for the collapsible cards + Excel export.
  const grouped = useMemo(
    () => Object.keys(report.parts).map((type) => ({ type, groups: splitByCompany(report.parts[type]) })),
    [report],
  )
  const brandPie = useMemo(
    () => Object.keys(report.parts).map((type) => ({ label: type, value: report.parts[type].reduce((s, m) => s + m.total, 0) })),
    [report],
  )
  const companyPie = report.companyTotals.map((c) => ({ label: c.company, value: c.qty }))
  const hasData = report.grandParts > 0 || report.activity.length > 0 || report.agencies.length > 0

  const title = `TRC ${branch || 'All'} - Spare Parts`
  const fileBase = `${title} ${monthLabel(monthValue)}`.trim()

  const agencyGet = (b, label) => b.cats.find(([l]) => l === label)?.[1] || 0
  const agencyGrand = report.agencies.reduce(
    (a, b) => ({
      maintenance: a.maintenance + agencyGet(b, 'MAINTENANCE'),
      programming: a.programming + agencyGet(b, 'PROGRAMMING'),
      install: a.install + agencyGet(b, 'INSTALLATION'),
      dismantle: a.dismantle + agencyGet(b, 'DISMANTLE'),
      total: a.total + b.total,
    }),
    { maintenance: 0, programming: 0, install: 0, dismantle: 0, total: 0 },
  )
  const actGrand = report.activity.reduce(
    (a, g) => ({
      maintenance: a.maintenance + g.maintenance,
      programming: a.programming + g.programming,
      install: a.install + g.install,
      dismantle: a.dismantle + g.dismantle,
      total: a.total + g.total,
    }),
    { maintenance: 0, programming: 0, install: 0, dismantle: 0, total: 0 },
  )

  function exportExcel() {
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const b = 'border:1px solid #999;padding:4px;'
    const hb = `${b}background:#dfe3ee;font-weight:bold;text-align:center;`
    const tot = `${b}background:#fff3bf;font-weight:bold;`
    const num = `${b}text-align:center;`
    let h = `<meta charset="utf-8"><table style="border-collapse:collapse;font-family:Arial;font-size:11px;">`
    h += `<tr><td colspan="4" style="${b}background:#2563eb;color:#fff;font-weight:bold;font-size:14px;">${esc(title)} — ${esc(monthLabel(monthValue))}</td></tr>`
    // Parts by brand -> company -> model
    for (const { type, groups } of grouped) {
      for (const grp of groups) {
        h += `<tr><td colspan="3" style="${b}background:#2563eb;color:#fff;font-weight:bold;">${esc(type)} · ${esc(grp.company)}</td></tr>`
        for (const m of grp.models) {
          h += `<tr><td colspan="3" style="${b}background:#eef;font-weight:bold;">${esc(type)} ${esc(m.model)} · ${esc(grp.company)}</td></tr>`
          h += `<tr><th style="${hb}">#</th><th style="${hb}">Part</th><th style="${hb}">Qty</th></tr>`
          m.rows.forEach((r, i) => {
            h += `<tr><td style="${num}">${i + 1}</td><td style="${b}">${esc(r.part)}</td><td style="${num}">${r.qty}</td></tr>`
          })
          h += `<tr><td style="${tot}" colspan="2">TOTAL ${esc(type)} ${esc(m.model)}</td><td style="${tot}text-align:center;">${m.total}</td></tr>`
        }
        h += `<tr><td style="${tot}" colspan="2">TOTAL ${esc(type)} · ${esc(grp.company)}</td><td style="${tot}text-align:center;">${grp.total}</td></tr>`
      }
    }
    // Company subtotals
    if (report.companyTotals.length) {
      h += `<tr><td colspan="4" style="${b}background:#eef;font-weight:bold;">Parts by company</td></tr>`
      report.companyTotals.forEach((c) => {
        h += `<tr><td style="${b}" colspan="3">TOTAL ${esc(c.company)} PARTS</td><td style="${num}">${c.qty}</td></tr>`
      })
      h += `<tr><td style="${tot}" colspan="3">TOTAL PARTS</td><td style="${tot}text-align:center;">${report.grandParts}</td></tr>`
    }
    // Activity totals
    h += `<tr><td colspan="4"></td></tr><tr><th style="${hb}">Brand / Model</th><th style="${hb}">Maint.</th><th style="${hb}">Prog.</th><th style="${hb}" colspan="2">Install / Dismantle</th></tr>`
    report.activity.forEach((g) => {
      h += `<tr><td style="${b}">${esc(g.type)} ${esc(g.model)}</td><td style="${num}">${g.maintenance}</td><td style="${num}">${g.programming}</td><td style="${num}">${g.install}</td><td style="${num}">${g.dismantle}</td></tr>`
    })
    h += `<tr><td style="${tot}">TOTAL</td><td style="${tot}text-align:center;">${actGrand.maintenance}</td><td style="${tot}text-align:center;">${actGrand.programming}</td><td style="${tot}text-align:center;">${actGrand.install}</td><td style="${tot}text-align:center;">${actGrand.dismantle}</td></tr>`
    // Agency
    h += `<tr><td colspan="4"></td></tr><tr><th style="${hb}">Agency</th><th style="${hb}">Maint.</th><th style="${hb}">Prog.</th><th style="${hb}" colspan="2">Install / Dismantle</th></tr>`
    report.agencies.forEach((ag) => {
      h += `<tr><td style="${b}">${esc(ag.agency)}</td><td style="${num}">${agencyGet(ag, 'MAINTENANCE')}</td><td style="${num}">${agencyGet(ag, 'PROGRAMMING')}</td><td style="${num}">${agencyGet(ag, 'INSTALLATION')}</td><td style="${num}">${agencyGet(ag, 'DISMANTLE')}</td></tr>`
    })
    h += `<tr><td style="${tot}">TOTAL</td><td style="${tot}text-align:center;">${agencyGrand.maintenance}</td><td style="${tot}text-align:center;">${agencyGrand.programming}</td><td style="${tot}text-align:center;">${agencyGrand.install}</td><td style="${tot}text-align:center;">${agencyGrand.dismantle}</td></tr>`
    h += '</table>'
    const blob = new Blob(['﻿', h], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileBase}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="spareparts">
      {embedded ? (
        <h2 className="page-title">🧰 {title}</h2>
      ) : (
        <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>🧰 Spare parts</span>
          <span className="chev">{open ? '▲' : '▼'}</span>
        </button>
      )}

      {open && (
        <div className="sp-body">
          <div className="monthly-controls">
            <label>
              Month
              <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
            </label>
            <label>
              Branch
              {lockBranch != null ? (
                <input value={branch} readOnly aria-label="Branch" />
              ) : (
                <select value={branchSel} onChange={(e) => setBranch(e.target.value)}>
                  {(branches ?? []).map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              )}
            </label>
            <button type="button" className="submit" onClick={exportExcel} disabled={!hasData}>
              ⭳ Excel
            </button>
          </div>
          <p className="saved-hint">
            Spare parts used and activity for <strong>{branch}</strong>, built from saved <strong>reports</strong> in{' '}
            <strong>{monthLabel(monthValue)}</strong>. Parts merge by name + company; totals are highlighted.
          </p>

          {!hasData ? (
            <p className="empty">No saved reports for this month/branch yet.</p>
          ) : (
            <>
              {charts.sparePartsPie !== false && (companyPie.length > 0 || brandPie.some((b) => b.value > 0)) && (
                <div className="pie-row">
                  <div className="pie-card">
                    <Pie title="Parts by company" data={companyPie} />
                  </div>
                  <div className="pie-card">
                    <Pie title="Parts by brand" data={brandPie} />
                  </div>
                </div>
              )}

              <div className="sp-grid">
                {grouped.flatMap(({ type, groups }) =>
                  groups.map((grp) => {
                    const key = `${type}|${grp.company}`
                    const cardOpen = !collapsed.has(key)
                    return (
                      <div className="sp-brand" key={key}>
                        <button
                          type="button"
                          className="manage-toggle sp-card-toggle"
                          onClick={() => toggleCard(key)}
                          aria-expanded={cardOpen}
                        >
                          <span>
                            {type} · {grp.company} <span className="hint">({grp.total})</span>
                          </span>
                          <span className="chev">{cardOpen ? '▲' : '▼'}</span>
                        </button>
                        {cardOpen &&
                          grp.models.map((m) => (
                            <div className="sp-model" key={m.model}>
                              <h4 className="sp-model-h">
                                {type} {m.model} · {grp.company}
                              </h4>
                              <div className="inv-scroll">
                                <table className="inv-table sp-table">
                                  <thead>
                                    <tr>
                                      <th className="num">#</th>
                                      <th>Part</th>
                                      <th className="num">Qty</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {m.rows.map((r, i) => (
                                      <tr key={r.part}>
                                        <td className="num idx">{i + 1}</td>
                                        <td className="nowrap">{r.part}</td>
                                        <td className="num">{r.qty}</td>
                                      </tr>
                                    ))}
                                    <tr className="totals">
                                      <td colSpan={2}>TOTAL {type} {m.model}</td>
                                      <td className="num">{m.total}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                      </div>
                    )
                  }),
                )}
              </div>

              {report.companyTotals.length > 0 && (
                <div className="sp-block">
                  <h3 className="sp-brand-h">Parts by company</h3>
                  <div className="inv-scroll">
                    <table className="inv-table sp-table sp-narrow">
                      <tbody>
                        {report.companyTotals.map((c) => (
                          <tr key={c.company}>
                            <td className="nowrap">TOTAL {c.company} PARTS</td>
                            <td className="num">{c.qty}</td>
                          </tr>
                        ))}
                        <tr className="totals">
                          <td>TOTAL PARTS</td>
                          <td className="num">{report.grandParts}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {report.activity.length > 0 && (
                <div className="sp-block">
                  <h3 className="sp-brand-h">Activity totals</h3>
                  <div className="inv-scroll">
                    <table className="inv-table sp-table">
                      <thead>
                        <tr>
                          <th className="num">#</th>
                          <th>Brand</th>
                          <th>Model</th>
                          {ACT_COLS.map(([, l]) => (
                            <th className="num" key={l}>{l}</th>
                          ))}
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.activity.map((g, i) => (
                          <tr key={`${g.type}|${g.model}`}>
                            <td className="num idx">{i + 1}</td>
                            <td className="nowrap">{g.type}</td>
                            <td className="nowrap">{g.model}</td>
                            {ACT_COLS.map(([k]) => (
                              <td className="num" key={k}>{g[k] || ''}</td>
                            ))}
                            <td className="num avail">{g.total}</td>
                          </tr>
                        ))}
                        <tr className="totals">
                          <td colSpan={3}>TOTAL</td>
                          {ACT_COLS.map(([k]) => (
                            <td className="num" key={k}>{actGrand[k]}</td>
                          ))}
                          <td className="num">{actGrand.total}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {report.agencies.length > 0 && (
                <div className="sp-block">
                  <h3 className="sp-brand-h">Agency activity</h3>
                  <div className="inv-scroll">
                    <table className="inv-table sp-table">
                      <thead>
                        <tr>
                          <th className="num">#</th>
                          <th>Agency</th>
                          {ACT_COLS.map(([, l]) => (
                            <th className="num" key={l}>{l}</th>
                          ))}
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.agencies.map((ag, i) => (
                          <tr key={ag.agency}>
                            <td className="num idx">{i + 1}</td>
                            <td className="nowrap">{ag.agency}</td>
                            <td className="num">{agencyGet(ag, 'MAINTENANCE') || ''}</td>
                            <td className="num">{agencyGet(ag, 'PROGRAMMING') || ''}</td>
                            <td className="num">{agencyGet(ag, 'INSTALLATION') || ''}</td>
                            <td className="num">{agencyGet(ag, 'DISMANTLE') || ''}</td>
                            <td className="num avail">{ag.total}</td>
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
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
