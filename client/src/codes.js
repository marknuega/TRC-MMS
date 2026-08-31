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
 * The tel and the ISSI may be written out in full instead of as their last 4,
 * so long as each is its own token — the separator is what tells one number
 * from the next once they are longer than the fixed width:
 *
 *     H43A CT 1234567 1804888 1
 *
 * And a tel written in full may carry the device LETTER in front of it, exactly
 * as the entry form's Tel field takes one. The number then says which radio
 * this is, so the FIRST code may leave the letter off the same way every code
 * after it already may:
 *
 *     43A CT H1234567 1804888 1
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
import { letterForTel, optionNames, technicianName } from './options.js'
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

/**
 * The same dense string, with the separator POSITIONS kept beside it.
 *
 * Scanning still runs on the dense text — one grammar, no per-style special
 * cases. The tail is the one place that needs more, and only since the numbers
 * grew: a tel and an ISSI at their real length run together into a single
 * indivisible digit block, where the fixed 4+4 shorthand never could. Where
 * someone wrote separators they are the boundaries; where nobody did, the dense
 * reading stands exactly as it always has. See readTailTokens below.
 *
 * `dense` is denseCode(text) by construction, so the two can never disagree
 * about what a separator is.
 */
export function denseTokens(text) {
  const tokens = up(text)
    .split(/[\s\-_:.]+/)
    .filter(Boolean)
  const starts = []
  let at = 0
  for (const t of tokens) {
    starts.push(at)
    at += t.length
  }
  return { dense: tokens.join(''), tokens, starts }
}

// What is left of the tokens once `n` dense characters have been eaten by the
// fault scan. A token the scan ended INSIDE contributes only its remainder, so
// a message written densely yields the one token the old grammar always saw and
// nothing about that form changes.
function tokensFrom(n, { tokens, starts }) {
  const out = []
  for (const [i, tok] of tokens.entries()) {
    if (starts[i] + tok.length <= n) continue
    out.push(starts[i] >= n ? tok : tok.slice(n - starts[i]))
  }
  return out
}

// A tel or ISSI written as its own token may now be the WHOLE number rather
// than the last 4 — the shape the WhatsApp decoder has always accepted
// (decodeBatch reads two plain-digit tokens of any length). Four digits is
// still the memorised shorthand and still means the last 4, and "0" still
// marks whichever number is not available.
//
// Four digits is the floor. Two or three stray digits are not a number anyone
// meant as one, and reading them as one would quietly turn a mistyped
// technician ID into a tel — "H43AC1MT 22 65 1" is still technician 22651, and
// deliberately so.
const ISSI_TOKEN_RE = /^(?:\d{4,}|0)$/
// The tel may carry a leading device LETTER, as the entry form's Tel field does
// (LETTER_PREFIX_RE in options.js): "H1234567" says TH1N. That is what lets the
// code itself leave the letter off.
const TEL_TOKEN_RE = /^(?:[A-Z]?\d{4,}|0)$/

// The [tel, issi] pair `cut` tokens back from the end, or null when what sits
// there is not that shape. cut 3 leaves room for a technician ID after it, cut
// 2 does not.
function pairAt(tokens, cut) {
  if (tokens.length < cut) return null
  const tel = tokens[tokens.length - cut]
  const issi = tokens[tokens.length - cut + 1]
  return TEL_TOKEN_RE.test(tel) && ISSI_TOKEN_RE.test(issi) ? { tel, issi } : null
}

// A tel with the device letter written in front of it. Unmistakable wherever
// it sits, and that is what earns it its own rule: a fault token always carries
// three letters or more (device, variant, action, company), and an ordinary
// tail is nothing but digits, so one letter followed by nothing but digits can
// be neither.
const LETTERED_TEL_RE = /^[A-Z]\d{4,}$/

/**
 * The tel a whole message ends on, whether or not a technician ID follows it.
 *
 * Read BEFORE the fault scan, because the device letter this number may carry
 * is the very letter the first code is then allowed to omit — so it has to be
 * known before the codes are read, not after. Guessing here is safe: the real
 * tail is still read off the scan's own end position, and a wrong guess only
 * costs a seed nothing ends up using.
 *
 * A LETTERED tel is taken on its own, without the ISSI beside it to prove what
 * it is — see LETTERED_TEL_RE. The pair rule still governs what the tail MEANS
 * (a lone number is genuinely ambiguous, which is what the "0" marker is for),
 * but which device was named is a separate question, and a written letter has
 * already answered it. Without this, "T43A CT H1234567" — the letter in both
 * places, saying two different things — would go by unremarked purely because
 * the ISSI was left off.
 */
