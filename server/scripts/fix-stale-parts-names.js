/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Three parts that are not called what they are.
 *
 *     components 44   "Microphone"           ->  "Battery"
 *     components 28   "Micro-Loud Speaker"   ->  removed
 *     H45A            "TH1N KIT 10 OF UI FRAME" -> "Speaker for TH1N"
 *
 * 44 IS THE BATTERY NUMBER. Every claim on it is one — 44A Battery 1590, 44B
 * Battery 3180, 44C Battery 1880, 44D BLN-4, 44E BLN5I — and the parts list has
 * gone on calling it the Microphone, which is a different component on a
 * different number. The claims decide what a code means; this only stops the
 * card and the /codemap describing the number as something it is not.
 *
 * 28 IS REMOVED RATHER THAN RENAMED, and that is the opposite call from the
 * speaker names beside it, for one reason: nothing uses 28. No issue type
 * claims it, no item is stocked under a 28 pair code, no fault has ever been
 * written to one. A number in use must keep a name or codes built from it read
 * blank on the card; a number nothing reaches is just a line to scroll past.
 * Both conditions are checked again at run time, and the removal is skipped —
 * not the whole run — if either has stopped being true since this was written.
 *
 * THE ITEM'S DESCRIPTION is the one row that is not vocabulary: MOT-MAK-1117A
 * is the TH1n's speaker (pair code H45A, aliased "Speaker"), described as a kit
 * of UI frames. The description is what a person reads when deciding whether
 * this is the box they want, so a wrong one sends someone to the wrong shelf.
 * Its alias, code and stock are untouched — only the sentence changes.
 *
 * IDEMPOTENT. Every edit is made only while the row still holds the stale
 * value, so a second run does nothing and a value someone has since corrected
 * by hand is never clobbered.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/fix-stale-parts-names.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/fix-stale-parts-names.js --apply
 */
import { prisma } from '../src/db.js'
import { norm } from '../../client/src/pairCode.js'
import { parsePairCode } from '../../client/src/pairCode.js'

const APPLY = process.argv.includes('--apply')

const COMPONENTS = { 44: { from: 'Microphone', to: 'Battery' } }
const DROP = { 28: 'Micro-Loud Speaker' }
const ITEMS = [{ sku: 'MOT-MAK-1117A', from: 'TH1N KIT 10 OF UI FRAME', to: 'Speaker for TH1N' }]

async function main() {
  const map = (await prisma.codeMap.findUnique({ where: { id: 1 } }))?.data ?? null
  const options = (await prisma.appOptions.findUnique({ where: { id: 1 } }))?.data ?? {}
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, sku: true, pairCode: true, description: true },
  })

  const edits = []
  const components = { ...(map?.components ?? {}) }

  // 1. The number that is called after the wrong component.
  for (const [code, { from, to }] of Object.entries(COMPONENTS)) {
    const held = components[code]
    if (held === undefined || norm(held) !== norm(from)) {
      if (held !== undefined && norm(held) !== norm(to))
        console.log(`${code} reads "${held}", not "${from}" — left alone.`)
      continue
    }
    components[code] = to
    edits.push(`components ${code}: "${held}" -> "${to}"`)
  }

  // 2. The number nothing reaches. Both reasons for that are re-checked here
  //    rather than taken on trust from the day this was written.
  for (const [code, expected] of Object.entries(DROP)) {
    const held = components[code]
    if (held === undefined) continue
    if (norm(held) !== norm(expected)) {
      console.log(`${code} reads "${held}", not "${expected}" — left alone.`)
      continue
    }
    const claimed = (options.issueTypes ?? []).filter((t) => typeof t === 'object' && String(t?.parts) === code)
    const stocked = items.filter((i) => parsePairCode(i.pairCode)?.part === code)
    if (claimed.length || stocked.length) {
      console.log(`${code} is in use now — ${claimed.length} claim(s), ${stocked.length} item(s) — so its name stays.`)
      continue
    }
    delete components[code]
    edits.push(`components ${code}: "${held}" -> removed (nothing claims it, nothing is stocked under it)`)
  }

  // 3. The item described as something else entirely.
  const itemEdits = []
  for (const { sku, from, to } of ITEMS) {
    const item = items.find((i) => i.sku === sku)
    if (!item) {
      console.log(`${sku} is not in this database — skipped.`)
      continue
    }
    if (norm(item.description) !== norm(from)) {
      if (norm(item.description) !== norm(to))
        console.log(`${sku} reads "${item.description}", not "${from}" — left alone.`)
      continue
    }
    itemEdits.push({ id: item.id, to, line: `${sku} (${item.pairCode}): "${item.description}" -> "${to}"` })
  }

  console.log(`\nCode map:  ${edits.length} entry(ies)`)
  for (const line of edits) console.log(`   ${line}`)
  console.log(`Inventory: ${itemEdits.length} description(s)`)
  for (const e of itemEdits) console.log(`   ${e.line}`)

  const total = edits.length + itemEdits.length
  if (!total) {
    console.log('\nEvery one of these already reads as it should - nothing to change.')
    return
  }
  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.')
    return
  }

  await prisma.$transaction(async (tx) => {
    if (edits.length) await tx.codeMap.update({ where: { id: 1 }, data: { data: { ...map, components } } })
    for (const e of itemEdits) await tx.inventoryItem.update({ where: { id: e.id }, data: { description: e.to } })
  })
  console.log(`\nDone. ${total} edit(s) written.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
