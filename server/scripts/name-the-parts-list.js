/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The parts list, said the way the claims on each number say it.
 *
 *     10  "Antenna"           ->  "Fuse"         (10A-10F are fuses; 10S is the antenna)
 *     11  "Antenna Connector" ->  "Antenna"      (11A Antenna With Cable)
 *     15  "DV15"              ->  "Connector"    (antenna, BNC, DV15, GPS, battery)
 *     25  "Keypad"            ->  "Keymate"      (25A Keymate)
 *     70   —                  ->  "Programming"  (70D/70I/70P)
 *     21  "Dismantle"         ->  "Handset"      (21A Handset; dismantle is 70D now)
 *     31  "LCD Base"          ->  "Fault-symptoms (No Parts)"
 *     32   —                  ->  "Electronics Components"
 *     10  "Fuse"              ->  "Fuses"        (a card head names a family)
 *     41  "Rotary Knob"       ->  "Knobs"
 *     27  "Keymate"           ->  removed
 *     41B "Rotart Switch"     ->  "Rotary Switch"
 *
 * A number's name is a DESCRIPTION, not a decision — an Issue type's claim is
 * what gives a code its meaning (see ReferenceCard.jsx). So everything above is
 * about what the Code Reference card and the /codemap the WhatsApp bot reads
 * SAY about a number, and none of it changes what a single code decodes to.
 *
 * 31 NAMES A SYMPTOM, NOT A PART. No Power, No Signal, No Backlight and No
 * Vibrate say what the radio is doing, not what came off the shelf for it —
 * they belong to a Repair or an RTO, where nothing is consumed. The name says
 * so out loud, because a technician reading the card decides from it whether
 * there is a part to draw.
 *
 * 27 IS CLEARED ON INSTRUCTION, and it is the one entry here that leaves a
 * number in use without a name: 27A Deskmic still claims it, so 27 will show
 * blank on the card until it is named again. That is a deliberate choice by the
 * person who owns the vocabulary, not an oversight of this script — naming it
 * "Deskmic" is one edit in the Code Map editor whenever that is wanted.
 *
 * THE TYPO IS THE ONE EDIT THAT IS NOT A DESCRIPTION. 41B's name is an Issue
 * type's, and a saved fault claims its code by an exact name match, so renaming
 * it would strand any record written as "Rotart Switch". None exists — checked
 * again at run time, and the rename is skipped if that has changed.
 *
 * IDEMPOTENT. Every edit happens only while the row still holds the value it is
 * moving off, so a second run does nothing and anything corrected by hand in
 * the meantime is never clobbered.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/name-the-parts-list.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/name-the-parts-list.js --apply
 */
import { prisma } from '../src/db.js'
import { norm } from '../../client/src/pairCode.js'

const APPLY = process.argv.includes('--apply')

// `from` is what the entry must still read for the edit to apply; undefined
// means the number has no name yet and one is being given.
const COMPONENTS = [
  { code: '10', from: 'Antenna', to: 'Fuse' },
  { code: '11', from: 'Antenna Connector', to: 'Antenna' },
  { code: '15', from: 'DV15', to: 'Connector' },
  { code: '25', from: 'Keypad', to: 'Keymate' },
  { code: '70', from: undefined, to: 'Programming' },
  { code: '21', from: 'Dismantle', to: 'Handset' },
  { code: '31', from: 'LCD Base', to: 'Fault-symptoms (No Parts)' },
  { code: '32', from: undefined, to: 'Electronics Components' },
  // Plurals, now that the name is read as the head of a card holding several
  // variants: "10 · 7 variants · Fuses" reads as a family, "Fuse" as one thing.
  { code: '10', from: 'Fuse', to: 'Fuses' },
  { code: '41', from: 'Rotary Knob', to: 'Knobs' },
  { code: '27', from: 'Keymate', to: null }, // null = remove the name
]

// An Issue type's own name, which is a different kind of thing — see the header.
const ISSUE_TYPES = [{ from: 'Rotart Switch', to: 'Rotary Switch' }]

async function main() {
  const map = (await prisma.codeMap.findUnique({ where: { id: 1 } }))?.data ?? null
  const options = (await prisma.appOptions.findUnique({ where: { id: 1 } }))?.data ?? {}

  const edits = []
  const components = { ...(map?.components ?? {}) }
  for (const { code, from, to } of COMPONENTS) {
    const held = components[code]
    if (from === undefined) {
      if (held !== undefined) {
        console.log(`${code} already reads "${held}" — left alone.`)
        continue
      }
      components[code] = to
      edits.push(`components ${code}: (unnamed) -> "${to}"`)
      continue
    }
    if (held === undefined || norm(held) !== norm(from)) {
      if (held !== undefined && norm(held) !== norm(to ?? '')) {
        console.log(`${code} reads "${held}", not "${from}" — left alone.`)
      }
      continue
    }
    if (to === null) {
      delete components[code]
      edits.push(`components ${code}: "${held}" -> removed`)
    } else {
      components[code] = to
      edits.push(`components ${code}: "${held}" -> "${to}"`)
    }
  }

  // The typo. A record written by the old name would lose its claim, so the
  // records are asked first and the rename is skipped if any still hold it.
  const typoEdits = []
  const reports = await prisma.savedReport.findMany({ select: { entries: true } })
  const working = await prisma.fault.findMany({ select: { issue: true } })
  const issueTypes = (options.issueTypes ?? []).map((t) => {
    const name = typeof t === 'string' ? t : t?.name
    const hit = ISSUE_TYPES.find((r) => norm(r.from) === norm(name))
    if (!hit || name === hit.to) return t
    let held = working.filter((f) => norm(f.issue) === norm(hit.from)).length
    for (const r of reports)
      for (const e of r.entries ?? []) for (const f of e.faults ?? []) if (norm(f.issue) === norm(hit.from)) held++
    if (held) {
      console.log(`"${hit.from}" is on ${held} record(s) — renaming it would strand them, so it stays.`)
      return t
    }
    typoEdits.push(`issue type: "${name}" -> "${hit.to}"`)
    return typeof t === 'string' ? hit.to : { ...t, name: hit.to }
  })

  console.log(`\nParts list:  ${edits.length} entry(ies)`)
  for (const line of edits) console.log(`   ${line}`)
  console.log(`Issue types: ${typoEdits.length} name(s)`)
  for (const line of typoEdits) console.log(`   ${line}`)

  const total = edits.length + typoEdits.length
  if (!total) {
    console.log('\nEverything already reads as it should - nothing to change.')
    return
  }
  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.')
    return
  }

  await prisma.$transaction(async (tx) => {
    if (edits.length) await tx.codeMap.update({ where: { id: 1 }, data: { data: { ...map, components } } })
    if (typoEdits.length) {
      await tx.appOptions.update({ where: { id: 1 }, data: { data: { ...options, issueTypes } } })
    }
  })
  console.log(`\nDone. ${total} edit(s) written.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
