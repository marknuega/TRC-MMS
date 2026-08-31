/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Searching INSIDE the saved snapshots, and counting what comes back.
 *
 * Kept out of App.jsx so it can be tested directly — node --test cannot load
 * .jsx — and because what a query is allowed to match is a rule about the
 * records, not about the card that draws them.
 */

// Extension-ful so `node --test` resolves it too, not just Vite.
import { shortIdOf, entryQty } from './report.js'

const lc = (v) => String(v ?? '').toLowerCase()

// What is written on the LINE: the part, who supplied it, what condition it is
// in. These are the only fields that can single out one fault row out of the
// several an entry carries.
const faultHay = (f) => lc(`${f.issue} ${f.company} ${f.status}`)

// What is true of the whole ENTRY — the device, the day, the people, the
// agency, the numbers, the note. Every fault on the entry shares all of it, so
// none of it can tell one fault from another.
//
// The agency belongs here rather than beside the company on the line above.
// They read alike and they are not: the company is who supplied the PART and
// varies from one fault to the next, while the agency is whose RADIO it is and
// is one fact about the visit. Matching it per fault would hand back a
// three-fault report as three rows that all say the same thing.
//
// Tel/ISSI are here IN FULL, whatever an export is set to show. Masking is
// about what leaves the app; this is a signed-in technician looking for the
// reports a radio appears in, and searching the masked form would mean the only
// number they have — the whole one, off the handset — is the one number that
// finds nothing.
//
// The ids are NOT here. searchById owns them, and leaving them here too was the
// original flood: an id sits on every one of a report's fault lines, so typing
// one matched all of them and handed back a three-fault report as three
// near-identical rows next to the report itself.
const entryHay = (r, e) =>
  lc(
    `${r.branch} ${r.dateLabel} ${e.technician ?? ''} ${r.receivedBy ?? ''} ${e.agency ?? ''} ${e.telNumber ?? ''} ${e.issiNumber ?? ''} ${e.type} ${e.model} ${e.comment ?? ''}`,
  )

// A fault with no issue of its own is a device-level action — an INSTALL, a
// PROGRAM — and the action is the only name it has. Better than the blank the
// "model · issue" form would otherwise leave hanging after the separator.
const faultLabel = (f) =>
  String(f.issue ?? '').trim() ||
  String(f.action ?? '')
    .trim()
    .toUpperCase()

const itemLabel = (model, text) => `${model ? `${model} · ` : ''}${text}`

// One part, named and counted on its own. Every row carries these — a fault row
// the single part it is about, an entry row each part that was fitted during
// the visit — because a row and a part answer different questions. The row says
// which device and which report; the part says how many of THIS were used, and
// the tally can only add up parts.
const partOf = (model, f) => ({
  model,
  name: faultLabel(f),
  item: itemLabel(model, faultLabel(f)),
  qty: Math.max(0, Number(f.quantity) || 0),
})

/**
 * Deep search inside a set of saved snapshots -> matching rows.
 *
 * A query matches at one of two levels, and the level decides how many rows
 * come back:
 *
 *   - It names something on a FAULT (part, company, status) -> one row per
 *     matching fault, which is what someone counting sidegrips came for.
 *
 *   - It names something about the ENTRY (tel, ISSI, technician, model, type,
 *     branch, date, the note) -> ONE row for that entry.
 *
 * The second rule is the whole point of splitting the haystack. Every fault on
 * an entry shares the entry's tel, its note and its device, so matching those
 * per-fault handed back the same entry once per fault: searching a new PCB
 * number written in the comment returned "TH1N · PCB" and "TH1N · Program",
 * two rows, one report id, describing a single device someone touched once.
 * The entry matched, so the entry is the answer — one row, its faults named
 * together and its quantity the one the report sheet prints for it.
 *
 * Collapsed for the LIST, never for the count: each row also carries `parts`,
 * the individual items behind it, so a day's search still answers "how many
 * sidegrips went out on the 6th" one part at a time. A badge reading
 * "TH1N · Battery 3180 + Sidegrip + PTT — 1" counts nothing anybody can use.
 */