const trailingTel = (tokens) =>
  [...tokens].reverse().find((t) => LETTERED_TEL_RE.test(t)) ?? (pairAt(tokens, 3) ?? pairAt(tokens, 2))?.tel ?? ''

/**
 * The device letter a trailing tel names, or ''.
 *
 * A letter WRITTEN in front of the number is taken as written — it is the same
 * letter the code map spells a device with, and it is accepted only when the
 * map knows it. A tel with no letter goes to the models list instead, where an
 * admin's own Tel ranges answer the same question (355 is a TH1N), so a
 * technician who types the real number need not spell the device out either.
 */
function deviceFromTel(tel, devices, models) {
  const lead = up(tel)[0] ?? ''
  if (/[A-Z]/.test(lead)) return devices[lead] ? lead : ''
  const letter = letterForTel(tel, models)
  return letter && devices[letter] ? letter : ''
}

/**
 * The tail read as the tokens someone actually typed: [tel] [issi] [tech], or
 * [tel] [issi] when the technician was already given inline.
 *
 * null unless BOTH numbers are present and both are number-shaped, which is
 * what leaves the dense reading in charge of everything it used to decide: one
 * token, a lone number, a short digit run, a letters-and-digits mess — all of
 * it falls through to TAIL_RE below, unchanged. A full-length PAIR is the only
 * thing this form adds, because it is the only thing the fixed 4+4 grammar had
 * no way to say.
 */
function readTailTokens(tail, wantTechnician) {
  if (tail.length !== (wantTechnician ? 3 : 2)) return null
  const [tel, issi] = tail
  if (!TEL_TOKEN_RE.test(tel) || !ISSI_TOKEN_RE.test(issi)) return null
  // "0" is the marker for a number that is not available, never a number.
  return {
    telNumber: tel === '0' ? '' : tel,
    issiNumber: issi === '0' ? '' : issi,
    technicianId: wantTechnician ? tail[2] : '',
  }
}

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
// The DENSE tail — a run with no separators left in it. Exactly 4 digits of
// each number, and deliberately so: eight digits of tel inside a dense string
// is not a wider field, it is an unreadable one, with no way to tell where the
// tel stops and the ISSI starts. So the dense form keeps the memorised
// contract, and a decoded entry holds a genuine partial — the last 4 — which is
// the shape every report saved before full numbers existed already holds, and
// which displayNumber (report.js) renders unchanged under both export modes.
//
// A full-length number is written the way the WhatsApp decoder has always taken
// one instead: as its own token, with a separator either side (see
// readTailTokens above). The separator is what the dense form cannot supply and
// what full numbers cannot do without.
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

// Where the fault codes stop and the trailing NUMBERS begin. Deliberately
// laxer than TRAILING_TEL_ISSI_RE: all this has to recognise is that what is
// left is numbers rather than more codes, so an inline technician ID can be
// told apart from the start of an ordinary tail. Since the numbers may now run
// to their real length, "the numbers" is no longer a block of 8. What they
// actually mean is settled afterwards by the tail readers, which are strict,
// and a numeric candidate still has to be followed by a real fault code before
// it is read as a technician at all (see inlineTechnicianSplit).
const TRAILING_NUMBERS_RE = /^\d+$/

