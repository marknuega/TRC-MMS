/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// Turns a technician's text into report entries.
//
// Two-message flow:
//
//   Message 1 (batch): one or more fault items, space-separated, each shaped as
//     [CDS code][action][quantity][company], e.g. "H43AC1MT". Optionally
//     followed by telNumber + issiNumber (two plain-digit tokens together),
//     then ALWAYS ending with the technician id.
//     Example: "H43AC1MT H26AR2MI 2221 6575 1"
//
//   Message 2 (confirmation): the agency code alone, e.g. "PSD". Doubles as
//     both the confirmation trigger and the agency value.
//
// A fault token is [device][parts][variant][action][quantity][company], so
// "H43AC1MT" = device H (Airbus TH1n), parts 43, variant A, action C (Change),
// qty 1, company MT. The first FOUR characters are the CDS code proper.
//
// Two parts of a token may be left out:
//
//   QUANTITY, anywhere — "H11ACMT" is one piece, same as "H11AC1MT".
//
//   DEVICE, from the second fault on — "H11AC1MT 11AC1MI 2221 6666 1" repeats
//     the H. One batch is one radio (a mix of brands is refused below), so the
//     letter after the first is only ever a restatement. The first token must
//     still carry it: without a device already in hand the shorthand is
//     indistinguishable from the retired format — see LEGACY_PATTERN.
//
// And the COMPANY may be written with one letter: "11ACI" is MOI, "11AC1T" is
// MOTECO. See resolveCompany() for why it is the second letter that counts.
//
// This replaced the 3-character "26HC1MT" form, which led with the component
// number and had no variant, so it could not tell an original side grip from a
// 3D-printed one. That form is rejected rather than decoded — "26H" and "H26A"
// are different claims about the same string.
//
// Both decoders (this and client/src/codes.js) must agree; codemap.test.js
// pins the fault-claim half of that together.

// (device)(2-digit parts)(variant)(action)(optional qty)(company, 1 or 2 letters)
const FAULT_PATTERN = /^([A-Z])(\d{2})([A-Z])([A-Z])(\d*)([A-Z]{1,2})$/i
// The same token with the device letter left off, which is allowed from the
// SECOND fault on — it inherits the device from the token before it. A batch
// is one radio anyway (mixing brands is refused below), so repeating the letter
// on every code was pure typing.
const SHORT_FAULT_PATTERN = /^(\d{2})([A-Z])([A-Z])(\d*)([A-Z]{1,2})$/i
// The superseded form, recognised ONLY to explain itself — never decoded.
//
// Note this is character-for-character the same shape as SHORT_FAULT_PATTERN:
// old "26HC1MT" reads equally well as parts 26, variant H, action C, qty 1, MT.
// The two are told apart by POSITION and nothing else — the shorthand is only
// legal after a token that named a device, so a message written entirely in the
// old format still fails on its first token and gets the explanation below.
// This is the whole reason the shorthand cannot be allowed on the first token.
const LEGACY_PATTERN = /^(\d+)([A-Z])([A-Z])(\d+)([A-Z]{2})$/i

/**
 * Resolve a company code, accepting a one-letter shorthand.
 *
 * Company codes are two letters (MI = MOI, MT = MOTECO) and both begin with M,
 * so the letter that actually carries the meaning is the SECOND one — which is
 * why "I" and "T" are the shorthands rather than "M". Rather than hardcode that
 * pair, a single letter matches whichever two-letter code ends in it.
 *
 * Derived instead of stored so the Code Map stays the one place companies are
 * defined: add "PX" there and "X" works immediately, with no second list to
 * keep in step. An exact match always wins, so a genuine one-letter code in the
 * map is never shadowed by this.
 *
 * @returns {{code: string, name: string} | {ambiguous: string[]} | null}
 */
export function resolveCompany(code, companies = {}) {
  if (companies[code]) return { code, name: companies[code] }
  if (code.length !== 1) return null

  const hits = Object.keys(companies).filter((c) => c.length === 2 && c[1] === code)
  if (hits.length === 1) return { code: hits[0], name: companies[hits[0]] }
  // Two companies ending in the same letter: the shorthand cannot mean both, and
  // picking one would file work against the wrong company silently.
  if (hits.length > 1) return { ambiguous: hits }
  return null
}

