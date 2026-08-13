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
 * The 4-char head (H43A) is the CDS code proper: [TYPE][PARTS][VARIANT], where
 * the variant separates otherwise-identical parts — H43A is the original side
 * grip, H43B the 3D-printed one. It replaces the older 3-char 26H form, which
 * put the component first and had no variant at all.
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
 */

import { useEffect, useRef, useState } from 'react'

// Public, read-only mirror of the whatsapp code map (no PIN, CORS-open).
export const CODEMAP_URL = 'https://trcmmswhatsapp-production.up.railway.app/codemap'
// Poll briskly so admin.html edits show up almost immediately; a refetch also
// fires whenever the tab regains focus.
const POLL_MS = 4000

// Bundled fallback, used only until the live map loads or if it fails (offline).
// Mirrors /codemap as of 2026-08-13 — keep it in step, or an offline decode
// quietly resolves codes to parts they no longer mean.
export const FALLBACK = {
  equipmentCodes: {
    H: 'Airbus TH1n', R: 'Airbus THR9', M: 'Airbus TMR880i', T: 'Sepura STP9000',
    C: 'Sepura SRG Carkit', D: 'Sepura SRG Desktop', B: 'Sepura SRG Bike',
    S: 'Hytera MT680', E: 'Hytera PT580H', N: 'Hytera PT590',
  },
  components: {
    10: 'Antenna', 11: 'Antenna Connector', 12: 'A Cover', 13: 'B Cover', 14: 'Belt Clip',
    15: 'DV15', 17: 'Battery Connector', 19: 'Fistmic', 20: 'Programming', 21: 'Dismantle',
    22: 'Installation', 23: 'PCB', 24: 'Handset', 25: 'Keypad', 26: 'LCD', 27: 'Keymate',
    28: 'Micro-Loud Speaker', 29: 'Speaker Base', 30: 'Antenna Base', 31: 'LCD Base',
    33: 'Fuse Cover', 41: 'Rotary Knob', 42: 'Rotary Switch', 43: 'Side Grip',
    44: 'Microphone', 45: 'Speaker Low', 46: 'Speaker Mid', 95: 'Battery Pack',
    97: 'Charging Pin', 98: 'Power Supply', 99: 'Charger',
  },
  // Suffix appended to the part name. '' is a real value, not "missing" — an
  // empty suffix is what makes A the default build.
  variants: { A: '', B: '3D' },
  actions: { C: 'Change', N: 'New', R: 'Repair', I: 'Install/Re-Install', P: 'Program/Re-program', D: 'Dismantle' },
  companies: { MI: 'MOI', MT: 'MOTECO' },
  agencies: {
    PSD: 'PUBLIC SECURITY DEPARTMENT', CD: 'CIVIL DEFENSE', PRI: 'PRISON',
    MEWA: 'MINISTRY OF ENVIRONMENT WATER & AGRICULTURE', KINGDOM: 'KINGDOM',
  },
  technicians: { 1: 'Amir', 2: 'Muhammad Rashid', 3: 'Imran', 4: 'Rasheedullah', 5: 'Maroof', 6: 'Baghdad', 7: 'Engr. Khalid', 8: 'Engr. Hamed' },
}

// The VARIANT character does not name a different part — it selects between
// builds of the SAME part, which is why its suffix is appended to the component
// name to land on the existing issue option ("SIDE GRIP" / "SIDE GRIP 3D").
//
// The suffixes live in the code map (admin-editable, shared with the WhatsApp
// bridge), so this turns that raw { code: suffix } map into { label, suffix }.
// A blank suffix reads as "Original" in the UI while adding nothing to the name.
export function variantsOf(map) {
  const raw = map?.variants ?? FALLBACK.variants
  const out = {}
  for (const [code, suffix] of Object.entries(raw)) {
    const s = String(suffix ?? '').trim()
    out[code] = { label: s || 'Original', suffix: s ? ` ${s}` : '' }
  }
  return out
}

// Convenience for the places that only need to describe the scheme, not decode.
export const VARIANTS = variantsOf(FALLBACK)

const up = (v) => String(v ?? '').trim().toUpperCase()
// Comparison key: case and punctuation carry no meaning across the two lists.
const norm = (v) => up(v).replace(/[^A-Z0-9]/g, '')

/**
 * Resolve a name from the code map onto the app's own option list.
 *
 * The two vocabularies are maintained separately (the code map on the WhatsApp
 * admin, the options in Manage Inputs), so they agree in spirit but not always
 * to the character — "SRG Carkit" over here is "SRG3900 CARKIT" over there.
 * Progressively looser matching, stopping at the first hit:
 *   1. exact once punctuation is ignored
 *   2. exact once model numbers are ignored too (SRG*3900*CARKIT)
 *   3. one is contained in the other
 * Returns null rather than guessing when nothing matches, so the caller can warn
 * instead of silently writing a value that no dropdown offers.
 */
