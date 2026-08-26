/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Take the dead speaker names off the parts list, and off the materials.
 *
 *     components 45  "Speaker Low"           ->  "Speaker"
 *     components 46  "Speaker Mid"           ->  "Topboard"
 *     materials      "Hand-MicroLoudSpeaker" ->  "Fist Mic"
 *
 * "Speaker Mid" and "Speaker Low" are what 45 and 46 were called before the
 * Issue types claimed them, and nothing answers to either name any more: 45 is
 * claimed as "Speaker" (45A, on all five radios) and "Speaker82" (45B), and 46
 * as "Topboard" (46A, STP9000). The records were moved onto those names
 * already; this is the last place the old ones are still printed — the Code
 * Reference card, and the /codemap the WhatsApp bot reads.
 *
 * RENAMED, NOT DELETED. `components` is the vocabulary of parts NUMBERS, and
 * every one of these numbers is still in use — deleting the entry would leave
 * 45 and 46 unnamed on the card while codes built from them go on decoding.
 * The name is what was wrong, so the name is what changes, onto what the claims
 * on that number actually say.
 *
 * Nothing here decides what a code MEANS. That has been the Issue type's job
 * since the claims came in (see ReferenceCard.jsx) — these names describe the
 * number a code is built from, and this run only makes the description true.
 *
 * The material is renamed for the same reason and not deleted: a fist mic is a
 * real thing to hand over on a transmittal, no transmittal has ever named this
 * one (checked: zero), and "Hand-MicroLoudSpeaker" is the name it was written
 * under before the list settled on "Fist Mic".
 *
 * IDEMPOTENT. Each entry is rewritten only while it still holds the dead name,
 * so a second run does nothing, and a name somebody has since corrected by hand
 * is never clobbered.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/retire-the-dead-speaker-names.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/retire-the-dead-speaker-names.js --apply
 */
import { prisma } from '../src/db.js'
import { norm } from '../../client/src/pairCode.js'

const APPLY = process.argv.includes('--apply')

// code -> { from, to }. `from` is the dead name this entry must still hold for
// the rename to apply; `to` is what the claims on that number say it is.
const COMPONENTS = {
  45: { from: 'Speaker Low', to: 'Speaker' },
  46: { from: 'Speaker Mid', to: 'Topboard' },
}

const MATERIALS = [{ from: 'Hand-MicroLoudSpeaker', to: 'Fist Mic' }]

async function main() {
  const map = (await prisma.codeMap.findUnique({ where: { id: 1 } }))?.data ?? null
  const options = (await prisma.appOptions.findUnique({ where: { id: 1 } }))?.data ?? {}

  // 1. The parts list on the Code Reference card.
  const mapEdits = []
  const components = { ...(map?.components ?? {}) }
  for (const [code, { from, to }] of Object.entries(COMPONENTS)) {
    const held = components[code]
    if (held === undefined) continue
    if (norm(held) !== norm(from)) {
      if (norm(held) !== norm(to)) console.log(`${code} reads "${held}", not "${from}" — left alone.`)
      continue
    }
    components[code] = to
    mapEdits.push(`components ${code}: "${held}" -> "${to}"`)
  }

  // 2. The transmittal materials.
  const materialEdits = []
  const materials = (options.materials ?? []).map((m) => {
    const name = typeof m === 'string' ? m : m?.name
    const hit = MATERIALS.find((r) => norm(r.from) === norm(name))
    if (!hit || name === hit.to) return m
    materialEdits.push(`materials: "${name}" -> "${hit.to}"`)
    return typeof m === 'string' ? hit.to : { ...m, name: hit.to }
  })

  console.log(`\nCode map:  ${mapEdits.length} entry(ies)`)
  for (const line of mapEdits) console.log(`   ${line}`)
  console.log(`Materials: ${materialEdits.length} row(s)`)
  for (const line of materialEdits) console.log(`   ${line}`)

  const total = mapEdits.length + materialEdits.length
  if (!total) {
    console.log('\nNo dead names left - nothing to change.')
    return
  }
  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.')
    return
  }

  await prisma.$transaction(async (tx) => {
    if (mapEdits.length) await tx.codeMap.update({ where: { id: 1 }, data: { data: { ...map, components } } })
    if (materialEdits.length) {
      await tx.appOptions.update({ where: { id: 1 }, data: { data: { ...options, materials } } })
    }
  })
  console.log(`\nDone. ${total} rename(s) written.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
