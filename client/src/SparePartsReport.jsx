/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { useMemo, useState } from 'react'
import { periodEntries, buildSparePartsReport } from './report'
import { Pie } from './Pie'
import { COPYRIGHT_HTML } from './copyright'
import { ALL_BRANCHES } from './options'
import { PeriodPicker, makePeriod, periodValue, periodLabel } from './period'
import SearchSelect from './SearchSelect'

const ACT_COLS = [
  ['maintenance', 'Maintenance'],
  ['programming', 'Programming'],
  ['install', 'Installation'],
  ['dismantle', 'Dismantle'],
]
// Company display order: MOT first, then MOI, then any others, with "—" (no
// company) last. Used for the cards and the exports alike.
const companyRank = (c) => (c === 'MOT' ? 0 : c === 'MOI' ? 1 : c === '—' ? 9 : 5)

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
    .sort((a, b) => companyRank(a) - companyRank(b) || a.localeCompare(b))
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

export default function SparePartsReport({ saved, branches, embedded = false, lockBranch = null, charts = {}, branchSel = '', onBranch }) {
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [period, setPeriod] = useState(() => makePeriod('month'))
  const rangeLabel = periodLabel(period)
  // Branch selection is shared app-wide (controlled by the parent). '' = every
  // branch merged (admin "All Branches"); non-admins are pinned to their own.
  const branch = lockBranch != null ? lockBranch : branchSel === ALL_BRANCHES ? '' : branchSel

  const [collapsed, setCollapsed] = useState(() => new Set()) // collapsed company cards
  const toggleCard = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const entries = useMemo(() => periodEntries(saved, periodValue(period), branch), [saved, period, branch])
  const report = useMemo(() => buildSparePartsReport(entries), [entries])
  // Per-brand, per-company groups for the collapsible cards + Excel export.
  const grouped = useMemo(
    () => Object.keys(report.parts).map((type) => ({ type, groups: splitByCompany(report.parts[type]) })),
    [report],
  )
  // One card per brand·MODEL·company (every device gets its own card), ordered
  // company-first (all MOT on the top rows, then MOI, then the rest). A stable
  // sort keeps AIRBUS/SEPURA/HYTERA + the fixed model order within each band.
  const cards = useMemo(
    () =>
      grouped
        .flatMap(({ type, groups }) => groups.flatMap((grp) => grp.models.map((model) => ({ type, company: grp.company, model }))))
        .sort((a, b) => companyRank(a.company) - companyRank(b.company)),
    [grouped],
  )
  // Group the cards into per-company bands (MOT, then MOI, then the rest). Each
  // band renders as its own grid, so MOT always fills its own row(s) before MOI
  // starts on a fresh row.
  const bands = useMemo(() => {
    const order = []
    const byCompany = new Map()
    for (const c of cards) {
      if (!byCompany.has(c.company)) {
        byCompany.set(c.company, [])
        order.push(c.company)
      }
      byCompany.get(c.company).push(c)
    }
    return order.map((company) => ({ company, items: byCompany.get(company) }))
  }, [cards])
  const brandPie = useMemo(
    () => Object.keys(report.parts).map((type) => ({ label: type, value: report.parts[type].reduce((s, m) => s + m.total, 0) })),
    [report],
  )
  const companyPie = report.companyTotals.map((c) => ({ label: c.company, value: c.qty }))
  const showCompanyPie = charts.spPartsCompany !== false && companyPie.length > 0
  const showBrandPie = charts.spPartsBrand !== false && brandPie.some((b) => b.value > 0)
  const hasData = report.grandParts > 0 || report.activity.length > 0 || report.agencies.length > 0

  const title = `TRC ${branch || 'All'} - Spare Parts`
  const fileBase = `${title} ${rangeLabel}`.trim()

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
    h += `<tr><td colspan="4" style="${b}background:#2563eb;color:#fff;font-weight:bold;font-size:14px;">${esc(title)} — ${esc(rangeLabel)}</td></tr>`
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

  // Consolidated printable report — same sections as the Excel export, laid out
  // for print/save-as-PDF. Merges every branch when "All branches" is selected.
  function exportPdf() {
    const w = window.open('', '_blank')
    if (!w) return
    const e = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let b = ''
    // Parts by brand -> company -> model
    for (const { type, groups } of grouped) {
      for (const grp of groups) {
        b += `<tr><td class="sec" colspan="3">${e(type)} · ${e(grp.company)}</td></tr>`
        for (const m of grp.models) {
          b += `<tr><td class="sub" colspan="3">${e(type)} ${e(m.model)} · ${e(grp.company)}</td></tr>`
          b += `<tr><th class="c">#</th><th>Part</th><th class="c">Qty</th></tr>`
          m.rows.forEach((r, i) => {
            b += `<tr><td class="c">${i + 1}</td><td>${e(r.part)}</td><td class="c">${r.qty}</td></tr>`
          })
          b += `<tr><td class="tot" colspan="2">TOTAL ${e(type)} ${e(m.model)}</td><td class="tot c">${m.total}</td></tr>`
        }
        b += `<tr><td class="tot" colspan="2">TOTAL ${e(type)} · ${e(grp.company)}</td><td class="tot c">${grp.total}</td></tr>`
      }
    }
    let companyTbl = ''
    if (report.companyTotals.length) {
      companyTbl =
        `<h2>Parts by company</h2><table><tbody>` +
        report.companyTotals.map((c) => `<tr><td>TOTAL ${e(c.company)} PARTS</td><td class="c">${c.qty}</td></tr>`).join('') +
        `<tr><td class="tot">TOTAL PARTS</td><td class="tot c">${report.grandParts}</td></tr></tbody></table>`
    }
    const actRows = report.activity
      .map((g) => `<tr><td>${e(g.type)} ${e(g.model)}</td><td class="c">${g.maintenance}</td><td class="c">${g.programming}</td><td class="c">${g.install}</td><td class="c">${g.dismantle}</td></tr>`)
      .join('')
    const agencyRows = report.agencies
      .map((ag) => `<tr><td>${e(ag.agency)}</td><td class="c">${agencyGet(ag, 'MAINTENANCE')}</td><td class="c">${agencyGet(ag, 'PROGRAMMING')}</td><td class="c">${agencyGet(ag, 'INSTALLATION')}</td><td class="c">${agencyGet(ag, 'DISMANTLE')}</td></tr>`)
      .join('')
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${e(fileBase)}</title>` +
        `<style>body{font-family:Arial,sans-serif;color:#111;margin:24px}h1{font-size:17px;margin:0 0 2px}` +
        `h2{font-size:13px;margin:18px 0 6px;color:#2563eb}p.meta{margin:0 0 14px;color:#555;font-size:12px}` +
        `table{border-collapse:collapse;width:100%;font-size:11px;margin-bottom:6px}th,td{border:1px solid #999;padding:4px 6px;text-align:left}` +
        `th{background:#dfe3ee}td.c,th.c{text-align:center}td.sec{background:#2563eb;color:#fff;font-weight:bold}` +
        `td.sub{background:#eef;font-weight:bold}td.tot{background:#fff3bf;font-weight:bold}tfoot{color:#777}` +
        `@media print{h2{page-break-after:avoid}tr{page-break-inside:avoid}}</style></head><body>` +
        `<h1>${e(title)}</h1><p class="meta">${e(rangeLabel)} · consolidated · printed ${e(new Date().toLocaleString('en-GB'))}</p>` +
        (b ? `<h2>Parts by brand</h2><table><tbody>${b}</tbody></table>` : '') +
        companyTbl +
        (actRows
          ? `<h2>Activity totals</h2><table><thead><tr><th>Brand / Model</th><th class="c">Maint.</th><th class="c">Prog.</th><th class="c">Install</th><th class="c">Dismantle</th></tr></thead>` +
            `<tbody>${actRows}<tr><td class="tot">TOTAL</td><td class="tot c">${actGrand.maintenance}</td><td class="tot c">${actGrand.programming}</td><td class="tot c">${actGrand.install}</td><td class="tot c">${actGrand.dismantle}</td></tr></tbody></table>`
          : '') +
        (agencyRows
          ? `<h2>Agency totals</h2><table><thead><tr><th>Agency</th><th class="c">Maint.</th><th class="c">Prog.</th><th class="c">Install</th><th class="c">Dismantle</th></tr></thead>` +
            `<tbody>${agencyRows}<tr><td class="tot">TOTAL</td><td class="tot c">${agencyGrand.maintenance}</td><td class="tot c">${agencyGrand.programming}</td><td class="tot c">${agencyGrand.install}</td><td class="tot c">${agencyGrand.dismantle}</td></tr></tbody></table>`
          : '') +
        `<p class="meta" style="margin-top:16px">${COPYRIGHT_HTML}</p>` +
        `</body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
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
            <PeriodPicker period={period} onChange={setPeriod} />
            <label>
              Branch
              {lockBranch != null ? (
                <input value={branch} readOnly aria-label="Branch" />
              ) : (
                <SearchSelect value={branchSel} onChange={(e) => onBranch?.(e.target.value)} options={[...(branches ?? []), ALL_BRANCHES]} />
              )}
            </label>
            <button type="button" className="submit" onClick={exportExcel} disabled={!hasData}>
              ⭳ Excel
            </button>
            <button type="button" className="btn-pdf" onClick={exportPdf} disabled={!hasData}>
              ⭳ PDF
            </button>
          </div>
          <p className="saved-hint">
            Spare parts used and activity for <strong>{branch || 'All branches'}</strong>, built from saved <strong>reports</strong> in{' '}
            <strong>{rangeLabel}</strong>. Parts merge by name + company; totals are highlighted.
          </p>

          {!hasData ? (
            <p className="empty">No saved reports for this month/branch yet.</p>
          ) : (
            <>
              {(showCompanyPie || showBrandPie) && (
                <div className="pie-row">
                  {showCompanyPie && (
                    <div className="pie-card">
                      <Pie title="Parts by company" data={companyPie} />
                    </div>
                  )}
                  {showBrandPie && (
                    <div className="pie-card">
                      <Pie title="Parts by brand" data={brandPie} />
                    </div>
                  )}
                </div>
              )}

              {bands.map(({ company, items }) => (
                <div className="sp-band" key={company}>
                  {items.map(({ type, company: co, model }) => {
                    const key = `${type}|${model.model}|${co}`
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
                          {type} {model.model} · {company} <span className="hint">({model.total})</span>
                        </span>
                        <span className="chev">{cardOpen ? '▲' : '▼'}</span>
                      </button>
                      {cardOpen && (
                        <div className="sp-model">
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
                                {model.rows.map((r, i) => (
                                  <tr key={r.part}>
                                    <td className="num idx">{i + 1}</td>
                                    <td className="nowrap">{r.part}</td>
                                    <td className="num">{r.qty}</td>
                                  </tr>
                                ))}
                                <tr className="totals">
                                  <td colSpan={2}>TOTAL {type} {model.model}</td>
                                  <td className="num">{model.total}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      </div>
                    )
                  })}
                </div>
              ))}

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
