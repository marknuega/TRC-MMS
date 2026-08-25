/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Move every inventory SKU onto the letter series — an unsuffixed
 * MOT-MAK-1117 becomes MOT-MAK-1117A and MOT-MAK-1117-1 becomes
 * MOT-MAK-1117B. The rule itself, and why the bare row is the one that holds
 * A, lives in src/letterSku.js; this file is what applies it to a database.
 *
 * The ledger follows the item. InventoryTxn.sku is a literal copy taken at the
 * time of each movement, so left alone an item's History would split across
 * two names at the date this ran. Every txn belonging to a renamed item is
 * rewritten with it — the same continuity promotePairCodes.js keeps when it
 * re-points a code.
 *
 * IDEMPOTENT. A SKU already ending [digit][letter] is in the new format and is
 * left exactly as it is, so a second run is a no-op rather than a march to
 * MOT-MAK-1117AA.
 *
 * NOTHING IS GUESSED. SKU is unique across the whole table, so a rename that
 * would land on a SKU that already exists — or on one another row in this same
 * batch is also heading for — is refused and listed, and the run writes
 * nothing at all. Two rows merged under one SKU is not a thing to discover
 * afterwards.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/letter-sku-suffixes.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/letter-sku-suffixes.js --apply
 */
import { prisma } from '../src/db.js'
import { letterSku } from '../src/letterSku.js'

const APPLY = process.argv.includes('--apply')

async function main() {
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, sku: true, branch: true },
    orderBy: { sku: 'asc' },
  })
  if (!items.length) {
    console.log('No inventory items — nothing to change.')
    return
  }

  const planned = [] // { id, from, to, branch }
  const skipped = [] // { sku, why }
  let already = 0

  for (const it of items) {
    const verdict = letterSku(it.sku)
    if (verdict.done) already++
    else if (verdict.skip) skipped.push({ sku: it.sku, why: verdict.skip })
    else planned.push({ id: it.id, from: it.sku, to: verdict.to, branch: it.branch })
  }

  console.log(`${items.length} inventory item(s): ${planned.length} to rename, ${already} already lettered.`)

  // Every SKU in the table, so a rename onto an existing row is caught before
  // the database catches it halfway through the batch.
  const taken = new Map(items.map((i) => [i.sku, i.id]))
  const clashes = []
  const targets = new Map() // new SKU -> the first row claiming it
  for (const p of planned) {
    const holder = taken.get(p.to)
    if (holder != null && holder !== p.id) clashes.push(`${p.from} -> ${p.to}, but ${p.to} already exists`)
    const twin = targets.get(p.to)
    if (twin) clashes.push(`${p.from} and ${twin} both want ${p.to}`)
    else targets.set(p.to, p.from)
  }

  if (skipped.length) {
    console.log(`\n${skipped.length} left alone:`)
    for (const s of skipped) console.log(`   ${s.sku}  —  ${s.why}`)
  }

  if (clashes.length) {
    console.log(`\n✗ ${clashes.length} collision(s) — nothing was written:`)
    for (const c of clashes) console.log(`   ${c}`)
    console.log('\nRename these by hand under Inventory first, then re-run.')
    process.exitCode = 1
    return
  }

  if (!planned.length) {
    console.log('\n✓ Every SKU is already on the letter series — nothing to change.')
    return
  }

  console.log(`\n${planned.length} rename(s):`)
  for (const p of planned) console.log(`   ${p.from}  ->  ${p.to}${p.branch ? `   (${p.branch})` : ''}`)

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to make these ${planned.length} rename(s).`)
    return
  }

  // TWO statements, not two per item. A rename walks the whole store, and a
  // round trip per row across a remote link is what timed the first two
  // production runs out — 258 items could not finish inside five minutes, and
  // both died at P2028 with everything correctly rolled back. One
  // UPDATE ... FROM (VALUES ...) sends the whole mapping at once and lets
  // Postgres do the join, which is the work it is for.
  //
  // Safe as one statement because no target can collide with a name already
  // in the table: every new SKU ends in a letter, and the collision check
  // above proved no two rows want the same one. So there is no moment
  // mid-statement where two rows share a SKU for the unique index to refuse.
  const params = (rows) => rows.flatMap((p) => [p.id, p.to])
  const values = (rows) => rows.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::text)`).join(', ')

  const txns = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE inventory_items AS i SET sku = v.sku
           FROM (VALUES ${values(planned)}) AS v(id, sku)
          WHERE i.id = v.id`,
        ...params(planned),
      )
      // The ledger carries a literal copy of the SKU per movement, keyed by
      // item — so it is joined on item_id, not on the old string.
      return await tx.$executeRawUnsafe(
        `UPDATE inventory_txns AS t SET sku = v.sku
           FROM (VALUES ${values(planned)}) AS v(item_id, sku)
          WHERE t.item_id = v.item_id`,
        ...params(planned),
      )
    },
    { timeout: 5 * 60 * 1000, maxWait: 30 * 1000 },
  )

  console.log(`\n✓ Renamed ${planned.length} item(s) and ${txns} ledger row(s).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
