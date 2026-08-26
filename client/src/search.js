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
// numbers, the note. Every fault on the entry shares all of it, so none of it
// can tell one fault from another.
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
    `${r.branch} ${r.dateLabel} ${e.technician ?? ''} ${r.receivedBy ?? ''} ${e.telNumber ?? ''} ${e.issiNumber ?? ''} ${e.type} ${e.model} ${e.comment ?? ''}`,
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
      const row = (item, qty) => ({
        date: r.dateLabel,
        branch: r.branch,
        qty,
        technician: e.technician ?? '',
        receivedBy: r.receivedBy ?? '',
        item,
        reportId: label,
        rep: r,
      })
      const hits = faults.filter((f) => faultHay(f).includes(q))
      if (hits.length > 0) {
        for (const f of hits) out.push(row(itemLabel(model, f.issue), f.quantity))
      } else if (entryHay(r, e).includes(q) && faults.length > 0) {
        // Named together, in the order they were entered — the entry is one
        // visit to one device, and its faults are what was done during it.
        out.push(row(itemLabel(model, faults.map(faultLabel).join(' + ')), entryQty(e)))
      }
    }
  }
  return out.slice(0, 300)
}

// A tally that runs past the hint line stops being a summary and becomes a
// second list. Twelve is what fits beside the sentence on a normal screen; the
// rest are counted into a "+N more", which is honest because the badges are
// ordered by quantity — what falls off the end is by definition the smallest.
export const TALLY_LIMIT = 12

// The same rows the search hands back, counted per item. One row per fault
// means a search for "sidegrip" answers "here are the lines" but never "how
// many" — the number someone came for when they typed a part name is the TOTAL
// QUANTITY, so quantities are summed rather than rows counted (a line for 3
// sidegrips is three sidegrips, not one hit). Grouped on the item label the
// Item column already shows, model prefix and all: TH1N · Sidegrip and
// TH1N · Sidegrip3D are two different parts and must never be pooled into one
// badge. Biggest first, so the answer is the first thing read.
export function tallyItems(results) {
  const totals = new Map()
  for (const r of results ?? []) {
    const name = r.item || '—'
    totals.set(name, (totals.get(name) ?? 0) + (Number(r.qty) || 0))
  }
  return [...totals].map(([item, qty]) => ({ item, qty })).sort((a, b) => b.qty - a.qty || a.item.localeCompare(b.item))
}
