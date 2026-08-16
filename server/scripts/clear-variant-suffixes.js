/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Clear the variant suffixes in the stored code map.
 *
 * The map declared variants as { A: "", B: "3D" } — "B is the 3D-printed
 * build of A". That is not how the codes are used: 12A is an A Cover and 12B
 * a B Cover, 42B is a Rotary Switch. The suffix only ever appended itself to
 * a part name, manufacturing entries like "Antenna 3D" that exist nowhere.
 *
 * Nothing decodes through `variants` any more — a code means whatever the
 * issue type claiming it says, and the one genuine 3D item, 43B, carries the
 * 3D in its own claim name ("Side Grip 3D"). So every suffix is cleared to
 * blank. The letters themselves stay: they are still valid code characters.
 *
 * The equivalent by hand is Code Reference -> Edit Code Map (admin) ->
 * Category "Variants" -> Edit each row -> clear "Means" -> Apply -> Save
 * changes. This does the same thing in one step, on whichever database
 * DATABASE_URL points at.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/clear-variant-suffixes.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/clear-variant-suffixes.js --apply
 */
import { prisma } from '../src/db.js'

const APPLY = process.argv.includes('--apply')

async function main() {
  const row = await prisma.codeMap.findUnique({ where: { id: 1 } })
  if (!row?.data || !Object.keys(row.data).length) {
    console.log('No stored code map — nothing to change. (A fresh one is seeded without suffixes.)')
    return
  }

  const variants = row.data.variants
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) {
    console.log('The stored map has no variants list — nothing to change.')
    return
  }

  const nonBlank = Object.entries(variants).filter(([, suffix]) => String(suffix ?? '').trim())
  console.log(`variants: ${JSON.stringify(variants)}`)

  if (!nonBlank.length) {
    console.log('\n✓ Every variant is already blank — nothing to change.')
    return
  }

  console.log(`\n${nonBlank.length} suffix(es) to clear:`)
  for (const [letter, suffix] of nonBlank) console.log(`   ${letter} = "${suffix}"  ->  ""`)
  console.log('\nThe letters stay; only the suffixes are cleared.')

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to clear them.')
    return
  }

  const cleared = Object.fromEntries(Object.keys(variants).map((letter) => [letter, '']))
  await prisma.codeMap.update({ where: { id: 1 }, data: { data: { ...row.data, variants: cleared } } })
  console.log(`\n✓ Cleared ${nonBlank.length} suffix(es). /codemap now serves ${JSON.stringify(cleared)}.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
