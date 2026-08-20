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
import { parseCodeReport, useCodeMap } from './codes'
import SearchSelect from './SearchSelect'

const EXAMPLE = 'H43A C 1 MT 2221 6575 1'

export default function CodeEntry({ options, agencies = [], topAgencies = [], reportDate, onCreate, busy = false }) {
  const [text, setText] = useState('')
  const [agency, setAgency] = useState('')
  const [notice, setNotice] = useState('')
  const { map, status } = useCodeMap()

  const result = useMemo(() => (text.trim() ? parseCodeReport(text, map, options) : null), [text, map, options])

  // Picking an agency IS "Create entry" — there is nothing left to confirm
  // once a verified agency is attached to an already-decoded report.
  async function create(selectedAgency) {
    if (!result?.ok || !selectedAgency || busy) return
    // The agency is the verification step, so it is attached here rather than
    // decoded — nothing in the code itself identifies it.
    await onCreate({ ...result.entry, agency: selectedAgency, reportDate })
    setNotice(`Added ${result.faults.map((f) => f.code).join(', ')} · ${selectedAgency}`)
    setText('')
    setAgency('')
    setTimeout(() => setNotice(''), 5000)
  }

  return (
    <section className="manage code-entry">
      <div className="manage-body">
        {status === 'offline' && (
          <p className="manage-hint">Using built-in codes — the live code map is unreachable.</p>
        )}

        <div className="code-input-row">
          <textarea
            className="code-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={EXAMPLE}
            spellCheck={false}
          />
          <div className="code-actions">
            <label className="agency-field">
              Agency <span className="opt">(verification)</span>
              <SearchSelect
                value={agency}
                options={agencies}
                onChange={(e) => {
                  const a = e.target.value
                  setAgency(a)
                  create(a)
                }}
                placeholder="Type to search, or pick —"
                disabled={!result?.ok || busy}
              />
            </label>
            {topAgencies.length > 0 && (
              <div className="agency-quickpicks">
                {topAgencies.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => {
                      setAgency(a)
                      create(a)
                    }}
                    disabled={!result?.ok || busy}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

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
                      <th>Action</th>
                      <th className="num">Qty</th>
                      <th>Company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.faults.map((f, i) => (
                      <tr key={`${f.code}-${i}`}>
                        <td className="ref-code nowrap">{f.code}</td>
                        <td className="nowrap">
                          {f.type} {f.model}
                        </td>
                        <td>{f.issue}</td>
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

        {notice && <p className="manage-notice">✅ {notice}</p>}

        <details className="ref-sec code-legend">
          <summary className="ref-section">What the 4 characters mean</summary>
          <div className="ref-sec-body">
            <p className="manage-hint">
              Paste a CDS report — <code>[TYPE][PARTS][VARIANT]</code> then action, qty, company, technician ID. Tel and
              ISSI are optional — give the last 4 of both together right before the technician ID, or leave both off if
              neither is known. Spaces, hyphens, underscores, colons or nothing at all all work. Example:{' '}
              <code>{EXAMPLE}</code>
            </p>
            <p className="manage-hint">
              Short cuts: drop the quantity for 1 (<code>H43ACMT</code>), drop the type letter on every code after the
              first (<code>H11AC1MT 11AC1MI …</code>), and write the company with one letter — <code>T</code> for
              MOTECO, <code>I</code> for MOI (<code>H11AC1T</code>).
            </p>
            <table className="ref-table">
              <tbody>
                <tr>
                  <td className="ref-code">
                    <span className="ref-code-badge">TYPE</span>
                  </td>
                  <td>1 letter — the equipment model (H = Airbus TH1n).</td>
                </tr>
                <tr>
                  <td className="ref-code">
                    <span className="ref-code-badge">PARTS</span>
                  </td>
                  <td>2 digits — the component (43 = Side Grip).</td>
                </tr>
                <tr>
                  <td className="ref-code">
                    <span className="ref-code-badge">VARIANT</span>
                  </td>
                  <td>
                    1 letter, and part of the code's identity rather than a build of the part before it. What{' '}
                    <code>43A</code> and <code>43B</code> each mean is set by the issue type claiming it, so they can be
                    two different items.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  )
}
