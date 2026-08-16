/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Paste a CDS short code, see exactly what it decodes to, then confirm it with
 * an agency to create the entry — the same three fields the WhatsApp flow uses,
 * without the WhatsApp round-trip.
 *
 * The decode preview is not decoration: the code map and the app's dropdowns are
 * maintained separately, so showing the resolved Type/Model/Issue BEFORE saving
 * is what stops a near-miss match from being written silently.
 */

import { useMemo, useState } from 'react'
import { parseCodeReport, useCodeMap, VARIANTS } from './codes'

const EXAMPLE = 'H43A C 1 MT 2221 6575 1'

export default function CodeEntry({ options, agencies = [], reportDate, onCreate, busy = false }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [agency, setAgency] = useState('')
  const [notice, setNotice] = useState('')
  const { map, status } = useCodeMap()

  const result = useMemo(
    () => (text.trim() ? parseCodeReport(text, map, options) : null),
    [text, map, options],
  )

  const canCreate = !!result?.ok && !!agency && !busy

  async function create() {
    if (!canCreate) return
    // The agency is the verification step, so it is attached here rather than
    // decoded — nothing in the code itself identifies it.
    await onCreate({ ...result.entry, agency, reportDate })
    setNotice(`Added ${result.faults.map((f) => f.code).join(', ')} · ${agency}`)
    setText('')
    setTimeout(() => setNotice(''), 5000)
  }

  return (
    <section className="manage code-entry">
      <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>🔤 Quick code entry</span>
        <span className="chev">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="manage-body">
          <p className="manage-hint">
            Paste a CDS report — <code>[TYPE][PARTS][VARIANT]</code> then action, qty, company, technician ID. Tel and
            ISSI are optional — give the last 4 of both together right before the technician ID, or leave both off if
            neither is known. Spaces, hyphens, underscores, colons or nothing at all all work.
            Example: <code>{EXAMPLE}</code>
            {status === 'offline' && ' · using built-in codes (code map unreachable)'}
          </p>
          <p className="manage-hint">
            Short cuts: drop the quantity for 1 (<code>H43ACMT</code>), drop the type letter on every
            code after the first (<code>H11AC1MT 11AC1MI …</code>), and write the company with one
            letter — <code>T</code> for MOTECO, <code>I</code> for MOI (<code>H11AC1T</code>).
          </p>

          <textarea
            className="code-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={EXAMPLE}
            spellCheck={false}
          />

          {result && (
            <div className="code-preview">
              {result.errors.map((msg) => (
                <p className="code-msg error" key={msg}>
                  ✕ {msg}
                </p>
              ))}
              {result.warnings.map((msg) => (
                <p className="code-msg warn" key={msg}>
                  ⚠ {msg}
                </p>
              ))}

              {result.faults.length > 0 && (
                <div className="inv-scroll">
                  <table className="inv-table sp-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Device</th>
                        <th>Part</th>
                        <th>Variant</th>
                        <th>Action</th>
                        <th className="num">Qty</th>
                        <th>Company</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.faults.map((f, i) => (
                        <tr key={`${f.code}-${i}`}>
                          <td className="ref-code nowrap">{f.code}</td>
                          <td className="nowrap">{f.type} {f.model}</td>
                          <td>{f.issue}</td>
                          <td className="nowrap">{f.variantLabel}</td>
                          <td className="nowrap">{f.action}</td>
                          <td className="num">{f.quantity}</td>
                          <td className="nowrap">{f.company}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.ok && (
                <p className="saved-hint">
                  Tel <strong>{result.telNumber}</strong> · ISSI <strong>{result.issiNumber}</strong> · Technician{' '}
                  <strong>{result.technician || '—'}</strong>
                </p>
              )}
            </div>
          )}

          <div className="code-actions">
            <label>
              Agency <span className="opt">(verification)</span>
              <select value={agency} onChange={(e) => setAgency(e.target.value)} required>
                <option value="">— select —</option>
                {agencies.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <button type="button" className="submit" onClick={create} disabled={!canCreate}>
              Create entry
            </button>
          </div>

          {result?.ok && !agency && (
            <p className="manage-hint">Pick the agency to verify this report before it is added.</p>
          )}
          {notice && <p className="manage-notice">✅ {notice}</p>}

          <details className="ref-sec code-legend">
            <summary className="ref-section">What the 4 characters mean</summary>
            <div className="ref-sec-body">
              <table className="ref-table">
                <tbody>
                  <tr>
                    <td className="ref-code">TYPE</td>
                    <td>1 letter — the equipment model (H = Airbus TH1n).</td>
                  </tr>
                  <tr>
                    <td className="ref-code">PARTS</td>
                    <td>2 digits — the component (43 = Side Grip).</td>
                  </tr>
                  <tr>
                    <td className="ref-code">VARIANT</td>
                    <td>
                      1 letter — which build of that part:{' '}
                      {Object.entries(VARIANTS).map(([k, v], i) => (
                        <span key={k}>
                          {i ? ', ' : ''}
                          <strong>{k}</strong> = {v.label}
                        </span>
                      ))}
                      .
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  )
}