export function matchOption(name, list) {
  const want = norm(name)
  if (!want) return null
  const opts = (list ?? []).map((o) => ({ raw: o, n: norm(o) }))

  const exact = opts.find((o) => o.n === want)
  if (exact) return exact.raw

  const bare = (s) => s.replace(/[0-9]/g, '')
  const digitless = opts.find((o) => bare(o.n) === bare(want) && bare(want).length >= 3)
  if (digitless) return digitless.raw

  // Longest match wins, NOT the first. The option list holds both "LCD" and
  // "LCD CABLE", and first-match order would resolve an LCD Cable fault to the
  // bare LCD — quietly filing it against the wrong part.
  const partial = opts
    .filter((o) => o.n.includes(want) || want.includes(o.n))
    .sort((a, b) => b.n.length - a.n.length)[0]
  return partial ? partial.raw : null
}

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

//                          type   parts  variant action  qty    company
const FAULT_RE = /^([A-Z])(\d{2})([A-Z])([A-Z])(\d*)([A-Z]{2})/
// tel(4) issi(4) technician(1+)
const TAIL_RE = /^(\d{4})(\d{4})(\d+)$/

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

  const devices = map?.equipmentCodes ?? FALLBACK.equipmentCodes
  const components = map?.components ?? FALLBACK.components
  const actions = map?.actions ?? FALLBACK.actions
  const companies = map?.companies ?? FALLBACK.companies
  const technicians = map?.technicians ?? FALLBACK.technicians
  const variants = variantsOf(map)

  if (!src) return { ok: false, errors: ['Nothing to decode.'], warnings, faults: [], entry: null }

  // ---- Scan fault tokens off the front ----
  const faults = []
  let rest = src
  let m
  while ((m = FAULT_RE.exec(rest))) {
    const [whole, device, partNo, variant, action, qty, company] = m
    rest = rest.slice(whole.length)

    const deviceName = devices[device]
    const componentName = components[partNo] ?? components[Number(partNo)]
    const actionName = actions[action]
    const companyName = companies[company]
    const v = variants[variant]

    if (!deviceName) errors.push(`Unknown type letter "${device}" in ${whole}.`)
    if (!componentName) errors.push(`Unknown parts number "${partNo}" in ${whole}.`)
    if (!actionName) errors.push(`Unknown action letter "${action}" in ${whole}.`)
    if (!companyName) errors.push(`Unknown company "${company}" in ${whole}.`)
    if (!v) errors.push(`Unknown variant "${variant}" in ${whole} — expected ${Object.keys(variants).join(' or ')}.`)

    const { type, model } = splitDevice(deviceName)
    // The variant selects a build of the part, so it is folded into the issue
    // name before matching — "Side Grip" + " 3D" -> the SIDE GRIP 3D option.
    const issueName = `${componentName ?? ''}${v?.suffix ?? ''}`.trim()
    const issue = matchOption(issueName, options.issueTypes) ?? up(issueName)
    if (componentName && !matchOption(issueName, options.issueTypes)) {
      warnings.push(`No issue type named "${issueName}" — it will be saved as typed.`)
    }

    faults.push({
      code: `${device}${partNo}${variant}`,
      device,
      deviceName,
      type: matchOption(type, options.types) ?? type,
      model: matchOption(model, options.models) ?? model,
      variant,
      variantLabel: v?.label ?? variant,
      issue,
      action: matchOption(primaryAction(actionName), options.actions) ?? primaryAction(actionName),
      actionName,
      quantity: Math.max(1, Number(qty) || 1),
      company: matchOption(companyName, options.companies) ?? up(companyName),
      companyCode: company,
    })
  }

  if (!faults.length) {
    errors.push('No fault code found. Expected a 4-character CDS code then the action, e.g. H43A C 1 MT.')
  }

  // ---- Whatever is left must be the tel / issi / technician tail ----
  let telNumber = ''
  let issiNumber = ''
  let technician = ''
  const tail = TAIL_RE.exec(rest)
  if (!rest) {
    errors.push('Missing the tail — expected last 4 of tel, last 4 of ISSI, then the technician ID.')
  } else if (!tail) {
    errors.push(`Could not read "${rest}" as tel(4) + ISSI(4) + technician ID.`)
  } else {
    telNumber = tail[1]
    issiNumber = tail[2]
    const techName = technicians[tail[3]] ?? technicians[Number(tail[3])]
    if (!techName) warnings.push(`No technician with ID ${tail[3]} — leave the field blank or pick one.`)
    else {
      technician = matchOption(techName, options.technicians) ?? up(techName)
      if (!matchOption(techName, options.technicians)) {
        warnings.push(`Technician "${techName}" is not in the Technicians list — saved as typed.`)
      }
    }
  }

  // One entry carries one device, so mixed types in a single message is a real
  // conflict rather than something to silently resolve.
  const distinct = [...new Set(faults.map((f) => f.code[0]))]
  if (distinct.length > 1) {
    errors.push(`One report covers one device, but this has ${distinct.length} (${distinct.join(', ')}). Send them separately.`)
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
