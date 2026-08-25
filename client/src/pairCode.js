/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The Model+Parts pair code — the identity an inventory item is held by.
 *
 * A parts code is shared by every radio on purpose: 45A means Speaker whoever
 * is holding it, which is why claims are keyed without a device letter (see the
 * header of codes.js). But the SHELF is not shared. The SRG3900 Carkit's loud
 * speaker and the TH1n's speaker are two different items with two different
 * stocks, both written "Speaker (45A)", and inventory that matches on the name
 * alone draws one model's usage out of the other model's box — silently, inside
 * the save transaction, with no way to tell afterwards which report did it.
 *
 * The identity that fixes it already exists. A full CDS code is
 * [device letter][parts][variant], and the device letter IS the model:
 *
 *     H45A = Speaker, TH1n            C45A = Speaker, SRG Carkit
 *     D45A = Speaker, SRG Desktop     M26A = LCD, TMR880i
 *
 * so an inventory row carrying C45A can only ever be drawn on by a Carkit
 * fault. equipmentCodes in the code map already names all ten letters; nothing
 * new is invented here, the letter is simply carried one layer further than it
 * used to be.
 *
 * PROVISIONAL CODES. Most of the store has no parts code at all — it is named,
 * not coded ("CUR3 DISPLAY FOR TMR880I - HT10280AA"). Those items still need a
 * model-unique identity, so it is built the same way, from the letter and the
 * name:
 *
 *     M:CUR3 DISPLAY FOR TMR880I - HT10280AA
 *
 * The separator is a colon and it splits at the FIRST one only. Item names
 * carry hyphens and spaces of their own — that example has both — so anything
 * splitting greedily, or on a hyphen, cuts in the wrong place. A colon is also
 * what keeps the two forms apart by shape: a real code is four characters,
 * letter-digit-digit-letter, and nothing follows it.
 *
 * When that name is finally given a parts code, the provisional form is
 * superseded and the inventory row is re-pointed (see promotePairCodes in
 * server/src/routes/options.js). Note what does NOT need re-pointing: a saved
 * report stores the issue NAME, never the pair code, and the code is derived
 * from (model, issue) at the moment stock is drawn. So every past and present
 * entry follows the promotion by construction — there is no history to rewrite
 * beyond the ledger rows that recorded the old code literally.
 *
 * No React in this file: the server imports it too.
 */

import { issueCode, issueAllNames } from './options.js'

/** The four-character form: letter, two digits, variant letter. */
export const REAL_PAIR_RE = /^[A-Z]\d{2}[A-Z]$/
/** The named form: letter, colon, then the item's name verbatim. */
export const PROVISIONAL_PAIR_RE = /^[A-Z]:.+$/
export const PAIR_SEP = ':'

export const up = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()

// Comparison key: case and punctuation carry no meaning across the two lists.
export const norm = (v) => up(v).replace(/[^A-Z0-9]/g, '')

/**
 * An item name as it is COMPARED (never as it is stored): upper-cased, ends
 * trimmed, runs of whitespace collapsed. Names reach us from a form, an Excel
 * paste and a .csv in the same day, and "CUR3  DISPLAY" from one of them is the
 * same shelf as "CUR3 DISPLAY" from another.
 */
export const normalizeName = (v) => up(v).replace(/\s+/g, ' ')

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

// 'Airbus TH1n' -> 'TH1n'. The first word of an equipmentCodes label is the
// brand (which the app stores as the entry Type); the rest is the model, which
// is what an entry stores as its Model.
const modelHalf = (label) => {
  const s = String(label ?? '').trim()
  const i = s.indexOf(' ')
  return i < 0 ? s : s.slice(i + 1).trim()
}

/**
 * The device letter for a model name, or '' when the map does not name it.
 *
 * Matched through matchOption rather than by equality, because the model on an
 * entry may have come from either vocabulary: the Manage-inputs list writes
 * "SRG3900 CARKIT" and "TMR 880i", the WhatsApp decoder writes the code map's
 * own "SRG Carkit" and "TMR880i" (see saveGroup in whatsapp/routes.js). Both
 * must land on the same letter or the same fault would draw from two shelves
 * depending on where it was typed.
 *
 * '' rather than a guess for anything unmatched — "For Record Purpose Only."
 * is a real Model on a real entry and it owns no stock at all.
 */
