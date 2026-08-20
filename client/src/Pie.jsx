/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { PALETTE } from './chartUtils'

// Conic-gradient pie + legend. Renders the title (optional) + chart; the caller
// supplies the surrounding card. data: [{ label, value, color? }].
export function Pie({ title, data }) {
  const rows = (data ?? []).filter((d) => d.value > 0)
  const total = rows.reduce((s, d) => s + d.value, 0)
  if (!total) return <p className="empty">No data.</p>
  let acc = 0
  const stops = rows
    .map((d, i) => {
      const start = (acc / total) * 100
      acc += d.value
      const end = (acc / total) * 100
      return `${d.color ?? PALETTE[i % PALETTE.length]} ${start}% ${end}%`
    })
    .join(', ')
  return (
    <>
      {title && <h3 className="sp-brand-h">{title}</h3>}
      <div className="pie-wrap">
        <div
          className="pie"
          style={{ background: `conic-gradient(${stops})` }}
          role="img"
          aria-label={title || 'Pie chart'}
        />
        <ul className="pie-legend">
          {rows.map((d, i) => (
            <li key={d.label}>
              <span className="pie-dot" style={{ background: d.color ?? PALETTE[i % PALETTE.length] }} />
              <span className="pie-name">{d.label}</span>
              <b>{d.value}</b>
              <span className="pie-pct">{Math.round((d.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