// Does `str` fully resolve as zero or more chained shorthand fault codes,
// stopping at either nothing left ('' — no more faults) or a trailing run of
// digits (the tel/ISSI, which always sits at the true end, however the
// technician was placed — see parseCodeReport's inlineTechnician branch)?
function fullyConsumesAsShortFaultChain(str) {
  let s = str
  while (s && !TRAILING_NUMBERS_RE.test(s)) {
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
  // Tokens as well as the dense string: the fault scan reads the dense form, the
  // tail reads whichever of the two the technician actually wrote (denseTokens).
  const parts = denseTokens(text)
  const src = parts.dense

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

  // The device the trailing tel names, if it names one. It seeds the scan below
  // so the FIRST code may leave its letter off — "43A CT H1234567 …" — exactly
  // as every code after the first already may. The code still outranks it:
  // FAULT_RE is tried first on every pass, so a letter that IS written wins.
  const telToken = trailingTel(parts.tokens)
  const telDevice = deviceFromTel(telToken, devices, options.models)
  // Whether that letter was written by hand rather than inferred from a Tel
  // range — see the contradiction warning at the end.
  const telLetterWritten = /[A-Z]/.test(up(telToken)[0] ?? '')

  // ---- Scan fault tokens off the front ----
  const faults = []
  let rest = src
  // Device carried forward for a token that omits it (second fault onward), or
  // seeded from the trailing tel so the first one may omit it too.
  let lastDevice = telDevice || null
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
  //
  // Two readings of the same characters, and the SEPARATED one is tried first
  // because it is the only one that can carry a full-length number. The dense
  // reading below is untouched and still decides everything the token form
  // declines to (readTailTokens says when that is), so no message that decoded
  // before decodes differently now unless it was written as a genuine pair of
  // full numbers — which the old grammar could not read at all.
  //
  // The dense string stays the authority on WHERE the tail begins: the scan's
  // own end position, so a token the scan ended inside contributes only its
  // remainder.
  const tail = tokensFrom(src.length - rest.length, parts)
  let telNumber = ''
  let issiNumber = ''
  let technician = ''
  if (!faults.length) {
    // Nothing was decoded, so there is no tail either — what is left is the
    // unreadable code itself. Reading it as a technician ID only adds a second
    // complaint about the same typo, under a heading that sends the reader to
    // the wrong field.
  } else if (inlineTechnician) {
    // The technician was already given, right after a company earlier in the
    // message — nothing else is expected here except optionally tel+ISSI
    // (full pair, or one of them with "0" marking the other not available;
    // never a second technician).
    const spaced = readTailTokens(tail, false)
    if (spaced) {
      telNumber = spaced.telNumber
      issiNumber = spaced.issiNumber
    } else if (rest && !TRAILING_TEL_ISSI_RE.test(rest)) {
      errors.push(
        `Could not read "${rest}" after the technician — expected nothing, tel + ISSI, or one of them with 0 marking the other as not available.`,
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
    const spaced = readTailTokens(tail, true)
    const dense = TAIL_RE.exec(rest)
    const strayTel = tail.find((t) => LETTERED_TEL_RE.test(t))
    if (spaced) {
      telNumber = spaced.telNumber
      issiNumber = spaced.issiNumber
      technician = resolveTechnicianName(spaced.technicianId, technicians, technicianList, warnings)
    } else if (strayTel) {
      // A lettered tel that the pair rule could not place. TAIL_RE would take
      // it for a technician ID — it is letters and digits, which is all that
      // rule asks — and the report would save with no tel at all and a
      // technician nobody recognises. Both halves of that are wrong, and the
      // one thing this token certainly is not is a technician.
      errors.push(
        `The Tel ${strayTel} needs the ISSI beside it — write both, or 0 for the one that is not known, then the technician ID.`,
      )
    } else if (!rest) {
      errors.push('Missing the tail — expected the technician ID, with the tel and ISSI in front if known.')
    } else if (!dense) {
      errors.push(`Could not read "${rest}" as the technician ID, optionally preceded by tel + ISSI.`)
    } else {
      if (dense[1] !== undefined) {
        telNumber = dense[1]
        issiNumber = dense[2]
      } else if (dense[3] !== undefined) {
        issiNumber = dense[3] // leading 0: tel not available
      } else if (dense[4] !== undefined) {
        telNumber = dense[4] // trailing 0: ISSI not available
      }
      technician = resolveTechnicianName(dense[5], technicians, technicianList, warnings)
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

  // The device letter has TWO places it may be written — in front of the parts
  // code, or in front of the tel — and the whole point of the second is that it
  // saves writing the first. So writing both is not a form to support, it is a
  // habit to head off: the moment they disagree the entry is filed against a
  // radio nobody meant, and nothing in the message says which half was the typo.
  //
  // The reminder therefore does not ask which one is right. It says to pick a
  // place and name the device there, and shows the message written both ways so
  // the choice is a glance rather than a puzzle. The code wins meanwhile — it is
  // the thing being decoded — and the message says so rather than leaving it to
  // be discovered in the preview.
  //
  // Only for a letter someone WROTE. A Tel range that happens to match a model
  // is a helpful guess, not a statement, and a guess loses without comment.
  if (telLetterWritten && telDevice && faults.length && !faults.some((f) => f.device === telDevice)) {
    const { code, device, deviceName } = faults[0]
    const digits = telToken.slice(1)
    warnings.push(
      `Two devices named: ${code} says ${deviceName ?? device}, and the Tel ${telToken} says ${
        devices[telDevice] ?? telDevice
      }. Name the device once — on the code (${code} … ${digits}) or on the Tel (${code.slice(
        1,
      )} … ${device}${digits}), not both. Decoded as ${deviceName ?? device}, from the code.`,
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
