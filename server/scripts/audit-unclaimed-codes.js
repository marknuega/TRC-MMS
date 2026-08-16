/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Which codes stop decoding once the unclaimed fallback is gone?
 *
 * A fault code is parts + variant, e.g. 19B. There were two ways to resolve
 * one: an Issue type CLAIMING it outright (Manage inputs -> Issue types), or,
 * failing that, a fallback that looked the parts number up in the code map's
 * `components` and appended the `variants` suffix. That fallback is being
 * removed — every code must be claimed.
 *
 * So any parts number that lives in `components` but that no Issue type
 * claims currently decodes and will stop. This lists exactly those, so they
 * can be claimed BEFORE the change ships rather than discovered by a
 * technician whose report is refused.
 *
 * Read-only: it writes nothing.
 *
 *   cd server && node --env-file=.env scripts/audit-unclaimed-codes.js
 *
 * Point DATABASE_URL at production to audit production.
 */
import { prisma } from '../src/db.js'
import { faultCodes } from '../src/routes/codemap.js'
import { CODEMAP_SEED } from '../src/codemapSeed.js'

const PARTS_RE = /^\d{2}$/

async function main() {
  const [mapRow, optRow] = await Promise.all([
    prisma.codeMap.findUnique({ where: { id: 1 } }),
    prisma.appOptions.findUnique({ where: { id: 1 } }),
  ])

  const map = mapRow?.data && Object.keys(mapRow.data).length ? mapRow.data : CODEMAP_SEED
  const components = map.components ?? {}
  const variants = map.variants ?? {}
  const claimed = faultCodes(optRow?.data?.issueTypes ?? [])

  const variantLetters = Object.keys(variants).filter((v) => /^[A-Z]$/i.test(v)).map((v) => v.toUpperCase())
  const partsNumbers = Object.keys(components).filter((p) => PARTS_RE.test(p))

  console.log(`code map:      ${partsNumbers.length} usable parts numbers, variants ${variantLetters.join('/') || '(none)'}`)
  console.log(`issue types:   ${Object.keys(claimed).length} codes claimed`)
  console.log('')

  // Every combination the fallback can currently resolve.
  const losing = []
  for (const parts of partsNumbers) {
    for (const variant of variantLetters) {
      const code = `${parts}${variant}`
      if (!claimed[code]) losing.push({ code, wouldHaveMeant: `${components[parts]}${variants[variant] ? ` ${variants[variant]}` : ''}` })
    }
  }

  if (!losing.length) {
    console.log('✓ Nothing to do — every code the fallback resolves is already claimed.')
  } else {
    console.log(`${losing.length} code(s) decode TODAY via the fallback and would stop:`)
    console.log('')
    for (const { code, wouldHaveMeant } of losing) {
      console.log(`  ${code.padEnd(5)} ${wouldHaveMeant}`)
    }
    console.log('')
    console.log('Claim each under Manage inputs -> Issue types (Parts Code + Variant),')
    console.log('or accept that these codes will be refused with a clear error.')
  }

  // Claims that no longer correspond to anything are fine — a claim needs no
  // code-map entry at all — but worth showing so the two lists can be read together.
  const orphan = Object.keys(claimed).filter((c) => !partsNumbers.includes(c.slice(0, 2)))
  if (orphan.length) {
    console.log('')
    console.log(`(${orphan.length} claimed code(s) have no code-map parts number, which is fine — a claim stands alone: ${orphan.join(', ')})`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
