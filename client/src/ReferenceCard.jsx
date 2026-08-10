/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// Short-Code Reference Card.
//
// A printable cheat-sheet for the WhatsApp fault-reporting short codes. A fault
// token is [component#][device letter][action][quantity][company], e.g.
// "26HC1MT" = component 26 (LCD Display) on device H (Airbus TH1n), action C
// (Change), qty 1, company MT (MOTECO). The component NUMBER and the DEVICE
// LETTER are looked up independently — one device letter is reused across every
// component.
//
// The lists below are pulled LIVE from the whatsapp app's public code map
// (/codemap) so this page stays in sync with edits made on its admin.html.
// The bundled constants are only a fallback for when that fetch fails (offline).

import { useEffect, useMemo, useRef, useState } from 'react'
import { COPYRIGHT_HTML } from './copyright'

// Public, read-only mirror of the whatsapp code map (no PIN, CORS-open).
const CODEMAP_URL = 'https://trcmmswhatsapp-production.up.railway.app/codemap'
// Poll briskly so admin.html edits show up here almost immediately; a refetch
// also fires whenever this tab regains focus.
const POLL_MS = 4000

// ---- Fallback data (used only until the live map loads / if it fails) ----
const FALLBACK = {
  equipmentCodes: {
    H: 'Airbus TH1n', R: 'Airbus THR9', M: 'Airbus TMR880i', P: 'Sepura STP9000',
    C: 'Sepura SRG Carkit', D: 'Sepura SRG Desktop', K: 'Sepura SRG Bike',
    T: 'Hytera MT680', E: 'Hytera PT580H', N: 'Hytera PT590',
  },
  components: {
    10: 'Antenna Short (/S)', 11: 'Antenna Big (/B)', 12: 'Front Cover A', 13: 'Rear Cover B',
    14: 'Belt Clip', 15: 'UI Frame', 20: 'Main Board PCB', 25: 'Keypad', 26: 'LCD Display',
    27: 'Keypad / Keymate', 41: 'Rotary Knob', 42: 'Rotary Switch', 43: 'PTT Button',
    44: 'Microphone', 45: 'Speaker Low', 46: 'Speaker Mid', 95: 'Battery Pack',
    97: 'Charging Pin', 98: 'Charger', 99: 'Power Supply Unit',
  },
  actions: { C: 'Change', N: 'New', R: 'Repair', I: 'Install', P: 'Program / Reprogram', D: 'Dismantle' },
  companies: { MI: 'MOI', MT: 'MOTECO' },
  agencies: { PSD: 'PSD', CD: 'CD', PRI: 'PRI', MEWA: 'MEWA', KINGDOM: 'KINGDOM' },
  technicians: { 1: 'Amir', 2: 'Muhammad Rashid', 3: 'Imran', 4: 'Rasheedullah', 5: 'Maroof', 6: 'Baghdad', 7: 'Engr. Khalid', 8: 'Engr. Hamed' },
}

// Component-number buckets, so the numbers still read in tidy groups.
const COMPONENT_BUCKETS = [
  { title: 'Housing & Antenna', min: 10, max: 19 },
  { title: 'Electronics & UI', min: 20, max: 39 },
  { title: 'Audio & Controls', min: 40, max: 49 },
  { title: 'Power & Charging', min: 90, max: 99 },
]

