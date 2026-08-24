/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Promotion: re-pointing an inventory item from its provisional Model Code to
 * the real one, the moment its name is finally given a parts code.
 *
 * An item with no parts code is held under the provisional pair code — the
 * device letter, a colon, and its own name:
 *
 *     M:CUR3 DISPLAY FOR TMR880I - HT10280AA
 *
 * The day someone claims 26+A for that name (Issue types, either from Manage
 * inputs or from the code button on the entry form — both land here, because
 * both save the whole option set through PUT /api/options), the provisional
 * code is superseded and the item must move to M26A. Otherwise the next save
 * derives M26A from the fault, finds nothing under it, and quietly falls
 * through to the shared shelf.
 *
 * WHAT DOES NOT NEED MOVING, and why there is no history rewrite here: a saved
 * report stores the issue NAME, never a pair code. The code is derived from
 * (model, issue) at the moment stock is drawn. So every entry ever saved —
 * and every one sitting in the working set right now — follows this promotion
 * on its own, with nothing written to it. The only records holding the old code
 * literally are the ledger rows that recorded it, and those are rewritten here
 * so the item's transaction history stays continuous across the change.
 *
 * The superseded code is kept on the item (formerPairCode) rather than
 * discarded. Documents already printed and issued name the old form, and the
 * shelf they point at has to stay findable.
 *
 * Nothing is promoted onto a code another item in the same branch already
 * holds. Two items under one code is exactly the ambiguity that stops a save,
 * so the promotion is skipped and reported instead of created.
 */

import { issueCode, issueName } from '../../client/src/options.js'
import { makePairCode, norm, up } from '../../client/src/pairCode.js'

/**
 * The issues that gained a parts code between two versions of the option set.
 *
 * Gained, not merely have: an issue that was already coded is untouched, so a
 * routine save of the option list promotes nothing. A RE-code (43A becoming
 * 44A) is also left alone — that is a correction to the vocabulary, and moving
 * stock under it would need someone to say which shelf they meant.
 *
 * Pure, so the rule can be tested without a database.
 */
export function newlyCodedIssues(before, after) {
  const had = new Map()
  for (const it of before ?? []) {
    const key = norm(issueName(it))
    if (key && !had.has(key)) had.set(key, issueCode(it))
  }
  const gained = []
  const seen = new Set()
  for (const it of after ?? []) {
    const name = issueName(it).trim()
    const code = issueCode(it)
    const key = norm(name)
    if (!name || !code || !key || seen.has(key)) continue
    if (had.get(key)) continue // already carried a code — not a promotion
    seen.add(key)
    gained.push({ name, code })
  }
  return gained
}

/** The device letters the code map names, e.g. ['H','R','M','T','C','D',...]. */
const lettersOf = (equipmentCodes) =>
  Object.keys(equipmentCodes ?? {})
    .map((l) => up(l).slice(0, 1))
    .filter((l) => /^[A-Z]$/.test(l))

/**
 * Move every item held under a provisional code onto its real one.
 *
 * Runs inside the caller's transaction so the item, its ledger and the option
 * set that triggered it all land together or not at all.
 *
 * @returns { promoted: [{ sku, branch, from, to }], skipped: [{ sku, to, heldBy }] }
 */
export async function promotePairCodes(tx, { before, after, equipmentCodes }) {
  const gained = newlyCodedIssues(before, after)
  const promoted = []
  const skipped = []
  if (gained.length === 0) return { promoted, skipped }

  const letters = lettersOf(equipmentCodes)
  for (const { name, code } of gained) {
    for (const letter of letters) {
      const from = makePairCode(letter, name)
      const to = makePairCode(letter, code)
      if (!from || !to || from === to) continue
      const items = await tx.inventoryItem.findMany({ where: { pairCode: from } })
      for (const item of items) {
        const heldBy = await tx.inventoryItem.findFirst({
          where: { pairCode: to, branch: item.branch, NOT: { id: item.id } },
        })
        if (heldBy) {
          skipped.push({ sku: item.sku, to, heldBy: heldBy.sku })
          continue
        }
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { pairCode: to, formerPairCode: from },
        })
        // The ledger recorded the old code literally, so it is rewritten too —
        // an audit that stopped at the promotion would read as two half
        // histories of two items that never existed.
        await tx.inventoryTxn.updateMany({ where: { itemId: item.id, pairCode: from }, data: { pairCode: to } })
        promoted.push({ sku: item.sku, branch: item.branch, from, to })
      }
    }
  }
  return { promoted, skipped }
}
