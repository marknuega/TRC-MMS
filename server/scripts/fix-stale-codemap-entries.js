/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * One-time cleanup for the "code map" warning on the Code Reference page:
 *   "5 entries in the code map are not usable ... H43A, H43B, 98A, 99A, 99B"
 *
 * These five were carried into `components` verbatim from the old WhatsApp
 * bridge (see codemapSeed.js). A parts number is exactly two digits, so none
 * of the five could ever be reached by a decode:
 *   - H43A / H43B just duplicate 43+A / 43+B, already covered by `variants` —
 *     removed outright.
 *   - 98A / 99A / 99B name real parts nothing else covers, so instead of being
 *     deleted they are re-homed as Issue-type claims (Manage inputs -> Issue
 *     types), which is the mechanism built for exactly this — a code that
 *     needs to decode to something more specific than its bare parts number.
 *
 * codemapSeed.js already stops these from appearing on a FRESH install (an
 * empty code_map row is only ever seeded once). This script is for an
 * install that already has a code_map row from before that fix — it edits
 * the live rows in place. Idempotent: safe to run more than once, and a run
 * against a database that never had the stale rows does nothing.
 *
 * Usage (from server/, with DATABASE_URL pointed at the real database):
 *   node scripts/fix-stale-codemap-entries.js
 */
import { prisma } from '../src/db.js'

// code -> null (delete only) or { name, parts, variant } (delete, then claim
// as an Issue type so the code still decodes).
const STALE = {
  H43A: null,
  H43B: null,
  '98A': { name: 'Power Supply - PSE65-12', parts: '98', variant: 'A' },
  // 99A is the Charger12 (it named the Charger818 until 2026-08-17). Renaming
  // it here only affects an install that has not run this script yet: the claim
  // is a row in app_options once made, and this script never touches a code
  // that is already claimed. See the note at the top about the live map.
  '99A': { name: 'Charger12', parts: '99', variant: 'A' },
  '99B': { name: 'ChargerDC', parts: '99', variant: 'B' },
}

async function main() {
  const codeMapRow = await prisma.codeMap.findUnique({ where: { id: 1 } })
  const components = { ...(codeMapRow?.data?.components ?? {}) }

  const removed = []
  for (const code of Object.keys(STALE)) {
    if (code in components) {
      removed.push(code)
      delete components[code]
    }
  }

  if (removed.length) {
    await prisma.codeMap.update({
      where: { id: 1 },
      data: { data: { ...codeMapRow.data, components } },
    })
    console.log(`code_map: removed ${removed.join(', ')} from components`)
  } else {
    console.log('code_map: nothing to remove — none of the stale codes are present')
  }

  const rehome = removed.filter((code) => STALE[code])
  if (!rehome.length) {
    console.log('app_options: nothing to re-home')
    await prisma.$disconnect()
    return
  }

  const optsRow = await prisma.appOptions.findUnique({ where: { id: 1 } })
  const issueTypes = [...(optsRow?.data?.issueTypes ?? [])]
  const alreadyClaimed = (parts, variant) =>
    issueTypes.some(
      (it) =>
        it && typeof it === 'object' && String(it.parts) === parts && String(it.variant).toUpperCase() === variant,
    )

  const added = []
  const skipped = []
  for (const code of rehome) {
    const { name, parts, variant } = STALE[code]
    if (alreadyClaimed(parts, variant)) {
      skipped.push(`${code} (${parts}${variant} already claimed)`)
      continue
    }
    issueTypes.push({ name, parts, variant })
    added.push(`${code} -> "${name}"`)
  }

  if (added.length) {
    await prisma.appOptions.upsert({
      where: { id: 1 },
      create: { id: 1, data: { ...(optsRow?.data ?? {}), issueTypes } },
      update: { data: { ...(optsRow?.data ?? {}), issueTypes } },
    })
    console.log(`app_options: added Issue types for ${added.join(', ')}`)
  }
  if (skipped.length) console.log(`app_options: skipped (already claimed) ${skipped.join(', ')}`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
