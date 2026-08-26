/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * CDS short-code decoding.
 *
 * A report is one or more FAULT tokens followed by a numeric TAIL:
 *
 *     H  43   A       C      1     MT    2221  6575  1
 *   type parts variant action qty company  tel  issi tech
 *   └──── the 4-char CDS code ────┘
 *
 * The 4-char head (H43A) is the CDS code proper: [TYPE][PARTS][VARIANT]. The
 * variant letter is part of the code's identity, not a build of the part
 * before it: 12A is an A Cover and 12B a B Cover, two different items. Where
 * two codes ARE builds of one part the claim says so in its own name, as 43A
 * "Side Grip" and 43B "Side Grip 3D" do. It replaces the older 3-char 26H
 * form, which put the component first and had no variant at all.
 *
 * A fault code — the parts number plus the variant letter, e.g. 99B — is
 * defined by an Issue type CLAIMING it (Manage inputs -> Issue types). That is
 * the only way one resolves: a code nothing claims is refused, not guessed at.
 * So 99A and 99B are two different chargers rather than two builds of one, and
 * a code always means exactly what someone said it means.
 *
 * A code is claimed for a device, and may be claimed once PER device. Most are
 * claimed once and mean the same part on every radio, so the letter changes
 * nothing: 19B is a Fistmic whichever handset it came off. Where two rows do
 * claim one code they must cover different devices (Manage inputs refuses any
 * overlap), and then the letter is what tells them apart —
 *
 *     H44A = Battery 1590 (TH1n)      T44A = Battery 1880 (STP9000)
 *
 * two genuinely different batteries under one parts code. See claimIndex in
 * pairCode.js, which is where the letter is resolved.
 *
 * Every element may be run together or separated by a space, hyphen, underscore
 * or colon, so all of these are the same report:
 *
 *     H43A C 1 MT 2221 6575 1      H43AC1MT 2221 6575 1
 *     H43AC1MT222165751            H43A-C-1-MT-2221-6575-1
 *     H43A_C_1_MT_2221_6575_1      H43A:C:1:MT:2221:6575:1
 *
 * Separators are therefore stripped before scanning rather than parsed — one
 * dense string, one grammar, no per-style special cases.
 *
 * The agency is NOT part of the code. It is sent (or picked) separately as the
 * verification step that turns a decoded report into a real entry.
 *
 * The ACTION is one letter, with one exception: RTO (Return to Owner) is
 * written out in full, because it is a special designation rather than a
 * service action — it says the device went back untouched, which marks the
 * saved report reference-only, draws no stock and counts towards no service
 * total. It combines with any parts code, so a defective PCB handed back is
 *
 *     H 50 F  RTO  MT
 *
 * where 50F is the parts code for Defective PCB (claimed by an issue type
 * under Manage inputs) and RTO is the action.
 */

import { useEffect, useRef, useState } from 'react'
// Extension-ful so `node --test` resolves it too, not just Vite.
import { optionNames, technicianName } from './options.js'
import { claimIndex, matchOption, resolveClaim, up } from './pairCode.js'

// This app now OWNS the code map, so the mirror is same-origin. It stays a
// fetch rather than a bundled import because the map is edited at runtime and
// every open tab should pick that up without a redeploy.
export const CODEMAP_URL = '/codemap'
// Poll briskly so Code Map edits show up almost immediately; a refetch also
// fires whenever the tab regains focus.
const POLL_MS = 4000

