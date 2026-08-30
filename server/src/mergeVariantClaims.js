/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Fold a code claimed once per device into ONE row that names itself per
 * device — the shape 99A and 15B are already in, and 44A and 44B are not.
 *
 * A code may legitimately be claimed once per device: 44A is Battery 1590 on a
 * TH1n and Battery 1880 on an STP9000, two genuinely different batteries off
 * two different shelves. issueModelsOverlap is what allows that, and what stops
 * two rows answering for the SAME radio. There are two ways to hold it, and the
 * list currently holds both:
 *
 *   99A  one row, models [TH1n, STP9000], names { STP9000: "ChargerSC2" }
 *   44A  two rows, one narrowed to TH1n, one narrowed to STP9000
 *
 * They mean the same thing and read differently. On a Manage Inputs card the
 * first is one variant with its devices under it and one edit button; the
 * second is two rows that only look like one, with two edit buttons and a blank
 * where the second letter would go. The second shape is also what makes a code
 * "contested" in report.js, which then declines to treat it as an identity and
 * falls its rows back to their own names.
 *
 * The planning is here, apart from the script that runs it, because it decides
 * what happens to somebody's parts vocabulary and that is worth a test. The
 * script (scripts/merge-variant-claims.js) is the CLI around it.
 */
import {
  issueCode,
  issueName,
  issueModels,
  issueNarrowed,
  issueNameOverrides,
  modelKey,
} from '../../client/src/options.js'

// The fields a claim is allowed to carry. Anything else on a row being merged
// AWAY would be dropped silently, so its group is skipped and reported instead.
const KNOWN_FIELDS = new Set(['name', 'parts', 'variant', 'base', 'models', 'names'])

const extraFields = (t) => Object.keys(t ?? {}).filter((k) => !KNOWN_FIELDS.has(k))

/**
 * What would be merged, and what would deliberately not be.
 *
 * Nothing is renamed and nothing is lost: every name in the list stays in it,
 * as a row name or as a per-device override, and issueAllNames() reads both —
 * which is what resolves a fault's stored name back to its code.
 *
 * @returns {{merges: {code,base,merged,dropped}[], skipped: {code,why}[], multi: number}}
 */
export function planMerges(issueTypes) {
  const list = Array.isArray(issueTypes) ? issueTypes : []

  // Code -> the rows claiming it, in list order. Order matters: the first row
  // keeps its name, and it is the line the card already leads with.
  const byCode = new Map()
  for (const t of list) {
    const code = issueCode(t) // '' unless BOTH parts and variant are present
    if (!code || !issueName(t)) continue
    if (!byCode.has(code)) byCode.set(code, [])
    byCode.get(code).push(t)
  }

  const merges = []
  const skipped = []
  let multi = 0

  for (const [code, rows] of byCode) {
    if (rows.length < 2) continue
    multi += 1

    // Un-narrowed means "every device", so there is no per-device name to write
    // it in as — merging would quietly narrow a part nobody narrowed.
    const unnarrowed = rows.filter((r) => !issueNarrowed(r))
    if (unnarrowed.length) {
      skipped.push({ code, why: `${unnarrowed.length} of ${rows.length} row(s) are not narrowed to any device` })
      continue
    }

    // H44A must have exactly one answer. Two rows claiming the same radio is a
    // conflict for a person to settle, not one to fold into a row where one
    // name would silently win.
    const seen = new Map() // modelKey -> the row that claimed it
    let clash = ''
    for (const r of rows) {
      for (const m of issueModels(r)) {
        const k = modelKey(m)
        if (seen.has(k)) clash ||= `${m} is claimed by both "${seen.get(k)}" and "${issueName(r)}"`
        else seen.set(k, issueName(r))
      }
    }
    if (clash) {
      skipped.push({ code, why: clash })
      continue
    }

    const dropped = rows.slice(1)
    const odd = dropped.flatMap((r) => extraFields(r).map((f) => `"${issueName(r)}" carries an unknown field ${f}`))
    if (odd.length) {
      skipped.push({ code, why: odd.join('; ') })
      continue
    }

    const [base] = rows
    const baseName = issueName(base)

    // Every device from every row, in the order the rows are listed, so the
    // merged row's devices read down the card the way they did before.
    const models = []
    for (const r of rows) for (const m of issueModels(r)) models.push(m)

    // Overrides already stored on any row are carried across first, then each
    // dropped row's own name is written in for the devices it was narrowed to.
    // An override equal to the merged row's own name is not stored: the row
    // already says that, and a duplicate is a second copy to drift.
    const names = {}
    for (const r of rows) for (const [m, n] of Object.entries(issueNameOverrides(r))) names[m] = n
    for (const r of dropped) {
      const n = issueName(r)
      for (const m of issueModels(r)) {
        if (modelKey(n) === modelKey(baseName)) delete names[m]
        else names[m] = n
      }
    }

    const merged = { ...base, name: baseName, models }
    if (Object.keys(names).length) merged.names = names
    else delete merged.names

    merges.push({ code, base, merged, dropped })
  }

  return { merges, skipped, multi }
}

/**
 * The list with the plan applied. The merged row takes the FIRST claim's
 * position, so the order the cards are drawn from does not shuffle.
 */
export function mergedList(issueTypes, merges) {
  const list = Array.isArray(issueTypes) ? issueTypes : []
  const replaceAt = new Map((merges ?? []).map((m) => [m.base, m.merged]))
  const drop = new Set((merges ?? []).flatMap((m) => m.dropped))
  const out = []
  for (const t of list) {
    if (drop.has(t)) continue
    out.push(replaceAt.get(t) ?? t)
  }
  return out
}