export function searchInside(list, query) {
  const q = String(query ?? '')
    .trim()
    .toLowerCase()
  if (!q) return []
  const out = []
  for (const r of list ?? []) {
    const entries = Array.isArray(r.entries) ? r.entries : []
    const label = shortIdOf(r) // e.g. "MAK-REP-A004"
    for (const e of entries) {
      const model = e.model && e.model !== '-' ? e.model : ''
      const faults = e.faults ?? []
      const row = (item, qty, parts) => ({
        date: r.dateLabel,
        branch: r.branch,
        qty,
        technician: e.technician ?? '',
        receivedBy: r.receivedBy ?? '',
        item,
        parts,
        reportId: label,
        rep: r,
      })
      const hits = faults.filter((f) => faultHay(f).includes(q))
      if (hits.length > 0) {
        // Only the lines that matched are counted: someone searching a part is
        // asking about that part, not about everything else on the same device.
        for (const f of hits) out.push(row(itemLabel(model, faultLabel(f)), f.quantity, [partOf(model, f)]))
      } else if (entryHay(r, e).includes(q) && faults.length > 0) {
        // Named together, in the order they were entered — the entry is one
        // visit to one device, and its faults are what was done during it.
        out.push(
          row(
            itemLabel(model, faults.map(faultLabel).join(' + ')),
            entryQty(e),
            faults.map((f) => partOf(model, f)),
          ),
        )
      }
    }
  }
  return out.slice(0, 300)
}

// A column that runs past a dozen parts stops being a summary and becomes a
// second list. Counted PER DEVICE, because the limit is there to keep one
// column readable, not to ration the answer across all of them — and what falls
// off the end is by definition the smallest, since the parts are ordered by
// quantity. The remainder is counted into a "+N more" at the foot of its own
// column, so no device is ever silently shown a partial total.
export const TALLY_LIMIT = 12

/**
 * What the search found, counted one PART at a time.
 *
 * Rows are not the unit: a row can be a whole visit to a device, and adding
 * those up says how many devices were touched, never how many of a part went
 * out. So the count reads each row's `parts` — the individual items behind it —
 * which is what someone searching a date is after: how many sidegrips, how many
 * chargers, on that day. Quantities are summed, not rows counted, because a
 * line for 3 sidegrips is three sidegrips.
 *
 * Counted per DEVICE and part together: TH1N · Sidegrip and TH1N · Sidegrip3D
 * are two parts, and a sidegrip off a car kit is not one off a handheld.
 * Biggest first, so the answer is the first thing read.
 *
 * Nothing counts a zero. A no-activity row records a day on which nothing was
 * done — a badge saying so would be a part that was never used.
 */
function countParts(results) {
  const totals = new Map() // item label -> the running total for it
  for (const r of results ?? []) {
    // A row with no parts of its own is counted as itself — the shape the
    // caller already had, and the honest reading of a row that names one thing.
    for (const p of r.parts ?? [{ item: r.item, name: r.item, model: '', qty: r.qty }]) {
      const item = p.item || '—'
      const qty = Number(p.qty) || 0
      const prev = totals.get(item)
      if (prev) prev.qty += qty
      else totals.set(item, { model: p.model ?? '', name: p.name ?? item, item, qty })
    }
  }
  return [...totals.values()].filter((t) => t.qty > 0).sort((a, b) => b.qty - a.qty || a.item.localeCompare(b.item))
}

/** The flat answer: every part the search found, biggest first. */
export const tallyItems = (results) => countParts(results).map(({ item, qty }) => ({ item, qty }))

/**
 * The same totals, gathered under the device they came off.
 *
 * A wrapping row of badges puts a car kit's fistmic beside a handheld's antenna
 * beside another car kit's dismantle, in whatever order the widths happened to
 * fall — and reading a day's work off it means picking the one model out of the
 * line every time. One column per device, its parts under it, and the counts
 * line up in a column of their own: what came off which radio, and how many,
 * without re-reading a name that is already the heading.
 *
 * Devices by their total, parts by theirs — the busiest first at both levels.
 * A part on an entry with no model at all still has to go somewhere, and goes
 * under a group with no name rather than being dropped.
 */
export function tallyByModel(results) {
  const groups = new Map() // model -> { model, items, total }
  for (const t of countParts(results)) {
    const key = t.model || ''
    if (!groups.has(key)) groups.set(key, { model: key, items: [], total: 0 })
    const g = groups.get(key)
    g.items.push({ name: t.name, item: t.item, qty: t.qty })
    g.total += t.qty
  }
  // countParts already ordered the parts, so each group's items keep that order.
  return [...groups.values()].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model))
}
