/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Merge a code claimed once per device into ONE row that names itself per
 * device — the shape 99A and 15B are already in, and 44A and 44B are not.
 *
 * The reasoning, and the rules for what is merged and what is deliberately left
 * alone, are in src/mergeVariantClaims.js. This is the CLI around it.
 *
 * NOTHING IS RENAMED AND NOTHING IS LOST. Every name in the list stays in it —
 * as a row name or as a per-device override — and issueAllNames() reads both,
 * which is what resolves a fault's stored name back to its code. A part offered
 * for an STP9000 is still offered, still under the name it goes by there.
 * Saved reports and the inventory ledger are untouched: this is the vocabulary,
 * not the records.
 *
 * The equivalent by hand is Manage Inputs -> Issue types -> edit the first row
 * of the pair, tick the second row's device, give that device its name, Save,
 * then delete the second row. This does the same thing in one step, on
 * whichever database DATABASE_URL points at.
 *
 * DRY RUN BY DEFAULT. Add --apply to write, after reading the plan.
 *
 * Against your LOCAL database:
 *   cd server && node --env-file=.env scripts/merge-variant-claims.js
 *
 * Against PRODUCTION, from inside Railway:
 *   railway ssh --service app
 *   cd server && node scripts/merge-variant-claims.js
 *
 * Note the missing --env-file there, and that `railway run` is NOT the way.
 * `railway run` injects production's variables but executes on your machine,
 * where production's DATABASE_URL is *.railway.internal and resolves to
 * nothing — the connection fails before the first query. Inside the service it
 * resolves, and the production credential never leaves Railway. The deployed
 * image is built from the repo root (see railway.json), so this script and the
 * client/src/options.js it reads the vocabulary through are both in it.
 *
 * The other way in is the Postgres service's public TCP proxy, with
 * DATABASE_URL set to that connection string by hand and --env-file left off
 * so the local one does not win. That works, and it puts the production
 * password on a laptop to do it.
 */
import { prisma } from '../src/db.js'
import { planMerges, mergedList } from '../src/mergeVariantClaims.js'
import { issueName, issueModels, issueNameOverrides } from '../../client/src/options.js'

const APPLY = process.argv.includes('--apply')

async function main() {
  const optRow = await prisma.appOptions.findUnique({ where: { id: 1 } })
  const data = optRow?.data ?? {}
  const issueTypes = Array.isArray(data.issueTypes) ? data.issueTypes : []
  if (!issueTypes.length) {
    console.log('No issue types stored — nothing to merge.')
    return
  }

  const { merges, skipped, multi } = planMerges(issueTypes)

  console.log(`issue types: ${issueTypes.length}`)
  console.log(`codes claimed more than once: ${multi}`)
  console.log('')

  if (skipped.length) {
    console.log(`${skipped.length} group(s) LEFT ALONE — settle these by hand:`)
    for (const { code, why } of skipped) console.log(`   ${code.padEnd(5)} ${why}`)
    console.log('')
  }

  if (!merges.length) {
    console.log('Nothing to merge — every multi-claim code is already one row.')
    return
  }

  console.log(`${merges.length} code(s) to merge into one row each:`)
  for (const { code, merged, dropped } of merges) {
    console.log(`   ${code}`)
    console.log(`      row      "${issueName(merged)}"`)
    console.log(`      devices  ${issueModels(merged).join(', ')}`)
    for (const [m, n] of Object.entries(issueNameOverrides(merged))) console.log(`      on ${m}: "${n}"`)
    console.log(`      drops    ${dropped.map((r) => `"${issueName(r)}"`).join(', ')} — kept as an override above`)
  }
  console.log('')

  const dropCount = merges.reduce((n, m) => n + m.dropped.length, 0)
  console.log(`${dropCount} row(s) fold into ${merges.length}. No name is lost — each becomes a per-device name.`)

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to make these changes.')
    return
  }

  const next = mergedList(issueTypes, merges)
  await prisma.appOptions.upsert({
    where: { id: 1 },
    create: { id: 1, data: { ...data, issueTypes: next } },
    update: { data: { ...data, issueTypes: next } },
  })
  console.log(`\n✓ Applied. ${issueTypes.length} issue types before, ${next.length} after.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
