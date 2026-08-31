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
import { issiPick, telForModel } from './options'
import SearchSelect from './SearchSelect'

const EXAMPLE = 'H43A C 1 MT 2221 6575 1'
const FULL_EXAMPLE = 'H43A CT 1234567 1804888 1'

export default function CodeEntry({ options, agencies = [], topAgencies = [], reportDate, onCreate, busy = false }) {
  const [text, setText] = useState('')
  const [agency, setAgency] = useState('')
  const [notice, setNotice] = useState('')
  const { map, status } = useCodeMap()

  const result = useMemo(() => (text.trim() ? parseCodeReport(text, map, options) : null), [text, map, options])

  // The agency the ISSI names, or ''. The ISSI is the number that says WHOSE
  // radio this is, and it answers that question here off the same list the
  // manual entry form reads it off (issiPick) — so a full ISSI in the code has
  // already said what this field is asking.
  //
  // Filled in, never acted on. Picking an agency IS "Create entry" here, and an
  // entry written because a number was typed rather than because a person
  // looked at it is precisely the verification this field exists to be. The
  // suggestion saves the typing and leaves the confirming.
  //
  // Only ever an agency this picker actually offers: SearchSelect displays the
  // LABEL its own options list holds for a value, so a suggestion the list does
  // not carry would leave the field looking empty while reading as filled.
  const suggested = useMemo(() => {
    const pick = result?.ok ? issiPick(result.issiNumber, options?.agencies) : ''
    return pick && agencies.includes(pick) ? pick : ''
  }, [result, options, agencies])
  // The number the record will hold, while the number that will not be held is
  // still on screen — a device letter or a stand-in prefix is swapped for the
  // real one at the save (see telForModel), on the server, after this box has
  // been cleared. Silent unless the swap actually changes something.
  const storedTel = result?.ok ? telForModel(result.telNumber, result.entry.model, options?.models) : ''

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
                value={agency || suggested}
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
                Tel <strong>{result.telNumber || '—'}</strong>
                {storedTel && storedTel !== result.telNumber && (
                  <>
                    {' '}
                    (saves as <strong>{storedTel}</strong>)
                  </>
                )}{' '}
                · ISSI <strong>{result.issiNumber || '—'}</strong> · Technician{' '}
                <strong>{result.technician || '—'}</strong>
                {suggested && (
                  <>
                    {' '}
                    · Agency <strong>{suggested}</strong> from the ISSI — pick it to create
                  </>
                )}
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
              ISSI are optional — give both together right before the technician ID, or leave both off if neither is
              known. Spaces, hyphens, underscores, colons or nothing at all all work. Example: <code>{EXAMPLE}</code>
            </p>
            <p className="manage-hint">
              Full numbers: write each one out in full and it is stored in full — <code>{FULL_EXAMPLE}</code>. Each
              needs a space (or a hyphen, underscore or colon) around it, which is what tells the tel from the ISSI once
              they are longer than 4 digits; run them together and they are read as the last 4 of each, as before.
              Either may be a single <code>0</code> for a number that is not known.
            </p>
            <p className="manage-hint">
              The tel picks the device. A tel that starts with the device letter — <code>H1234567</code> — or with a Tel
              range set under Manage inputs → Models says which radio this is, so the first code may leave its letter
              off: <code>43A CT H1234567 1804888 1</code> is the same report as <code>{FULL_EXAMPLE}</code>. Name the
              device in one place or the other, not both — <code>T43A CT H1234567 …</code> names two, and the code is
              what wins. The ISSI picks the Agency the same way, and fills it in for you to confirm.
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