export function deviceLetterFor(model, equipmentCodes) {
  const pairs = Object.entries(equipmentCodes ?? {})
    .map(([letter, label]) => ({ letter: up(letter).slice(0, 1), model: modelHalf(label) }))
    .filter((p) => /^[A-Z]$/.test(p.letter) && p.model)
  if (pairs.length === 0) return ''
  const hit = matchOption(
    model,
    pairs.map((p) => p.model),
  )
  if (hit == null) return ''
  return pairs.find((p) => p.model === hit)?.letter ?? ''
}

/**
 * Build a pair code from a device letter and either a parts code ("45A") or an
 * item name. Returns '' without a letter — a code with no model in front of it
 * is the very ambiguity this exists to remove.
 */
export function makePairCode(letter, part) {
  // Exactly one letter, never the first letter of something longer: silently
  // truncating "CC" to "C" would file an item under a device nobody named.
  const L = up(letter)
  if (!/^[A-Z]$/.test(L)) return ''
  const p = up(part)
  if (!p) return ''
  return /^\d{2}[A-Z]$/.test(p) ? `${L}${p}` : `${L}${PAIR_SEP}${normalizeName(p)}`
}

/**
 * Split a pair code back into its halves, or null if it is neither form.
 * `part` is the parts code for a real one and the item name for a provisional
 * one; `provisional` says which.
 */
export function parsePairCode(code) {
  const s = up(code)
  if (!s) return null
  if (REAL_PAIR_RE.test(s)) return { letter: s[0], part: s.slice(1), provisional: false }
  // First colon only — the name half owns every character after it, separators
  // of its own included.
  const i = s.indexOf(PAIR_SEP)
  if (i !== 1 || !/^[A-Z]$/.test(s[0]) || s.length <= 2) return null
  return { letter: s[0], part: normalizeName(s.slice(2)), provisional: true }
}

/** The stored/compared form of a pair code, or '' if it is not one. */
export function normalizePairCode(code) {
  const parsed = parsePairCode(code)
  return parsed ? makePairCode(parsed.letter, parsed.part) : ''
}

/**
 * The parts code an issue name claims ('45A'), or '' when nothing claims it.
 *
 * Exact on the normalised name, deliberately NOT matchOption. Everywhere else a
 * loose match costs a warning; here it would silently promote "SPEAKER" onto
 * "SPEAKER LOUD"'s code and draw the wrong item off the shelf for good. An
 * unclaimed name simply gets a provisional code instead, which is correct and
 * reversible.
 *
 * EVERY name the row answers to is checked, not just its own. One code can be
 * a different physical part per device — 99A is the ACP-12 on a TH1N and the
 * Charger818 on an STP9000 — and a fault stores the name it was written by, so
 * "Charger818" has to reach 99A exactly as "ACP-12" does. Without this the
 * override name claims nothing, and every fault written by it silently falls
 * through to a provisional code and its own separate shelf.
 */
export function claimedPartsCode(issue, issueTypes) {
  const want = norm(issue)
  if (!want) return ''
  for (const it of issueTypes ?? []) {
    if (issueAllNames(it).some((n) => norm(n) === want)) {
      const code = issueCode(it)
      if (code) return code
    }
  }
  return ''
}

/**
 * Whether a part is stocked, but for other devices than this one.
 *
 * A Model Code says which shelf an item comes off, so an item held only under
 * C is the Carkit's — offering it while a TH1n is on the bench offers a fault
 * that would draw from the wrong box or from nothing at all.
 *
 * Two ways to answer no, and both matter. A part stocked under NO Model Code is
 * shared, which is most of the store, and shared parts are offered for
 * everything — this can only ever hide something somebody deliberately bound to
 * a device. And a model the code map names no letter for narrows nothing,
 * because there is no letter to compare against.
 *
 * @param codes  the Model Codes that part is stocked under
 * @param letter the device letter of the model in hand
 */
export function stockedElsewhere(codes, letter) {
  const held = (codes ?? []).map((c) => parsePairCode(c)?.letter).filter(Boolean)
  if (held.length === 0) return false // shared, or not stocked at all
  const want = up(letter)
  if (!/^[A-Z]$/.test(want)) return false // nothing to narrow against
  return !held.includes(want)
}

/**
 * The pair code a fault draws stock by: the device letter of the entry's model,
 * plus the issue's claimed parts code, or the issue's own name while it has
 * none. '' when the model names no device — that entry owns no model-specific
 * stock and falls back to the shared shelf.
 */
export function pairCodeForFault({ model, issue }, { equipmentCodes, issueTypes } = {}) {
  const letter = deviceLetterFor(model, equipmentCodes)
  if (!letter) return ''
  return makePairCode(letter, claimedPartsCode(issue, issueTypes) || issue)
}