// Bundled fallback, used only until the live map loads or if it fails (offline).
// Mirrors /codemap as of 2026-08-13 — keep it in step, or an offline decode
// quietly resolves codes to parts they no longer mean.
export const FALLBACK = {
  equipmentCodes: {
    H: 'Airbus TH1n',
    R: 'Airbus THR9',
    M: 'Airbus TMR880i',
    T: 'Sepura STP9000',
    C: 'Sepura SRG Carkit',
    D: 'Sepura SRG Desktop',
    B: 'Sepura SRG Bike',
    S: 'Hytera MT680',
    E: 'Hytera PT580H',
    N: 'Hytera PT590',
  },
  components: {
    10: 'Antenna',
    11: 'Antenna Connector',
    12: 'A Cover',
    13: 'B Cover',
    14: 'Belt Clip',
    15: 'DV15',
    17: 'Battery Connector',
    19: 'Fist Mic',
    20: 'Programming',
    21: 'Dismantle',
    22: 'Installation',
    23: 'PCB',
    24: 'Handset',
    25: 'Keypad',
    26: 'LCD',
    27: 'Keymate',
    28: 'Micro-Loud Speaker',
    29: 'Speaker Base',
    30: 'Antenna Base',
    31: 'LCD Base',
    33: 'Fuse Cover',
    41: 'Rotary Knob',
    42: 'Rotary Switch',
    43: 'Side Grip',
    44: 'Microphone',
    45: 'Speaker Low',
    46: 'Speaker Mid',
    95: 'Battery Pack',
    // 97 "Charging Pin" is retired — the item is gone from the listings. It is
    // dropped rather than kept as a dead entry because `components` is not
    // consulted by any decode (see parseCodeReport): it is the Code Reference's
    // vocabulary, so leaving 97 here would only offer a technician a part that
    // can no longer be filed. A 97 code saved before the retirement still
    // decodes, through whichever Issue type claims it.
    98: 'Power Supply',
    99: 'Charger',
  },
  // Variant letters. They no longer carry a suffix: B is not "the 3D build of
  // A" — 12A is A Cover and 12B is B Cover, a different part. A code's meaning
  // comes from the issue type claiming it, so 43B says "Side Grip 3D" in its
  // own name rather than having 3D appended to 43A's.
  variants: { A: '', B: '' },
  // RTO is keyed by its full three letters — see ACTION_ALT below.
  actions: {
    C: 'Change',
    N: 'New',
    R: 'Repair',
    I: 'Install/Re-Install',
    P: 'Program/Re-program',
    D: 'Dismantle',
    RTO: 'RTO',
  },
  companies: { MI: 'MOI', MT: 'MOTECO' },
  agencies: {
    PSD: 'PUBLIC SECURITY DEPARTMENT',
    CD: 'CIVIL DEFENSE',
    PRI: 'PRISON',
    MEWA: 'MINISTRY OF ENVIRONMENT WATER & AGRICULTURE',
    KINGDOM: 'KINGDOM',
  },
  technicians: {
    1: 'Amir',
    2: 'Muhammad Rashid',
    3: 'Imran',
    4: 'Rasheedullah',
    5: 'Maroof',
    6: 'Baghdad',
    7: 'Engr. Khalid',
    8: 'Engr. Hamed',
  },
}

// `up`, `norm` and matchOption now live beside the pair-code helpers that also
// need them (pairCode.js), so the server can reach the matcher without pulling
// this module and its React import in. Re-exported here because matchOption is
// part of this module's published surface and its callers predate the move.
export { matchOption } from './pairCode.js'

// 'Airbus TH1n' -> { type: 'AIRBUS', model: 'TH1n' }. The first word is the
// brand, which is exactly what the app stores as the entry Type.
function splitDevice(name) {
  const s = String(name ?? '').trim()
  const i = s.indexOf(' ')
  return i < 0 ? { type: up(s), model: '' } : { type: up(s.slice(0, i)), model: s.slice(i + 1).trim() }
}

// 'Install/Re-Install' -> 'INSTALL'. The map documents both directions of an
// action in one label; the entry records the plain one.
const primaryAction = (name) => up(String(name ?? '').split('/')[0])

// Strip every supported separator so one grammar covers all six write-ups.
export const denseCode = (text) => up(text).replace(/[\s\-_:.]+/g, '')

