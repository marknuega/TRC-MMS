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
// component. Keep this in sync with the whatsapp app's codeMap / admin page.

// Device letters — one per radio model, reused across every component number.
const DEVICES = [
  ['H', 'Airbus TH1n'],
  ['R', 'Airbus THR9'],
  ['M', 'Airbus TMR880i'],
  ['P', 'Sepura STP9000'],
  ['C', 'Sepura SRG Carkit'],
  ['D', 'Sepura SRG Desktop'],
  ['K', 'Sepura SRG Bike'],
  ['T', 'Hytera MT680'],
  ['E', 'Hytera PT580H'],
  ['N', 'Hytera PT590'],
]

// Base component numbers (device-agnostic), grouped for readability.
const COMPONENT_GROUPS = [
  {
    title: 'Housing & Antenna',
    items: [
      ['10', 'Antenna Short (/S)'],
      ['11', 'Antenna Big (/B)'],
      ['12', 'Front Cover A'],
      ['13', 'Rear Cover B'],
      ['14', 'Belt Clip'],
      ['15', 'UI Frame'],
    ],
  },
  {
    title: 'Electronics & UI',
    items: [
      ['20', 'Main Board PCB'],
      ['25', 'Keypad'],
      ['26', 'LCD Display'],
      ['27', 'Keypad / Keymate'],
    ],
  },
  {
    title: 'Audio & Controls',
    items: [
      ['41', 'Rotary Knob'],
      ['42', 'Rotary Switch'],
      ['43', 'PTT Button'],
      ['44', 'Microphone'],
      ['45', 'Speaker Low'],
      ['46', 'Speaker Mid'],
    ],
  },
  {
    title: 'Power & Charging',
    items: [
      ['95', 'Battery Pack'],
      ['97', 'Charging Pin'],
      ['98', 'Charger'],
      ['99', 'Power Supply Unit'],
    ],
  },
]

const ACTIONS = [
  ['C', 'Change'],
  ['N', 'New'],
  ['R', 'Repair'],
  ['I', 'Install'],
  ['P', 'Program / Reprogram'],
  ['D', 'Dismantle'],
]

const COMPANIES = [
  ['MI', 'MOI'],
  ['MT', 'MOTECO'],
]

const AGENCIES = ['PSD', 'CD', 'PRI', 'MEWA', 'KINGDOM']

const TECHNICIANS = [
  ['1', 'Amir'],
  ['2', 'Muhammad Rashid'],
  ['3', 'Imran'],
  ['4', 'Rasheedullah'],
  ['5', 'Maroof'],
  ['6', 'Baghdad'],
  ['7', 'Engr. Khalid'],
  ['8', 'Engr. Hamed'],
]

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Build a clean, standalone printable document (independent of the app layout)
// and print it through a hidden iframe — reliable for Chrome "Save as PDF".
function printReference() {
  const codeRows = (pairs) =>
    pairs.map(([c, n]) => `<tr><td class="c">${esc(c)}</td><td>${esc(n)}</td></tr>`).join('')

  const componentTables = COMPONENT_GROUPS.map(
    (g) => `
      <div class="grp">
        <h3>${esc(g.title)}</h3>
        <table>${codeRows(g.items)}</table>
      </div>`
  ).join('')

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
    <table>${codeRows(DEVICES.slice(0, 5))}</table>
    <table>${codeRows(DEVICES.slice(5))}</table>
  </div>

  <h2>Component Numbers</h2>
  <div class="cols">${componentTables}</div>

  <h2>Actions</h2>
  <div class="cols">
    <table>${codeRows(ACTIONS.slice(0, 3))}</table>
    <table>${codeRows(ACTIONS.slice(3))}</table>
  </div>

  <h2>Companies · Agencies · Technicians</h2>
  <div class="cols">
    <div class="grp"><h3>Company</h3><table>${codeRows(COMPANIES)}</table></div>
    <div class="grp"><h3>Agency (confirmation)</h3><table>${AGENCIES.map((a) => `<tr><td class="c">${esc(a)}</td><td>${esc(a)}</td></tr>`).join('')}</table></div>
  </div>
  <div class="grp" style="margin-top:8px"><h3>Technician ID</h3><table>${codeRows(TECHNICIANS)}</table></div>

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
  return (
    <section className="ref-card">
      <div className="ref-head">
        <h2 className="page-title">🔤 Code Reference</h2>
        <button type="button" className="btn-pdf" onClick={printReference}>
          🖨️ Print / Save PDF
        </button>
      </div>

      <p className="muted ref-intro">
        WhatsApp fault-reporting short codes. A fault is{' '}
        <strong>[Component#][Device][Action][Qty][Company]</strong> — the component number and the
        device letter are looked up separately, so one device letter is reused across every
        component.
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
          <CodeTable rows={DEVICES.slice(0, 5)} />
        </div>
        <div className="ref-block">
          <CodeTable rows={DEVICES.slice(5)} />
        </div>
      </div>

      <h3 className="ref-section">Component Numbers</h3>
      <div className="ref-grid">
        {COMPONENT_GROUPS.map((g) => (
          <div className="ref-block" key={g.title}>
            <h4 className="ref-grp-title">{g.title}</h4>
            <CodeTable rows={g.items} />
          </div>
        ))}
      </div>

      <h3 className="ref-section">Actions</h3>
      <div className="ref-grid">
        <div className="ref-block">
          <CodeTable rows={ACTIONS.slice(0, 3)} />
        </div>
        <div className="ref-block">
          <CodeTable rows={ACTIONS.slice(3)} />
        </div>
      </div>

      <h3 className="ref-section">Companies · Agencies · Technicians</h3>
      <div className="ref-grid">
        <div className="ref-block">
          <h4 className="ref-grp-title">Company</h4>
          <CodeTable rows={COMPANIES} />
        </div>
        <div className="ref-block">
          <h4 className="ref-grp-title">Agency (confirmation)</h4>
          <CodeTable rows={AGENCIES.map((a) => [a, a])} />
        </div>
        <div className="ref-block">
          <h4 className="ref-grp-title">Technician ID</h4>
          <CodeTable rows={TECHNICIANS} />
        </div>
      </div>
    </section>
  )
}
