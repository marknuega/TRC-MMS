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
// This replaced the 3-character "26HC1MT" form, which led with the component
// number and had no variant, so it could not tell an original side grip from a
// 3D-printed one. That form is rejected rather than decoded — "26H" and "H26A"
// are different claims about the same string.
//
// Both decoders (this and client/src/codes.js) must agree; codemap.test.js
// pins the fault-claim half of that together.

// (device)(2-digit parts)(variant)(action)(optional qty)(2-letter company)
const FAULT_PATTERN = /^([A-Z])(\d{2})([A-Z])([A-Z])(\d*)([A-Z]{2})$/i
// The superseded form, recognised ONLY to explain itself — never decoded.
const LEGACY_PATTERN = /^(\d+)([A-Z])([A-Z])(\d+)([A-Z]{2})$/i

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

  if (!/^\d+$/.test(technicianToken)) {
    return {
      ok: false,
      reason: `The last part of the message must be the technician ID (numbers only) — found: "${technicianToken}".`,
    }
  }
  const techName = technicians[technicianToken]
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
  for (const token of working) {
    const upper = token.toUpperCase()
    const match = upper.match(FAULT_PATTERN)
    if (!match) {
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

    const [, deviceLetter, partsNum, variantLetter, actionCode, quantityRaw, companyCode] = match
    const quantity = quantityRaw === '' ? 1 : Number(quantityRaw)

    const equipmentLabel = equipmentCodes[deviceLetter]
    const actionName = actions[actionCode]
    const companyName = companies[companyCode]

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
      techId: technicianToken,
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