// The action is normally ONE letter, but RTO (Return to Owner) is spelled out
// in full — it is a special designation rather than a service action, and a
// single letter for it would read as noise next to C/R/N. It is tried FIRST so
// the three characters are taken as one action rather than "R" followed by a
// two-letter company; "TO" names no company, so no existing code changes
// meaning. Any future multi-character action joins the same alternation.
const ACTION_ALT = 'RTO|[A-Z]'
//                          type   parts  variant      action        qty    company
const FAULT_RE = new RegExp(`^([A-Z])(\\d{2})([A-Z])(${ACTION_ALT})(\\d*)([A-Z]{1,2})`)
// The same token with the device letter left off — legal from the SECOND fault
// on, inheriting the device from the one before it. One report is one device
// (enforced below), so repeating the letter was only ever a restatement.
const SHORT_FAULT_RE = new RegExp(`^(\\d{2})([A-Z])(${ACTION_ALT})(\\d*)([A-Z]{1,2})`)
// The entry FORM takes a full tel / ISSI now, and the record stores whatever
// was typed. This code format still carries exactly 4 digits of each, and
// deliberately so: it is a contract shared with the WhatsApp decoder and with
// every technician who has memorised it, and eight digits of tel typed into a
// dense string is a different grammar, not a wider field. A decoded entry
// therefore holds a genuine partial — the last 4 — which is exactly the shape
// every report saved before full numbers existed already holds, and which
// displayNumber (report.js) renders unchanged under both export modes. Someone
// who wants the whole number on a code-created entry types it into that entry.
//
// tel(4) issi(4) technician(1+, letters or digits — a numeric ID or an
// initials claim), OR just the technician alone with tel/issi both left off,
// OR just ONE of tel/issi — a single "0" placeholder marks the other as not
// available: "0" then 4 digits = ISSI only (tel not available); 4 digits
// then "0" = tel only (ISSI not available). Mirrors decodeBatch() in
// server/src/whatsapp/decoder.js, which only ever consumes tel+issi as a
// full PAIR — a technician typing there still needs a real placeholder
// digit for the missing one, since there is no single-token equivalent of
// this "0" marker in a space-tokenized message.
const TAIL_RE = /^(?:(\d{4})(\d{4})|0(\d{4})|(\d{4})0)?([A-Z0-9]+)$/

// A technician ID given once, right after ANY fault's company, applies to
// the whole message — later fault codes never need to repeat it. Only
// codes.js's dense (no separators, no token boundaries) format needs this:
// the WhatsApp decoder tokenizes on whitespace, so the technician there is
// already an unambiguous, separate, always-last token — this problem does
// not exist for it.
//
// Realistic technician IDs are short (Manage Inputs: a numeric id, or a 2/3
// -letter initials claim), so the search only tries a few lengths — this
// keeps it far below the length of a genuine tel+ISSI block (8 digits), so
// the standard "tech only at the very end" form is never mistaken for one.
const MAX_INLINE_TECH_LEN = 4

// A trailing tel/ISSI block: the full 8-digit pair, or just one of them with
// a single "0" marking the other as not available (see TAIL_RE above).
const TRAILING_TEL_ISSI_RE = /^(?:\d{8}|0\d{4}|\d{4}0)$/

// Does `str` fully resolve as zero or more chained shorthand fault codes,
// stopping at either nothing left ('' — no more faults) or a trailing
// tel/ISSI block (which always sits at the true end, however the
// technician was placed — see parseCodeReport's inlineTechnician branch)?
function fullyConsumesAsShortFaultChain(str) {
  let s = str
  while (s && !TRAILING_TEL_ISSI_RE.test(s)) {
    const m = SHORT_FAULT_RE.exec(s)
    if (!m) return false
    s = s.slice(m[0].length)
  }
  return true
}

// Look for a technician ID sitting right after a company. The token must be
// a REGISTERED technician — matching only on shape (like the end-of-line
// tail does) would risk silently swallowing a typo'd fault code as a bogus
// "technician ID" instead of surfacing a clear parse error.
//
// A token containing a LETTER (initials, e.g. "MA") is unambiguous on its
// own — the ordinary end-of-line tail is nothing but digits, so a lettered
// token can never be confused with it. It is accepted whatever follows:
// nothing, a bare tel+ISSI block, or more real fault codes.
//
// A PURELY NUMERIC token has no such anchor: read backwards, it is exactly
// as plausible as the start of the ordinary tel(4)+ISSI(4)+technician tail
// (also nothing but digits), so it is only accepted when a real fault code
// (2 digits + a variant LETTER, per SHORT_FAULT_RE) immediately follows —
// proof this position is genuinely mid-message, not the trailing tail.
function inlineTechnicianSplit(str, technicians) {
  for (let len = 1; len <= Math.min(MAX_INLINE_TECH_LEN, str.length); len++) {
    const token = str.slice(0, len)
    const known = technicians[token] ?? technicians[Number(token)]
    if (!known) continue
    const remainder = str.slice(len)
    if (!/[A-Z]/.test(token) && !SHORT_FAULT_RE.test(remainder)) continue
    if (fullyConsumesAsShortFaultChain(remainder)) return { token, remainder }
  }
  return null
}

