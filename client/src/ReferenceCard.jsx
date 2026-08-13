/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// Short-Code Reference Card.
//
// A printable cheat-sheet for the CDS fault-reporting short codes. A fault token
// is [TYPE][PARTS][VARIANT] + [ACTION][QTY][COMPANY], e.g. "H43AC1MT" = type H
// (Airbus TH1n), parts 43 (Side Grip), variant A (Original), action C (Change),
// qty 1, company MT (MOTECO).
//
// The first FOUR characters are the CDS code proper. This replaced the older
// 3-character "26HC1MT" form, which led with the component number and had no
// variant, so it could not tell an original side grip from a 3D-printed one.
//
// The lists below are pulled LIVE from this app's own /codemap, so the page
// stays in step with edits made under Code Map. The bundled constants are only
// a fallback for when that fetch fails (offline). Both the map and the fallback
// live in codes.js, shared with the decoder that actually parses these codes —
// one vocabulary, described in exactly one place.
//
// TWO sections describe how a code resolves, and their order is the resolution
// order: a Claimed Code (an Issue type in Manage inputs) wins outright, and only
// where there is no claim do Parts Numbers + Variants apply. The card used to
// show the second without the first, which made it a partial description of a
// vocabulary technicians rely on being complete.

import { useMemo } from 'react'
import { COPYRIGHT_HTML } from './copyright'
import { FALLBACK, VARIANTS, useCodeMap } from './codes'
import { groupComponents } from './refGroups'

const numericSort = ([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
// Split a list into n roughly equal columns, keeping reading order down each one.
const chunk = (rows, n) => {
  const size = Math.ceil(rows.length / n) || 1
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size))
}
// Preserve the curated brand grouping from the source map (insertion order).
const asPairs = (obj) => Object.entries(obj || {}).map(([k, v]) => [String(k), String(v)])
const sortedPairs = (obj) => asPairs(obj).sort(numericSort)


