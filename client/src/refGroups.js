/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Which parts numbers the Code Reference may show, and how they are grouped.
 *
 * Kept out of ReferenceCard.jsx so it can be tested directly — node --test
 * cannot load .jsx — and because the rule it enforces is not presentation. A
 * parts number is exactly two digits because that is what both decoders look
 * up; anything else in the map is unreachable, and printing it on the card a
 * technician works from invites a report filed against the wrong part.
 */

// Component-number buckets, so the numbers still read in tidy groups.
export const COMPONENT_BUCKETS = [
  { title: 'Housing & Antenna', min: 10, max: 19 },
  { title: 'Electronics & UI', min: 20, max: 39 },
  { title: 'Audio & Controls', min: 40, max: 49 },
  { title: 'Power & Charging', min: 90, max: 99 },
]

// Mirrors the parts group in FAULT_RE (codes.js) and FAULT_PATTERN (the
// WhatsApp decoder). All three must agree on what a parts number is.
export const PARTS_RE = /^\d{2}$/

const numericSort = ([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/**
 * Split the components map into what a technician can actually type and what
 * cannot be reached at all.
 *
 * The unusable entries used to appear under "Other", reading as a fifth
 * category of ordinary parts. That is worse than omitting them: someone would
 * type H99A expecting "Charger818" and file a "Charger", because a claimed code
 * wins and says something different. They come back separately so the page can
 * report them as a maintenance problem instead of quietly hiding them.
 *
 * `categories` is the admin-assigned code -> category-name override (Edit Code
 * Map, "Category" field on a parts number). A part with no override falls back
 * to its numeric-range bucket, so the grouping keeps working for a map that has
 * never used the field. An override group appears after the numeric buckets,
 * in the order its first part was encountered.
 *
 * @returns {{groups: {title: string, items: [string, string][]}[], unusable: [string, string][]}}
 */
export function groupComponents(components, categories = {}) {
  const pairs = Object.entries(components || {})
    .map(([k, v]) => [String(k), String(v)])
    .sort(numericSort)

  const buckets = COMPONENT_BUCKETS.map((b) => ({ title: b.title, items: [] }))
  const custom = new Map() // title -> items, in first-seen order
  const other = { title: 'Other', items: [] }
  const unusable = []

  for (const [code, name] of pairs) {
    if (!PARTS_RE.test(code)) {
      unusable.push([code, name])
      continue
    }
    const explicit = String(categories?.[code] ?? '').trim()
    if (explicit) {
      if (!custom.has(explicit)) custom.set(explicit, [])
      custom.get(explicit).push([code, name])
      continue
    }
    const n = parseInt(code, 10)
    const idx = COMPONENT_BUCKETS.findIndex((b) => n >= b.min && n <= b.max)
    if (idx >= 0) buckets[idx].items.push([code, name])
    else other.items.push([code, name])
  }

  const groups = buckets.filter((g) => g.items.length)
  for (const [title, items] of custom) groups.push({ title, items })
  if (other.items.length) groups.push(other)
  return { groups, unusable }
}