// Shared by both places a technician ID gets resolved (inline and end-of-
// line) so the two can never drift into different messages/behaviour.
function resolveTechnicianName(id, technicians, technicianList, warnings) {
  const techName = technicians[id] ?? technicians[Number(id)]
  if (!techName) {
    warnings.push(`No technician with ID ${id} — leave the field blank or pick one.`)
    return ''
  }
  const matched = matchOption(techName, technicianList)
  if (!matched) warnings.push(`Technician "${techName}" is not in the Technicians list — saved as typed.`)
  return matched ?? up(techName)
}

/**
 * Resolve a company code, accepting a one-letter shorthand: "I" is MOI, "T" is
 * MOTECO. Both real codes start with M, so the second letter is the one that
 * carries the meaning — hence a single letter matches whichever two-letter code
 * ENDS in it, rather than a hardcoded pair. Add "PX" to the Code Map and "X"
 * works immediately.
 *
 * Deliberately duplicated from the WhatsApp decoder rather than shared: this
 * module imports React, so the server cannot load it. codes.test.js runs the
 * same cases through both, so a drift fails a test instead of quietly filing
 * work against the wrong company.
 *
 * @returns {{code, name} | {ambiguous: string[]} | null}
 */
export function resolveCompany(code, companies = {}) {
  if (companies[code]) return { code, name: companies[code] }
  if (code.length !== 1) return null
  const hits = Object.keys(companies).filter((c) => c.length === 2 && c[1] === code)
  if (hits.length === 1) return { code: hits[0], name: companies[hits[0]] }
  if (hits.length > 1) return { ambiguous: hits }
  return null
}

/**
 * Decode a full code report.
 *
 * @param {string} text    raw message, in any of the separator styles
 * @param {object} map     live code map (falls back to FALLBACK per section)
 * @param {object} options the app's dropdown lists, for resolving names
 * @returns {{ok, errors, warnings, faults, telNumber, issiNumber, technician, entry}}
 */