const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Build a clean, standalone printable document (independent of the app layout)
// and print it through a hidden iframe — reliable for Chrome "Save as PDF".
function printReference(data) {
  const { devices, componentGroups, claims, actions, companies, agencies, technicians } = data
  const codeRows = (pairs) =>
    pairs.map(([c, n]) => `<tr><td class="c">${esc(c)}</td><td>${esc(n)}</td></tr>`).join('')
  // Device rows bold the source char in the model name and add an explanation column.
  const deviceRows = (pairs) =>
    pairs
      .map(([c, n]) => {
        const p = deviceSource(c, n)
        const name = `${esc(p.before)}<b>${esc(p.hit)}</b>${esc(p.after)}`
        return `<tr><td class="c">${esc(c)}</td><td>${name}</td><td class="note">${esc(p.note)}</td></tr>`
      })
      .join('')
  const half = Math.ceil(devices.length / 2)

  const componentTables = componentGroups
    .map((g) => `<div class="grp"><h3>${esc(g.title)}</h3><table>${codeRows(g.items)}</table></div>`)
    .join('')
  // Claims print as plain columns — they are one flat list, not bucketed by
  // number, because what groups them is the issue they name, not the part range.
  const claimTables = chunk(claims, 3)
    .map((rows) => `<div class="grp"><table>${codeRows(rows)}</table></div>`)
    .join('')
  // "A = Original, B = 3D" — read from the same map the decoder uses.
  const variantList = Object.entries(VARIANTS)
    .map(([k, v]) => `<b>${esc(k)}</b> = ${esc(v.label)}`)
    .join(', ')

  const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>TRC-MMS Short-Code Reference</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12px/1.4 -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 14mm; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #222; }
  h3 { font-size: 11px; margin: 0 0 4px; color: #444; text-transform: uppercase; letter-spacing: .04em; }
  .sub { color: #555; margin: 0 0 4px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 3px 6px; text-align: left; vertical-align: top; }
  td.c, th.c { font-weight: 700; font-family: ui-monospace, Consolas, monospace; white-space: nowrap; width: 3.2em; }
  /* Wraps on purpose — one line per note made the 3-column device table wider
     than its half of the page. */
  td.note { color: #555; font-size: 10px; }
  td b { color: #111; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
  .grp { break-inside: avoid; margin-bottom: 8px; }
  td.grp { background: #eef; font-weight: 700; margin: 0; }
  .syntax { font-family: ui-monospace, Consolas, monospace; font-size: 14px; font-weight: 700; }
  .ex { background: #f4f4f4; border: 1px solid #ddd; padding: 8px 10px; border-radius: 6px; margin: 6px 0; }
  code { font-family: ui-monospace, Consolas, monospace; font-weight: 700; }
  .ex code { font-family: ui-monospace, Consolas, monospace; font-weight: 700; }
  .foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #ccc; color: #666; font-size: 10px; }
  @page { margin: 0; }
</style></head><body>
  <h1>TRC-MMS · CDS Short-Code Reference</h1>
  <p class="sub">Fault-reporting codes. A fault = <b>[Type][Parts][Variant]</b> + <b>[Action][Qty][Company]</b>.</p>

  <div class="ex">
    <div class="syntax">H&nbsp;·&nbsp;43&nbsp;·&nbsp;A&nbsp;&nbsp;·&nbsp;&nbsp;C&nbsp;·&nbsp;1&nbsp;·&nbsp;MT&nbsp;&nbsp;→&nbsp;&nbsp;<code>H43AC1MT</code></div>
    <div>H (Airbus TH1n) + 43 (Side Grip) + A (Original) + C (Change) + 1 (qty) + MT (MOTECO)</div>
    <div class="sub">Full report: <code>H43A C 1 MT 2221 6575 1</code> &nbsp;(code · action · qty · company · last 4 of tel · last 4 of ISSI · technician&nbsp;ID). Then send the agency code alone, e.g. <code>PSD</code>, to verify.</div>
    <div class="sub">Separators are free: <code>H43AC1MT222165751</code>, <code>H43A-C-1-MT-2221-6575-1</code>, <code>H43A_C_1_MT_2221_6575_1</code> and <code>H43A:C:1:MT:2221:6575:1</code> all read the same.</div>
    <div class="sub"><b>Short cuts.</b> Leave the <b>quantity</b> out for 1: <code>H43ACMT</code>. Leave the <b>type letter</b> off every code after the first — one report is one radio, so it carries down: <code>H11AC1MT 11AC1MI 2221 6666 1</code>. Write the <b>company</b> with one letter: <code>T</code> = MOTECO, <code>I</code> = MOI, so <code>H11AC1T</code>. All three together: <code>H11ACT 11ACI 2221 6666 1</code>.</div>
  </div>

  <h2>Complete code creation details</h2>
  <div class="ex">
    <div class="syntax">H43A&nbsp;C&nbsp;1&nbsp;MT&nbsp;·&nbsp;2221&nbsp;6575&nbsp;1&nbsp;·&nbsp;<code>PSD</code></div>
    <div>The report has three fields: <b>1)</b> one or more fault tokens, <b>2)</b> TEL · ISSI · Technician ID (three numbers), then <b>3)</b> the agency code sent alone to verify.</div>
  </div>
  <table>
    <tr><th class="c">Part</th><th>Example</th><th>What it is</th></tr>
    <tr><td colspan="3" class="grp">Field 1a · CDS code — the first 4 characters (e.g. H43A)</td></tr>
    <tr><td class="c">Type</td><td>H</td><td>The equipment model being worked on (see Type Letters).</td></tr>
    <tr><td class="c">Parts</td><td>43</td><td>The part being reported (see Parts Numbers).</td></tr>
    <tr><td class="c">Variant</td><td>A</td><td>Which build of that part — ${variantList}. So H43A is the TH1n side grip (Original) and H43B the 3D one.</td></tr>
    <tr><td colspan="3" class="grp">Field 1b · Action, quantity, company — straight after the code (e.g. C 1 MT)</td></tr>
    <tr><td class="c">Action</td><td>C</td><td>What was done — Change / Repair / New… (see Actions).</td></tr>
    <tr><td class="c">Quantity</td><td>1</td><td>How many of that part/action, right after the Action. Omit for a single unit.</td></tr>
    <tr><td class="c">Company</td><td>MT</td><td>Who owns / funds the work (see Companies).</td></tr>
    <tr><td colspan="3" class="grp">Field 2 · TEL · ISSI · Technician ID — three numbers (e.g. 2221 6575 1)</td></tr>
    <tr><td class="c">TEL</td><td>2221</td><td>The <b>last 4 digits</b> of the radio's telephone number, after the last fault token.</td></tr>
    <tr><td class="c">ISSI</td><td>6575</td><td>The <b>last 4 digits</b> of the radio's ISSI, right after TEL.</td></tr>
    <tr><td class="c">Tech ID</td><td>1</td><td>Who did the work, sent after ISSI (see Technician ID).</td></tr>
    <tr><td colspan="3" class="grp">Field 3 · Agency (verification) — sent alone afterwards (e.g. PSD)</td></tr>
    <tr><td class="c">Agency</td><td>PSD</td><td>Sent on its own after the report to verify it (see Agencies).</td></tr>
  </table>

  ${
    claims.length
      ? `<h2>Claimed Codes — these win over Parts + Variant</h2>
  <p class="sub">An Issue type can claim a parts+variant pair outright. Where it does, the claim decides the issue and the Parts Numbers / Variants tables are not consulted — which is how <code>99A</code> and <code>99B</code> can be two different chargers rather than two builds of one. Still type the device letter: <code>H43A</code>.</p>
  <div class="cols">${claimTables}</div>`
      : ''
  }

  <h2>Parts Numbers</h2>
  <p class="sub">Used only when no claim above covers the code. A parts number is always exactly two digits.</p>
  <div class="cols">${componentTables}</div>

  <h2>Type Letters</h2>
  <div class="cols">
    <table>${deviceRows(devices.slice(0, half))}</table>
    <table>${deviceRows(devices.slice(half))}</table>
  </div>

  <h2>Actions</h2>
  <div class="cols">
    <table>${codeRows(actions.slice(0, Math.ceil(actions.length / 2)))}</table>
    <table>${codeRows(actions.slice(Math.ceil(actions.length / 2)))}</table>
  </div>

  <h2>Companies</h2>
  <table>${codeRows(companies)}</table>

  <h2>Technician ID</h2>
  <table>${codeRows(technicians)}</table>

  <h2>Agencies (verification)</h2>
  <table>${codeRows(agencies)}</table>

  <div class="foot">${COPYRIGHT_HTML}</div>
</body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()
  const cleanup = () => setTimeout(() => iframe.remove(), 1500)
  iframe.contentWindow.onafterprint = cleanup
  setTimeout(() => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    cleanup()
  }, 250)
}

function CodeTable({ rows }) {
  return (
    <table className="ref-table">
      <tbody>
        {rows.map(([code, name]) => (
          <tr key={code}>
            <td className="ref-code">{code}</td>
            <td>{name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Whitespace-delimited word of `s` that contains index `i`.
function wordAt(s, i) {
  let a = i
  let b = i
  while (a > 0 && !/\s/.test(s[a - 1])) a -= 1
  while (b < s.length - 1 && !/\s/.test(s[b + 1])) b += 1
  return s.slice(a, b + 1)
}

// Letters not spelled in the model name come from a spoken digit instead.
const DEVICE_DERIV = {
  S: { char: '6', note: '“Six” — 6 in 680' },
  E: { char: '8', note: '“Eight” — 8 in 580' },
  N: { char: '9', note: '“Nine” — 9 in 590' },
}

// Where a device letter is taken from: the char to bold in the model name and a
// short explanation. Searches after the brand word (so "Airbus TH[R]9" wins over
// the R in "Airbus"); falls back to the spoken-digit map for S/E/N.
function deviceSource(code, name) {
  const c = String(code).trim().toUpperCase()
  const s = String(name)
  const sp = s.indexOf(' ')
  let idx = s.toUpperCase().indexOf(c, sp >= 0 ? sp + 1 : 0)
  let note = ''
  if (idx >= 0) note = `${c} in ${wordAt(s, idx)}`
  else if (DEVICE_DERIV[c]) {
    idx = s.indexOf(DEVICE_DERIV[c].char)
    note = DEVICE_DERIV[c].note
  }
  if (idx < 0) return { before: s, hit: '', after: '', note: note || '—' }
  return { before: s.slice(0, idx), hit: s[idx], after: s.slice(idx + 1), note }
}

// Device Letters: model name with its source char bolded, plus an explanation.
function DeviceTable({ rows }) {
  return (
    <table className="ref-table">
      <tbody>
        {rows.map(([code, name]) => {
          const p = deviceSource(code, name)
          return (
            <tr key={code}>
              <td className="ref-code">{code}</td>
              <td className="ref-dev-name">
                {p.before}
                <strong className="ref-hit">{p.hit}</strong>
                {p.after}
              </td>
              <td className="ref-note">{p.note}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function ReferenceCard() {
  const { map, status, updatedAt } = useCodeMap()

  // Derive display lists from the live map, falling back to bundled data.
  const data = useMemo(() => {
    const src = map || FALLBACK
    const { groups, unusable } = groupComponents(src.components || FALLBACK.components)
    return {
      devices: asPairs(src.equipmentCodes || FALLBACK.equipmentCodes),
      componentGroups: groups,
      unusableComponents: unusable,
      // Codes claimed by an Issue type (Manage inputs). Published on /codemap as
      // `faults`, derived from the issue list — so this section IS that list,
      // seen from the technician's side. Absent from the bundled fallback,
      // which predates claims, hence the ?? {}.
      claims: sortedPairs(src.faults ?? {}),
      actions: asPairs(src.actions || FALLBACK.actions),
      companies: asPairs(src.companies || FALLBACK.companies),
      agencies: sortedPairs(src.agencies || FALLBACK.agencies),
      technicians: sortedPairs(src.technicians || FALLBACK.technicians),
    }
  }, [map])

  const half = Math.ceil(data.devices.length / 2)
  const actHalf = Math.ceil(data.actions.length / 2)

  const statusLabel =
    status === 'live'
      ? `Live from admin${updatedAt ? ` · updated ${updatedAt.toLocaleTimeString('en-GB')}` : ''}`
      : status === 'loading'
        ? 'Loading live codes…'
        : 'Showing built-in defaults (couldn’t reach the code map)'

  return (
    <section className="ref-card">
      <div className="ref-head">
        <h2 className="page-title">🔤 Code Reference</h2>
        <button type="button" className="btn-pdf" onClick={() => printReference(data)}>
          🖨️ Print / Save PDF
        </button>
      </div>

      <p className="muted ref-intro">
        CDS fault-reporting short codes. A fault is{' '}
        <strong>[Type][Parts][Variant]</strong> — the 4-character CDS code — followed by{' '}
        <strong>[Action][Qty][Company]</strong>. Type, parts and variant are looked up separately, so
        one type letter is reused across every part.
      </p>

      <p className={`ref-status ${status}`}>
        <span className="ref-dot" aria-hidden="true" /> {statusLabel}
      </p>

      <div className="ref-example">
        <div className="ref-syntax">
          H · 43 · A &nbsp;·&nbsp; C · 1 · MT &nbsp;→&nbsp; <code>H43AC1MT</code>
        </div>
        <div>
          H (Airbus TH1n) + 43 (Side Grip) + A (Original) + C (Change) + 1 (qty) + MT (MOTECO)
        </div>
        <div className="muted">
          Full report: <code>H43A C 1 MT 2221 6575 1</code> — code · action · qty · company · last 4
          of tel · last 4 of ISSI · technician ID. Then send the agency code alone (e.g.{' '}
          <code>PSD</code>) to verify.
        </div>
        <div className="muted">
          Separators are free — <code>H43AC1MT222165751</code>, <code>H43A-C-1-MT-2221-6575-1</code>,{' '}
          <code>H43A_C_1_MT_2221_6575_1</code> and <code>H43A:C:1:MT:2221:6575:1</code> all read the
          same.
        </div>
        <div className="muted">
          <strong>Short cuts.</strong> Leave the <strong>quantity</strong> out for 1 —{' '}
          <code>H43ACMT</code>. Leave the <strong>type letter</strong> off every code after the
          first; one report is one radio, so it carries down —{' '}
          <code>H11AC1MT 11AC1MI 2221 6666 1</code>. Write the <strong>company</strong> with one
          letter — <code>T</code> = MOTECO, <code>I</code> = MOI — so <code>H11AC1T</code>. All three
          together: <code>H11ACT 11ACI 2221 6666 1</code>.
        </div>
      </div>

      <details className="ref-sec">
        <summary className="ref-section">Complete code creation details</summary>
        <div className="ref-sec-body">
          <div className="ref-example">
            <div className="ref-syntax">
              44HR2MT · 1234&nbsp;4567&nbsp;1 · <code>PSD</code>
            </div>
            <div>
              The report has <strong>three fields</strong>: <strong>1)</strong> one or more fault tokens,{' '}
              <strong>2)</strong> TEL · ISSI · Technician&nbsp;ID (three numbers), then{' '}
              <strong>3)</strong> the agency code sent alone to confirm.
            </div>
          </div>
          <table className="ref-table ref-detail-table">
            <thead>
              <tr>
                <th className="ref-code">Part</th>
                <th>Example</th>
                <th>What it is</th>
              </tr>
            </thead>
            <tbody>
              <tr className="ref-grp-row">
                <td colSpan={3}>
                  Field 1a · CDS code — the first 4 characters (e.g. <code>H43A</code>)
                </td>
              </tr>
              <tr>
                <td className="ref-code">Type</td>
                <td>H</td>
                <td>The equipment model being worked on (see <strong>Type Letters</strong>).</td>
              </tr>
              <tr>
                <td className="ref-code">Parts</td>
                <td>43</td>
                <td>The part being reported (see <strong>Parts Numbers</strong>).</td>
              </tr>
              <tr>
                <td className="ref-code">Variant</td>
                <td>A</td>
                <td>
                  Which build of that part —{' '}
                  {Object.entries(VARIANTS).map(([k, v], i) => (
                    <span key={k}>
                      {i ? ', ' : ''}
                      <strong>{k}</strong> = {v.label}
                    </span>
                  ))}
                  . So <code>H43A</code> is the TH1n side grip (Original) and <code>H43B</code> the 3D one.
                </td>
              </tr>

              <tr className="ref-grp-row">
                <td colSpan={3}>
                  Field 1b · Action, quantity, company — straight after the code (e.g. <code>C 1 MT</code>)
                </td>
              </tr>
              <tr>
                <td className="ref-code">Action</td>
                <td>C</td>
                <td>What was done — Change / Repair / New… (see <strong>Actions</strong>).</td>
              </tr>
              <tr>
                <td className="ref-code">Quantity</td>
                <td>1</td>
                <td>How many of that part/action, right after the Action. Omit for a single unit.</td>
              </tr>
              <tr>
                <td className="ref-code">Company</td>
                <td>MT</td>
                <td>Who owns / funds the work (see <strong>Companies</strong>).</td>
              </tr>

              <tr className="ref-grp-row">
                <td colSpan={3}>Field 2 · TEL · ISSI · Technician ID — three numbers (e.g. <code>2221 6575 1</code>)</td>
              </tr>
              <tr>
                <td className="ref-code">TEL</td>
                <td>2221</td>
                <td>The <strong>last 4 digits</strong> of the radio's telephone number, after the last fault token.</td>
              </tr>
              <tr>
                <td className="ref-code">ISSI</td>
                <td>6575</td>
                <td>The <strong>last 4 digits</strong> of the radio's ISSI, right after TEL.</td>
              </tr>
              <tr>
                <td className="ref-code">Tech&nbsp;ID</td>
                <td>1</td>
                <td>Who did the work, sent after ISSI (see <strong>Technician ID</strong>).</td>
              </tr>

              <tr className="ref-grp-row">
                <td colSpan={3}>Field 3 · Agency (verification) — sent alone afterwards (e.g. <code>PSD</code>)</td>
              </tr>
              <tr>
                <td className="ref-code">Agency</td>
                <td>PSD</td>
                <td>Sent on its own after the report to verify it (see <strong>Agencies</strong>).</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      {data.claims.length > 0 && (
        <details className="ref-sec" open>
          <summary className="ref-section">Claimed Codes — these win</summary>
          <div className="ref-sec-body">
            <p className="muted">
              An <strong>Issue type</strong> (Manage inputs) can claim a parts+variant pair outright.
              Where it does, the claim decides the issue and the Parts Numbers and Variants tables
              below are not consulted at all — which is how <code>99A</code> and <code>99B</code> can
              be two different chargers rather than two builds of one. Still type the device letter:{' '}
              <code>H43A</code>, <code>T43A</code>.
            </p>
            <div className="ref-grid">
              {chunk(data.claims, 3).map((rows, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div className="ref-block" key={i}>
                  <CodeTable rows={rows} />
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      <details className="ref-sec">
        <summary className="ref-section">Parts Numbers</summary>
        <div className="ref-sec-body">
          {data.unusableComponents.length > 0 && (
            <p className="ref-warn">
              ⚠️ {data.unusableComponents.length} entr
              {data.unusableComponents.length === 1 ? 'y' : 'ies'} in the code map{' '}
              {data.unusableComponents.length === 1 ? 'is' : 'are'} not usable and{' '}
              {data.unusableComponents.length === 1 ? 'is' : 'are'} hidden here — a parts number must
              be exactly two digits, so nothing can reach{' '}
              <code>{data.unusableComponents.map(([c]) => c).join(', ')}</code>. Remove them under{' '}
              <strong>Code Map</strong>; if one names a real part, give it an Issue type instead so it
              decodes.
            </p>
          )}
          <div className="ref-grid">
            {data.componentGroups.map((g) => (
              <div className="ref-block" key={g.title}>
                <h4 className="ref-grp-title">{g.title}</h4>
                <CodeTable rows={g.items} />
              </div>
            ))}
          </div>
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Type Letters</summary>
        <div className="ref-sec-body">
          <div className="ref-grid ref-grid-devices">
            <div className="ref-block">
              <DeviceTable rows={data.devices.slice(0, half)} />
            </div>
            <div className="ref-block">
              <DeviceTable rows={data.devices.slice(half)} />
            </div>
          </div>
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Actions</summary>
        <div className="ref-sec-body">
          <div className="ref-grid">
            <div className="ref-block">
              <CodeTable rows={data.actions.slice(0, actHalf)} />
            </div>
            <div className="ref-block">
              <CodeTable rows={data.actions.slice(actHalf)} />
            </div>
          </div>
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Companies</summary>
        <div className="ref-sec-body">
          <div className="ref-grid">
            <div className="ref-block">
              <CodeTable rows={data.companies} />
            </div>
          </div>
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Technician ID</summary>
        <div className="ref-sec-body">
          <div className="ref-grid">
            <div className="ref-block">
              <CodeTable rows={data.technicians} />
            </div>
          </div>
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Agencies (verification)</summary>
        <div className="ref-sec-body">
          <div className="ref-grid">
            <div className="ref-block">
              <CodeTable rows={data.agencies} />
            </div>
          </div>
        </div>
      </details>
    </section>
  )
}
