/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Which company owns a shelf.
 *
 * A branch's store is not one store. MOT, X1 and X2 each keep their own stock
 * in the same building, and until now the only thing that said so was the text
 * in front of the SKU:
 *
 *     MOT-MAK-1114-2      X1-MAK-1116      X2-MAK-1125
 *     ^^^                 ^^               ^^
 *
 * That prefix was decoration — nothing read it. So two companies could not both
 * stock the same part: the Model Code uniqueness check is per BRANCH, and the
 * second company to enter T99C was told it "is already X1-MAK-1114-2". One
 * company's shelf was blocking the other's, and every count, every ledger and
 * every usage total pooled the two together.
 *
 * The prefix is now the company, read rather than assumed. It is derived, never
 * typed: a company field beside the SKU is a second place to get it wrong, and
 * an item whose prefix says MOT while its company says X1 is a row nobody can
 * reason about. One string, one meaning.
 *
 * Blank means SHARED — an item any company may draw on, which is what every row
 * whose SKU carries no prefix already was. It is the same fallback shape the
 * pair code uses for the shared shelf (see pairCode.js), on purpose: the two
 * dimensions narrow independently and blank means "not narrowed" in both.
 *
 * No React in this file: the server imports it too.
 */

/**
 * A company code, as it is stored and compared: upper-cased, ends trimmed.
 * Alphanumeric only — the codes are short tags (MOT, X1), and anything with
 * punctuation in it is a name that wandered into a code field.
 */
export const normalizeCompany = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

/**
 * The company a SKU belongs to — the segment before its first hyphen.
 *
 * Read from the SKU rather than the Store because the SKU is the field that is
 * required, unique and never blank; a store is free text that an import can
 * leave empty. The two agree in practice (MOT-MAK-1114-2 sits in store MOT-MAK)
 * and where they disagree the SKU is the one the row is identified by.
 *
 * Returns '' — shared — for a SKU with no prefix at all, and for a first
 * segment too long to be a tag. `1114-2` must not read as company "1114": a
 * legacy SKU that was never prefixed is shared stock, not a company of its own,
 * and inventing one for it would hide those rows from every company at once.
 */
export function companyFromSku(sku) {
  const raw = String(sku ?? '').trim()
  const cut = raw.indexOf('-')
  if (cut <= 0) return ''
  const head = normalizeCompany(raw.slice(0, cut))
  if (!head || head.length > 6) return ''
  // All digits is a number, not a name. Every real code carries a letter.
  if (!/[A-Z]/.test(head)) return ''
  return head
}

// ---------------------------------------------------------------------------
// From a fault's company to a company's shelf.
//
// A fault records the company that PAID for the part, in the words the report
// prints — MOTECO, PROJECT X, MOTECO LOCAL. A shelf is tagged with the short
// code in the SKU. Those are two vocabularies for one thing, and stock cannot
// be drawn without knowing which shelf a fault's company means.
//
// The join is the Companies list in Manage inputs, which now carries an
// optional code beside each name. An entry is a plain string (legacy, no code)
// or { name, code } — the same shape and the same tolerance materials already
// has, so nothing needed converting and a list saved by an older build still
// reads.
// ---------------------------------------------------------------------------

/** A companies entry may be a plain string (legacy) or { name, code }. */
export const companyName = (v) => (typeof v === 'string' ? v : String(v?.name ?? ''))
export const companyCode = (v) => (typeof v === 'string' ? '' : normalizeCompany(v?.code))

/** Map of UPPERCASE company name -> shelf code, skipping the uncoded ones. */
export function companyCodeMap(companies) {
  const map = {}
  for (const it of companies ?? []) {
    const name = companyName(it).trim().toUpperCase()
    const code = companyCode(it)
    if (name && code) map[name] = code
  }
  return map
}

/**
 * The shelf code a fault's company draws from, or '' when the list does not say.
 *
 * '' is not an error and must not be treated as one — it is the state every
 * install starts in, before anyone has typed a code. It means "unnarrowed", and
 * the caller falls back to matching across companies exactly as it did before
 * this existed. See resolveInventoryUsage in routes/savedReports.js for what
 * that fallback refuses to guess at.
 */
/**
 * The company NAME a shelf code belongs to — 'MOT' -> 'MOTECO'.
 *
 * The other direction of companyCodeMap, for the places that hold a code and
 * need the word: a fault records the company in the words the report prints,
 * so picking a part off MOT's shelf has to set 'MOTECO', not 'MOT'.
 *
 * '' when no entry claims the code, which is the same "unnarrowed" answer
 * everything else here gives: the caller selects nothing rather than writing a
 * company the dropdown does not offer.
 */
export function companyNameForCode(code, companies) {
  const want = normalizeCompany(code)
  if (!want) return ''
  for (const it of companies ?? []) {
    if (companyCode(it) === want) return companyName(it).trim()
  }
  return ''
}

export function shelfCompanyForFault(faultCompany, companies) {
  const name = String(faultCompany ?? '')
    .trim()
    .toUpperCase()
  if (!name) return ''
  return companyCodeMap(companies)[name] ?? ''
}