export function parseCodeReport(text, map = FALLBACK, options = {}) {
  const errors = []
  const warnings = []
  const src = denseCode(text)

  // The shared vocabulary the code map still owns: which letter is which
  // radio, which letter is which action, and the company/technician codes.
  // `components` and `variants` are deliberately NOT read here — a fault code
  // resolves through its claim or not at all.
  const devices = map?.equipmentCodes ?? FALLBACK.equipmentCodes
  const actions = map?.actions ?? FALLBACK.actions
  const companies = map?.companies ?? FALLBACK.companies
  const technicians = map?.technicians ?? FALLBACK.technicians
  // An Issue type claims a whole fault code (Manage inputs -> Issue types).
  // This is the ONLY way parts + variant resolves to an issue. Keyed per
  // device where two rows claim one code — see claimIndex in pairCode.js.
  const claimed = claimIndex(options.issueTypes, devices)
  // Manage Inputs technicians may carry an {name, id} shape now (for the
  // WhatsApp ID); matchOption below only ever needs the plain name.
  const technicianList = (options.technicians ?? []).map(technicianName)
  // Models may carry a {name, prefixes} shape now (for the Tel auto-select);
  // matchOption below only ever needs the plain name.
  const modelList = optionNames(options.models)

  if (!src) return { ok: false, errors: ['Nothing to decode.'], warnings, faults: [], entry: null }

  // ---- Scan fault tokens off the front ----
  const faults = []
  let rest = src
  // Device carried forward for a token that omits it (second fault onward).
  let lastDevice = null
  // Set once a technician ID is found sitting right after some fault's
  // company — everything from there on is resolved from it rather than the
  // end-of-line tail (see inlineTechnicianSplit()).
  let inlineTechnician = null
  let m
  for (;;) {
    let device
    let whole, partNo, variant, action, qty, company

    if ((m = FAULT_RE.exec(rest))) {
      ;[whole, device, partNo, variant, action, qty, company] = m
      lastDevice = device
    } else if (lastDevice && (m = SHORT_FAULT_RE.exec(rest))) {
      ;[whole, partNo, variant, action, qty, company] = m
      device = lastDevice
    } else if (lastDevice && !inlineTechnician) {
      // No more fault codes match directly — before giving up, check whether
      // a technician ID was placed right here, with more fault codes after
      // it (the whole point: state the technician once, not per code).
      const found = inlineTechnicianSplit(rest, technicians)
      if (!found) break
      inlineTechnician = found.token
      rest = found.remainder
      continue
    } else {
      break
    }

    // Separators are stripped before scanning, so a one-letter company sitting
    // in front of a full code is ambiguous: in "H11AC1T" + "H43AC1MT" the
    // greedy company match takes "TH" and eats the next token's device letter.
    // If two letters name no company but the first one does, give the second
    // character back to the input rather than failing on a code the technician
    // wrote correctly.
    if (company.length === 2 && !resolveCompany(company, companies) && resolveCompany(company[0], companies)) {
      company = company[0]
      whole = whole.slice(0, -1)
    }

    rest = rest.slice(whole.length)

    const code = `${device}${partNo}${variant}`
    // The device letter is consulted FIRST and the shared claim second, so a
    // code one row claims still means the same thing on every radio, while a
    // code claimed once per device resolves to that device's own part.
    const owner = resolveClaim(claimed, device, `${partNo}${variant}`)

    const deviceName = devices[device]
    const actionName = actions[action]

    const resolved = resolveCompany(company, companies)
    if (resolved?.ambiguous) {
      errors.push(
        `"${company}" in ${whole} could be ${resolved.ambiguous.join(' or ')} — write the company code in full.`,
      )
    }
    // Canonicalise, so a shorthand is stored and displayed as the full code.
    const companyCode = resolved?.code ?? company
    const companyName = resolved?.name

    if (!deviceName) errors.push(`Unknown type letter "${device}" in ${whole}.`)
    if (!actionName) errors.push(`Unknown action letter "${action}" in ${whole}.`)
    if (!companyName && !resolved?.ambiguous) errors.push(`Unknown company "${company}" in ${whole}.`)

    let issue
    let variantLabel
    if (owner) {
      // The code is spoken for, so parts and variant are never consulted — H99B
      // can be the Charger-DEY without 99 or B meaning anything on their own.
      issue = owner
      // By the same token there is no build to name: the trailing letter is
      // part of the identity, and the code itself is already its own column.
      variantLabel = '—'
    } else {
      // A claim is the ONLY way a fault code resolves. There used to be a
      // fallback that looked the parts number up in the code map and appended
      // the variant's suffix, which meant a code could decode to a name no
      // issue type actually had — saved as typed, and only approximately what
      // the technician meant. An undefined code is now refused outright, and
      // the message says exactly where to define it.
      // Claimed for OTHER devices but not this one is a different mistake from
      // never defined at all, and it has a different fix — tick this device on
      // the row that already holds the code, rather than inventing a second.
      const perDevice = Object.keys(claimed).some((k) => k.length === 4 && k.slice(1) === `${partNo}${variant}`)
      errors.push(
        perDevice
          ? `${partNo}${variant} is claimed per device and no issue type claims ${code}. Tick ${
              deviceName ?? `device ${device}`
            } on a ${partNo}${variant} row under Manage inputs → Issue types.`
          : `${partNo}${variant} in ${whole} is not a defined code. Give an issue type the code ${partNo}${variant} under Manage inputs → Issue types.`,
      )
      issue = ''
      variantLabel = variant
    }

    const { type, model } = splitDevice(deviceName)

    faults.push({
      code,
      device,
      deviceName,
      type: matchOption(type, options.types) ?? type,
      model: matchOption(model, modelList) ?? model,
      variant,
      variantLabel,
      issue,
      action: matchOption(primaryAction(actionName), options.actions) ?? primaryAction(actionName),
      actionName,
      quantity: Math.max(1, Number(qty) || 1),
      company: matchOption(companyName, options.companies) ?? up(companyName),
      companyCode,
    })
  }

  if (!faults.length) {
    // Distinguish "nothing recognisable" from "started with the shorthand",
    // which is a near miss and otherwise reads as the whole code being wrong.
    errors.push(
      SHORT_FAULT_RE.test(src)
        ? 'The first code must start with the device letter, e.g. H43A C 1 MT. Later codes in the same report may leave it off.'
        : 'No fault code found. Expected a 4-character CDS code then the action, e.g. H43A C 1 MT.',
    )
  }

  // ---- Resolve tel / ISSI / technician ----
  let telNumber = ''
  let issiNumber = ''
  let technician = ''
  if (inlineTechnician) {
    // The technician was already given, right after a company earlier in the
    // message — nothing else is expected here except optionally tel+ISSI
    // (full pair, or one of them with "0" marking the other not available;
    // never a second technician).
    if (rest && !TRAILING_TEL_ISSI_RE.test(rest)) {
      errors.push(
        `Could not read "${rest}" after the technician — expected nothing, tel(4) + ISSI(4), or one of them with 0 marking the other as not available.`,
      )
    } else if (/^\d{8}$/.test(rest)) {
      telNumber = rest.slice(0, 4)
      issiNumber = rest.slice(4, 8)
    } else if (/^0\d{4}$/.test(rest)) {
      issiNumber = rest.slice(1) // leading 0: tel not available
    } else if (/^\d{4}0$/.test(rest)) {
      telNumber = rest.slice(0, 4) // trailing 0: ISSI not available
    }
    technician = resolveTechnicianName(inlineTechnician, technicians, technicianList, warnings)
  } else {
    // ---- Otherwise whatever is left must be the tel / issi / technician tail ----
    const tail = TAIL_RE.exec(rest)
    if (!rest) {
      errors.push(
        'Missing the tail — expected the technician ID, with last 4 of tel + last 4 of ISSI in front if known.',
      )
    } else if (!tail) {
      errors.push(`Could not read "${rest}" as the technician ID, optionally preceded by tel(4) + ISSI(4).`)
    } else {
      if (tail[1] !== undefined) {
        telNumber = tail[1]
        issiNumber = tail[2]
      } else if (tail[3] !== undefined) {
        issiNumber = tail[3] // leading 0: tel not available
      } else if (tail[4] !== undefined) {
        telNumber = tail[4] // trailing 0: ISSI not available
      }
      technician = resolveTechnicianName(tail[5], technicians, technicianList, warnings)
    }
  }

  // One entry carries one device, so mixed types in a single message is a real
  // conflict rather than something to silently resolve.
  const distinct = [...new Set(faults.map((f) => f.code[0]))]
  if (distinct.length > 1) {
    errors.push(
      `One report covers one device, but this has ${distinct.length} (${distinct.join(', ')}). Send them separately.`,
    )
  }

  const ok = errors.length === 0
  return {
    ok,
    errors,
    warnings,
    faults,
    telNumber,
    issiNumber,
    technician,
    entry: ok
      ? {
          technician,
          telNumber,
          issiNumber,
          type: faults[0].type,
          model: faults[0].model,
          comment: '',
          faults: faults.map((f) => ({
            issue: f.issue,
            quantity: f.quantity,
            action: f.action,
            company: f.company,
            status: 'New',
          })),
        }
      : null,
  }
}

/** Live code map with the bundled fallback, shared by the reference card and
 *  the code-entry box so both always describe the same vocabulary. */
export function useCodeMap() {
  const [map, setMap] = useState(null)
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
        setStatus((s) => (s === 'live' ? 'live' : 'offline')) // keep last good data
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

  return { map, status, updatedAt }
}
