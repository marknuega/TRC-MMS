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

  <h2>Device Letters</h2>
  <div class="cols">
    <table>${codeRows(devices.slice(0, half))}</table>
    <table>${codeRows(devices.slice(half))}</table>
  </div>

  <h2>Component Numbers</h2>
  <div class="cols">${componentTables}</div>

  <h2>Actions</h2>
  <div class="cols">
    <table>${codeRows(actions.slice(0, Math.ceil(actions.length / 2)))}</table>
    <table>${codeRows(actions.slice(Math.ceil(actions.length / 2)))}</table>
  </div>

  <h2>Companies · Agencies · Technicians</h2>
  <div class="cols">
    <div class="grp"><h3>Company</h3><table>${codeRows(companies)}</table></div>
    <div class="grp"><h3>Agency (confirmation)</h3><table>${codeRows(agencies)}</table></div>
  </div>
  <div class="grp" style="margin-top:8px"><h3>Technician ID</h3><table>${codeRows(technicians)}</table></div>

  <div class="foot">Software Developed by Muhammad Amir · MT# MT1063 · © 2026 Muhammad Amir. All rights reserved.</div>
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

      <h3 className="ref-section">Device Letters</h3>
      <div className="ref-grid">
        <div className="ref-block">
          <CodeTable rows={data.devices.slice(0, half)} />
        </div>
        <div className="ref-block">
          <CodeTable rows={data.devices.slice(half)} />
        </div>
      </div>

      <h3 className="ref-section">Component Numbers</h3>
      <div className="ref-grid">
        {data.componentGroups.map((g) => (
          <div className="ref-block" key={g.title}>
            <h4 className="ref-grp-title">{g.title}</h4>
            <CodeTable rows={g.items} />
          </div>
        ))}
      </div>

      <h3 className="ref-section">Actions</h3>
      <div className="ref-grid">
        <div className="ref-block">
          <CodeTable rows={data.actions.slice(0, actHalf)} />
        </div>
        <div className="ref-block">
          <CodeTable rows={data.actions.slice(actHalf)} />
        </div>
      </div>

      <h3 className="ref-section">Companies · Agencies · Technicians</h3>
      <div className="ref-grid">
        <div className="ref-block">
          <h4 className="ref-grp-title">Company</h4>
          <CodeTable rows={data.companies} />
        </div>
        <div className="ref-block">
          <h4 className="ref-grp-title">Agency (confirmation)</h4>
          <CodeTable rows={data.agencies} />
        </div>
        <div className="ref-block">
          <h4 className="ref-grp-title">Technician ID</h4>
          <CodeTable rows={data.technicians} />
        </div>
      </div>
    </section>
  )
}
