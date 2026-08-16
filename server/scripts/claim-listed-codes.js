/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Claim the fault codes on the list below.
 *
 * A fault code resolves only through an Issue type claiming it. These are the
 * codes that still need one, with the name each actually means — supplied by
 * hand, NOT derived from the code map's `components`.
 *
 * That distinction matters. `components` is stale: it still calls 44 a
 * Microphone where production has claimed 44A/44B/44C as batteries, and its
 * variant model (B = "3D build") does not hold — 12B is B Cover, not "A Cover
 * 3D". Anything generated from it would have written those wrong names in.
 *
 * Rules:
 *   - a code already claimed is NEVER overwritten, only reported;
 *   - a code whose name exactly matches an existing UNCODED issue type is
 *     attached to it, rather than adding a duplicate row;
 *   - otherwise a new issue type is added.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing:
 *   cd server && node --env-file=.env scripts/claim-listed-codes.js
 *
 * Add --apply to write, after reading the plan:
 *   cd server && node --env-file=.env scripts/claim-listed-codes.js --apply
 *
 * Point DATABASE_URL at production to fix production, then re-run
 * scripts/audit-unclaimed-codes.js.
 */
import { prisma } from '../src/db.js'
import { issueCode, issueName } from '../../client/src/options.js'

// code -> what it means. Edit here to add or correct one.
//
// PRODUCTION IS THE SOURCE OF TRUTH for anything already claimed there. Nine
// of these read differently in production, and production wins — six of them
// are a different part entirely, not just different wording, because the
// scheme was re-mapped and some codes shifted a slot (25 was Keypad, is now
// Keymate; 27 was Keymate, is now Deskmic). They are written out below as
// production has them, so running this against an empty database reproduces
// production rather than resurrecting the older meanings. The script would
// not have overwritten them either way — it never touches an existing claim.
const CLAIMS = {
  '11A': 'Antenna', //               was listed as Antenna Connector
  '12A': 'A Cover',
  '12B': 'B Cover', //               not "A Cover 3D" — the variant is not a 3D build here
  '15A': 'DV15',
  '19A': 'Fistmic',
  '20A': 'PowerCable', //            was listed as Programming
  '21A': 'Hand-MicroLoudSpeaker', // was listed as Dismantle
  '22A': 'Installation',
  '23A': 'PCB',
  '24A': 'Handset',
  '25A': 'Keymate', //               was listed as Keypad
  '26A': 'LCD',
  '27A': 'Deskmic', //               was listed as Keymate
  '28A': 'Micro-Loud Speaker',
  '29A': 'Speaker Base',
  '30A': 'Antenna Base',
  '31A': 'NoSignal', //              was listed as LCD Base
  '33A': 'Fuse Cover',
  '41A': 'RotKnob',
  '42B': 'Rotary Switch',
  '43A': 'Side Grip',
  '43B': 'Side Grip 3D', //          here the variant IS a 3D build
  '44A': 'Battery1590', //           was listed as Microphone
  '45A': 'Speaker',
  '46A': 'Speaker Mid',
  '95A': 'Battery Pack',
  '98A': 'Power Supply',
}

const APPLY = process.argv.includes('--apply')
const up = (v) => String(v ?? '').trim().toUpperCase()
const norm = (v) => up(v).replace(/[^A-Z0-9]/g, '')

async function main() {
  const optRow = await prisma.appOptions.findUnique({ where: { id: 1 } })
  const data = optRow?.data ?? {}
  const issueTypes = Array.isArray(data.issueTypes) ? [...data.issueTypes] : []

  const claimedBy = new Map()
  for (const t of issueTypes) {
    const c = issueCode(t)
    if (c) claimedBy.set(c, issueName(t))
  }

  const attached = []
  const added = []
  const already = []

  for (const [code, meaning] of Object.entries(CLAIMS)) {
    const parts = code.slice(0, 2)
    const variant = code.slice(2)

    const existing = claimedBy.get(code)
    if (existing !== undefined) {
      already.push({ code, existing, listed: meaning })
      continue
    }

    const name = up(meaning)
    const idx = issueTypes.findIndex((t) => norm(issueName(t)) === norm(name) && !issueCode(t))
    if (idx >= 0) {
      issueTypes[idx] = { name: issueName(issueTypes[idx]), parts, variant }
      attached.push({ code, name: issueName(issueTypes[idx]) })
    } else {
      issueTypes.push({ name, parts, variant })
      added.push({ code, name })
    }
    claimedBy.set(code, name)
  }

  console.log(`issue types: ${(data.issueTypes ?? []).length} before, ${issueTypes.length} after`)
  console.log('')

  if (attached.length) {
    console.log(`${attached.length} existing issue type(s) gain their code (no new row):`)
    for (const { code, name } of attached) console.log(`   ${code.padEnd(5)} -> ${name}`)
    console.log('')
  }
  if (added.length) {
    console.log(`${added.length} new issue type(s):`)
    for (const { code, name } of added) console.log(`   ${code.padEnd(5)} -> ${name}`)
    console.log('')
  }
  if (already.length) {
    console.log(`${already.length} already claimed — left exactly as they are:`)
    for (const { code, existing, listed } of already) {
      const differs = norm(existing) !== norm(listed)
      console.log(`   ${code.padEnd(5)} ${existing}${differs ? `   (list says "${listed}" — NOT changed)` : ''}`)
    }
    console.log('')
  }

  const total = attached.length + added.length
  if (!total) {
    console.log('Nothing to write — every listed code is already claimed.')
    return
  }
  if (!APPLY) {
    console.log(`DRY RUN — nothing written. Re-run with --apply to make these ${total} change(s).`)
    return
  }

  await prisma.appOptions.upsert({
    where: { id: 1 },
    create: { id: 1, data: { ...data, issueTypes } },
    update: { data: { ...data, issueTypes } },
  })
  console.log(`✓ Applied ${total} change(s).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