const numericSort = ([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
// Preserve the curated brand grouping from the source map (insertion order).
const asPairs = (obj) => Object.entries(obj || {}).map(([k, v]) => [String(k), String(v)])
const sortedPairs = (obj) => asPairs(obj).sort(numericSort)

function groupComponents(components) {
  const pairs = sortedPairs(components)
  const buckets = COMPONENT_BUCKETS.map((b) => ({ title: b.title, items: [] }))
  const other = { title: 'Other', items: [] }
  for (const [code, name] of pairs) {
    const n = parseInt(code, 10)
    const idx = Number.isFinite(n) ? COMPONENT_BUCKETS.findIndex((b) => n >= b.min && n <= b.max) : -1
    if (idx >= 0) buckets[idx].items.push([code, name])
    else other.items.push([code, name])
  }
  const groups = buckets.filter((g) => g.items.length)
  if (other.items.length) groups.push(other)
  return groups
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Build a clean, standalone printable document (independent of the app layout)
// and print it through a hidden iframe — reliable for Chrome "Save as PDF".
function printReference(data) {
  const { devices, componentGroups, actions, companies, agencies, technicians } = data
  const codeRows = (pairs) =>
    pairs.map(([c, n]) => `<tr><td class="c">${esc(c)}</td><td>${esc(n)}</td></tr>`).join('')
  const half = Math.ceil(devices.length / 2)

  const componentTables = componentGroups
    .map((g) => `<div class="grp"><h3>${esc(g.title)}</h3><table>${codeRows(g.items)}</table></div>`)
    .join('')

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
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
  .grp { break-inside: avoid; margin-bottom: 8px; }
  td.grp { background: #eef; font-weight: 700; margin: 0; }
  .syntax { font-family: ui-monospace, Consolas, monospace; font-size: 14px; font-weight: 700; }
  .ex { background: #f4f4f4; border: 1px solid #ddd; padding: 8px 10px; border-radius: 6px; margin: 6px 0; }
  .ex code { font-family: ui-monospace, Consolas, monospace; font-weight: 700; }
  .foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #ccc; color: #666; font-size: 10px; }
  @page { margin: 0; }
</style></head><body>
  <h1>TRC-MMS · Short-Code Reference</h1>
  <p class="sub">WhatsApp fault-reporting codes. A fault = <b>[Component#][Device][Action][Qty][Company]</b>.</p>

  <div class="ex">
    <div class="syntax">26H&nbsp;·&nbsp;C&nbsp;·&nbsp;1&nbsp;·&nbsp;MT&nbsp;&nbsp;→&nbsp;&nbsp;<code>26HC1MT</code></div>
    <div>26 (LCD Display) + H (Airbus TH1n) + C (Change) + 1 (qty) + MT (MOTECO)</div>
    <div class="sub">Batch example: <code>26HC1MT 44HR2MT 1234 4567 1</code> &nbsp;(faults · tel · issi · technician&nbsp;ID). Then send the agency code alone, e.g. <code>PSD</code>, to confirm.</div>
  </div>

  <h2>Complete code creation details</h2>
  <div class="ex">
    <div class="syntax">44HR2MT&nbsp;·&nbsp;1234&nbsp;4567&nbsp;1&nbsp;·&nbsp;<code>PSD</code></div>
    <div>The report has three fields: <b>1)</b> one or more fault tokens, <b>2)</b> TEL · ISSI · Technician ID (three numbers), then <b>3)</b> the agency code sent alone to confirm.</div>
  </div>
  <table>
    <tr><th class="c">Part</th><th>Example</th><th>What it is</th></tr>
    <tr><td colspan="3" class="grp">Field 1 · Fault token — one or more, space-separated (e.g. 26HC1MT 44HR2MT)</td></tr>
    <tr><td class="c">Component</td><td>44</td><td>The part being reported (see Component Numbers).</td></tr>
    <tr><td class="c">Device</td><td>H</td><td>The equipment model the part belongs to (see Device Letters).</td></tr>
    <tr><td class="c">Action</td><td>R</td><td>What was done — Change / Repair / New… (see Actions).</td></tr>
    <tr><td class="c">Quantity</td><td>2</td><td>How many of that component/action, right after the Action. Omit for a single unit.</td></tr>
    <tr><td class="c">Company</td><td>MT</td><td>Who owns / funds the work (see Companies).</td></tr>
    <tr><td colspan="3" class="grp">Field 2 · TEL · ISSI · Technician ID — three numbers (e.g. 1234 4567 1)</td></tr>
    <tr><td class="c">TEL</td><td>1234</td><td>The radio's telephone number, sent after the last fault token.</td></tr>
    <tr><td class="c">ISSI</td><td>4567</td><td>The radio's Individual Short Subscriber Identity, sent right after TEL.</td></tr>
    <tr><td class="c">Tech ID</td><td>1</td><td>Who did the work, sent after ISSI (see Technician ID).</td></tr>
    <tr><td colspan="3" class="grp">Field 3 · Agency (confirmation) — sent alone afterwards (e.g. PSD)</td></tr>
    <tr><td class="c">Agency</td><td>PSD</td><td>Sent on its own after the report to confirm it (see Agencies).</td></tr>
  </table>

  <h2>Component Numbers</h2>
  <div class="cols">${componentTables}</div>

  <h2>Device Letters</h2>
  <div class="cols">
    <table>${codeRows(devices.slice(0, half))}</table>
    <table>${codeRows(devices.slice(half))}</table>
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

  <h2>Agencies (confirmation)</h2>
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

export default function ReferenceCard() {
  const [map, setMap] = useState(null) // live code map, or null until first load
  const [status, setStatus] = useState('loading') // 'loading' | 'live' | 'offline'
  const [updatedAt, setUpdatedAt] = useState(null)
  const timer = useRef(null)
  const sig = useRef('') // last payload seen, so we only re-render on real changes

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(CODEMAP_URL, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        if (!alive) return
        const next = JSON.stringify(data)
        setStatus('live')
        if (next !== sig.current) {
          sig.current = next
          setMap(data)
          setUpdatedAt(new Date())
        }
      } catch {
        if (!alive) return
        setStatus((s) => (s === 'live' ? 'live' : 'offline')) // keep last good data if we had it
      }
    }
    load()
    timer.current = setInterval(load, POLL_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      alive = false
      clearInterval(timer.current)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])

  // Derive display lists from the live map, falling back to bundled data.
  const data = useMemo(() => {
    const src = map || FALLBACK
    return {
      devices: asPairs(src.equipmentCodes || FALLBACK.equipmentCodes),
      componentGroups: groupComponents(src.components || FALLBACK.components),
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
        WhatsApp fault-reporting short codes. A fault is{' '}
        <strong>[Component#][Device][Action][Qty][Company]</strong> — the component number and the
        device letter are looked up separately, so one device letter is reused across every
        component.
      </p>

      <p className={`ref-status ${status}`}>
        <span className="ref-dot" aria-hidden="true" /> {statusLabel}
      </p>

      <div className="ref-example">
        <div className="ref-syntax">
          26H · C · 1 · MT &nbsp;→&nbsp; <code>26HC1MT</code>
        </div>
        <div>26 (LCD Display) + H (Airbus TH1n) + C (Change) + 1 (qty) + MT (MOTECO)</div>
        <div className="muted">
          Batch: <code>26HC1MT 44HR2MT 1234 4567 1</code> — faults · tel · issi · technician ID.
          Then send the agency code alone (e.g. <code>PSD</code>) to confirm.
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
                  Field 1 · Fault token — one or more, space-separated (e.g. <code>26HC1MT 44HR2MT</code>)
                </td>
              </tr>
              <tr>
                <td className="ref-code">Component</td>
                <td>44</td>
                <td>The part being reported (see <strong>Component Numbers</strong>).</td>
              </tr>
              <tr>
                <td className="ref-code">Device</td>
                <td>H</td>
                <td>The equipment model the part belongs to (see <strong>Device Letters</strong>).</td>
              </tr>
              <tr>
                <td className="ref-code">Action</td>
                <td>R</td>
                <td>What was done — Change / Repair / New… (see <strong>Actions</strong>).</td>
              </tr>
              <tr>
                <td className="ref-code">Quantity</td>
                <td>2</td>
                <td>How many of that component/action, right after the Action. Omit for a single unit.</td>
              </tr>
              <tr>
                <td className="ref-code">Company</td>
                <td>MT</td>
                <td>Who owns / funds the work (see <strong>Companies</strong>).</td>
              </tr>

              <tr className="ref-grp-row">
                <td colSpan={3}>Field 2 · TEL · ISSI · Technician ID — three numbers (e.g. <code>1234 4567 1</code>)</td>
              </tr>
              <tr>
                <td className="ref-code">TEL</td>
                <td>1234</td>
                <td>The radio's telephone number, sent after the last fault token.</td>
              </tr>
              <tr>
                <td className="ref-code">ISSI</td>
                <td>4567</td>
                <td>The radio's Individual Short Subscriber Identity, sent right after TEL.</td>
              </tr>
              <tr>
                <td className="ref-code">Tech&nbsp;ID</td>
                <td>1</td>
                <td>Who did the work, sent after ISSI (see <strong>Technician ID</strong>).</td>
              </tr>

              <tr className="ref-grp-row">
                <td colSpan={3}>Field 3 · Agency (confirmation) — sent alone afterwards (e.g. <code>PSD</code>)</td>
              </tr>
              <tr>
                <td className="ref-code">Agency</td>
                <td>PSD</td>
                <td>Sent on its own after the report to confirm it (see <strong>Agencies</strong>).</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <details className="ref-sec">
        <summary className="ref-section">Component Numbers</summary>
        <div className="ref-sec-body">
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
        <summary className="ref-section">Device Letters</summary>
        <div className="ref-sec-body">
          <div className="ref-grid">
            <div className="ref-block">
              <CodeTable rows={data.devices.slice(0, half)} />
            </div>
            <div className="ref-block">
              <CodeTable rows={data.devices.slice(half)} />
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
        <summary className="ref-section">Agencies (confirmation)</summary>
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