/**
 * Decode a batch of fault items + optional tel/issi + technician id.
 * @param {string} rawText the technician's message
 * @param {object} map the full code map, including the derived `faults`
 * @returns {{ok: true, batch: object} | {ok: false, reason: string}}
 */
export function decodeBatch(rawText, map) {
  const {
    equipmentCodes = {},
    components = {},
    variants = {},
    faults = {},
    actions = {},
    companies = {},
    technicians = {},
  } = map ?? {}

  const tokens = String(rawText ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) {
    return { ok: false, reason: 'Message is incomplete — needs at least 1 fault code + technician ID.' }
  }

  const working = [...tokens]
  const technicianToken = working.pop()
  // Upper-cased so a technician can key off initials (e.g. "MA") as well as a
  // number, and "ma"/"MA" are the same claim — mirrors technicianIdMap() in
  // client/src/options.js.
  const techId = technicianToken.toUpperCase()

  if (!/^[A-Z0-9]+$/.test(techId)) {
    return {
      ok: false,
      reason: `The last part of the message must be the technician ID (letters/numbers, e.g. 1 or MA) — found: "${technicianToken}".`,
    }
  }
  const techName = technicians[techId]
  if (!techName) {
    return { ok: false, reason: `Unknown technician ID "${technicianToken}". Add it in Code Map if needed.` }
  }

  let telNumber = ''
  let issiNumber = ''
  if (working.length >= 2) {
    const maybeTel = working[working.length - 2]
    const maybeIssi = working[working.length - 1]
    if (/^\d+$/.test(maybeTel) && /^\d+$/.test(maybeIssi)) {
      telNumber = maybeTel
      issiNumber = maybeIssi
      working.splice(working.length - 2, 2)
    }
  }

  if (working.length === 0) return { ok: false, reason: 'No fault/component code detected in the message.' }

  const faultsRaw = []
  // The device carried forward for a token that omits it. Set by every token
  // that names one, so the shorthand always refers to the most recent letter.
  let lastDevice = null

  for (const token of working) {
    const upper = token.toUpperCase()
    let deviceLetter, partsNum, variantLetter, actionCode, quantityRaw, companyCode

    const match = upper.match(FAULT_PATTERN)
    const short = match ? null : upper.match(SHORT_FAULT_PATTERN)

    if (match) {
      ;[, deviceLetter, partsNum, variantLetter, actionCode, quantityRaw, companyCode] = match
      lastDevice = deviceLetter
    } else if (short && lastDevice) {
      ;[, partsNum, variantLetter, actionCode, quantityRaw, companyCode] = short
      deviceLetter = lastDevice
    } else if (short) {
      // Shorthand with nothing to inherit from. On its own this shape is
      // genuinely ambiguous: it is also the retired format. When it reads as
      // BOTH — "26HC1MT" does — answer both, leading with the old format, since
      // that is what someone typing it is far more likely to have meant.
      const legacy = upper.match(LEGACY_PATTERN)
      if (legacy) {
        const [, num, dev, act, qty, co] = legacy
        return {
          ok: false,
          reason:
            `"${token}" is the old code format, which is no longer accepted.\n` +
            `The device letter now comes FIRST and a variant letter follows the parts number:\n` +
            `  ${dev}${num.padStart(2, '0')}A${act}${qty}${co}   (was ${token})\n` +
            `The variant is usually A. See the Code Reference in TRC-MMS.\n` +
            `(If you meant to leave the device letter off, that only works from the SECOND code onward.)`,
        }
      }
      return {
        ok: false,
        reason:
          `"${token}" has no device letter, and it is the first code in the message so there is nothing to carry it from.\n` +
          `Start with the full code, e.g. H${token}. Later codes in the same message may drop the letter.`,
      }
    } else {
      // Name the old form specifically. "26HC1MT" is a code people typed for
      // months; a bare "not recognized" would read as the bot being broken.
      const legacy = upper.match(LEGACY_PATTERN)
      if (legacy) {
        const [, num, dev, act, qty, co] = legacy
        return {
          ok: false,
          reason:
            `"${token}" is the old code format, which is no longer accepted.\n` +
            `The device letter now comes FIRST and a variant letter follows the parts number:\n` +
            `  ${dev}${num.padStart(2, '0')}A${act}${qty}${co}   (was ${token})\n` +
            `The variant is usually A. See the Code Reference in TRC-MMS.`,
        }
      }
      return {
        ok: false,
        reason: `Couldn't recognize the fault code: "${token}". Format: [device][parts][variant][action][quantity][company], e.g. H43AC1MT.`,
      }
    }

    const quantity = quantityRaw === '' ? 1 : Number(quantityRaw)

    const equipmentLabel = equipmentCodes[deviceLetter]
    const actionName = actions[actionCode]

    const company = resolveCompany(companyCode, companies)
    if (company?.ambiguous) {
      return {
        ok: false,
        reason:
          `In "${token}": "${companyCode}" could mean ${company.ambiguous.join(' or ')}, so it is not clear which company this is.\n` +
          `Write the company code in full.`,
      }
    }
    // The canonical two-letter code, so a shorthand is recorded and echoed back
    // exactly as if it had been typed out.
    const companyName = company?.name
    if (company) companyCode = company.code

    const missing = []
    if (!equipmentLabel) missing.push(`device letter "${deviceLetter}"`)
    if (!actionName) missing.push(`action code "${actionCode}"`)
    if (!companyName) missing.push(`company code "${companyCode}"`)

    // An issue type may CLAIM this parts+variant outright, and that claim wins:
    // 99A and 99B are two different chargers, not two builds of one, so parts
    // and variant are never consulted when a claim exists. Mirrors
    // parseCodeReport() in client/src/codes.js.
    const claimed = faults[`${partsNum}${variantLetter}`]
    let componentName = claimed
    if (!claimed) {
      const partName = components[partsNum]
      // '' is a REAL suffix — it is what makes A the default build — so this
      // must test for absence, not falsiness.
      const suffix = variants[variantLetter]
      if (!partName) missing.push(`parts number "${partsNum}"`)
      if (suffix === undefined) missing.push(`variant "${variantLetter}"`)
      componentName = partName ? `${partName}${suffix ? ` ${suffix}` : ''}` : undefined
    }

    if (missing.length > 0) {
      return { ok: false, reason: `In "${token}": Unknown ${missing.join(', ')}. Add it in TRC-MMS under Code Map.` }
    }

    const [equipmentType, ...modelParts] = equipmentLabel.split(' ')

    faultsRaw.push({
      componentCode: `${deviceLetter}${partsNum}${variantLetter}`,
      componentName,
      equipmentType,
      equipmentModel: modelParts.join(' '),
      actionCode,
      actionName,
      quantity,
      companyCode,
      companyName,
    })
  }

  // Guard: mismatched brands within one batch. Each code carries its own
  // equipment via the device letter, so a batch resolving to more than one
  // BRAND is almost always a wrong code rather than an intentional multi-brand
  // job — flag it instead of silently filing entries under the wrong brand.
  const brands = [...new Set(faultsRaw.map((f) => f.equipmentType))]
  if (brands.length > 1) {
    const lines = faultsRaw.map((f) => `• "${f.componentCode}" (${f.componentName}) → ${f.equipmentType} ${f.equipmentModel}`)
    return {
      ok: false,
      reason:
        `⚠️ Mismatched parts — this batch mixes ${brands.join(' and ')} equipment in one entry:\n` +
        lines.join('\n') +
        `\nCheck the part/component code(s) used and resend the corrected batch.`,
    }
  }

  // Group by equipment — one report entry per group.
  const groups = new Map()
  for (const f of faultsRaw) {
    const key = `${f.equipmentType}|${f.equipmentModel}`
    if (!groups.has(key)) {
      groups.set(key, { equipmentType: f.equipmentType, equipmentModel: f.equipmentModel, faults: [] })
    }
    groups.get(key).faults.push(f)
  }

  return {
    ok: true,
    batch: {
      groups: [...groups.values()],
      techId,
      techName,
      telNumber,
      issiNumber,
      rawText: tokens.join(' '),
      timestamp: new Date().toISOString(),
    },
  }
}

/**
 * Decode a standalone agency-code message (the confirmation step).
 * @returns {{agencyCode: string, agencyName: string} | null}
 */
export function decodeAgencyOnly(rawText, map) {
  const text = String(rawText ?? '').trim().toUpperCase()
  if (!/^[A-Z]+$/.test(text)) return null

  const agencyName = (map?.agencies ?? {})[text]
  if (!agencyName) return null

  return { agencyCode: text, agencyName }
}
