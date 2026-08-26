/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Put the speakers on the name their device actually calls them.
 *
 *     on a TH1N            "Speaker Mid"   ->  "Speaker"
 *     on an SRG3900 CARKIT "Speaker Loud"  ->  "Speaker"
 *
 * 45A is one part with one name per device, and Manage inputs says that name is
 * "Speaker" on all five of them (H45A, T45A, C45A, D45A, B45A). The records
 * disagree: a TH1n's speaker was written down as "Speaker Mid" four times and
 * as "Speaker" once, a car kit's as "Speaker Loud" three times and "Speaker"
 * twice. So one part counts as two lines in every total it appears in, and the
 * search shows it as two badges that have to be added up by eye.
 *
 * PER DEVICE, NOT ACROSS THE BOARD. "Speaker Loud" is only the car kit's
 * speaker on a car kit; on some other radio it may well be a part of its own,
 * and a blanket rename would merge two different components on the strength of
 * a name. Each rename here names the device it applies to, and an entry on any
 * other model is not touched.
 *
 * THE CLAIM IS CHECKED BEFORE ANYTHING MOVES. A saved fault claims its parts
 * code by an exact name match (claimedPartsCode), so a rename can silently move
 * a fault onto a different code — or off one. This refuses to write if the name
 * being left claims a code the new name does not, which is the direction that
 * loses a shelf. Gaining a claim is reported instead of refused: a fault that
 * claimed nothing and now claims 45A has been put right, which is the point.
 *
 * WHAT IS NOT DONE HERE: the old names are left in the Issue types list. They
 * may still be the right name for another device, and removing a row is a
 * decision about the vocabulary rather than about the records. If nothing uses
 * them any more, delete them in Manage inputs — that is one edit, and it is
 * visible to whoever makes it.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/name-the-speakers.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/name-the-speakers.js --apply
 */
import { prisma } from '../src/db.js'
import { norm, claimedPartsCode } from '../../client/src/pairCode.js'
import { modelKey } from '../../client/src/options.js'

const APPLY = process.argv.includes('--apply')

// Each rename is scoped to the device it is true of. `from` and `to` are both
// folded, so "SPEAKER MID", "Speaker Mid" and "speaker-mid" are one name, and a
// record already reading "SPEAKER" is put onto the list's own "Speaker".
const RENAMES = [
  { model: 'TH1N', from: 'Speaker Mid', to: 'Speaker' },
  { model: 'SRG3900 CARKIT', from: 'Speaker Loud', to: 'Speaker' },
]

const PLAN = RENAMES.map((r) => ({
  ...r,
  device: modelKey(r.model),
  keys: new Set([norm(r.from), norm(r.to)]),
}))

// The spelling this fault should end on, given the device it was found on.
const targetFor = (model, issue) => {
  const device = modelKey(model)
  const key = norm(issue)
  const hit = PLAN.find((r) => r.device === device && r.keys.has(key))
  return hit && hit.to !== String(issue ?? '').trim() ? hit.to : null
}

const tally = (lines) => {
  const out = new Map()
  for (const l of lines) out.set(l, (out.get(l) ?? 0) + 1)
  return [...out].sort((a, b) => b[1] - a[1])
}

async function main() {
  const options = (await prisma.appOptions.findUnique({ where: { id: 1 } }))?.data ?? {}
  const issueTypes = options.issueTypes ?? []

  // 1. What each name claims today. A rename that leaves a claim behind is the
  //    one that costs a shelf, and it is refused; one that gains a claim is the
  //    repair this script exists to make.
  let refuse = false
  for (const r of PLAN) {
    const was = claimedPartsCode(r.from, issueTypes)
    const now = claimedPartsCode(r.to, issueTypes)
    const where = `${r.model}: "${r.from}" -> "${r.to}"`
    if (was && was !== now) {
      console.log(`REFUSING ${where} — "${r.from}" claims ${was}, "${r.to}" claims ${now || 'nothing'}.`)
      refuse = true
    } else if (!was && now) {
      console.log(`${where} — puts these faults onto ${now}, which they never reached under the old name.`)
    } else if (was && was === now) {
      console.log(`${where} — both names already claim ${was}; only the text changes.`)
    } else {
      console.log(`${where} — neither name claims a code; only the text changes.`)
    }
  }
  if (refuse) {
    console.log('\nNothing written. Fix the Issue types so both names claim the same code, then run this again.')
    process.exitCode = 1
    return
  }

  // 2. The records: every saved report, and the entries still on the bench.
  const reports = await prisma.savedReport.findMany({
    select: { id: true, entries: true },
    orderBy: { seq: 'asc' },
  })
  const reportEdits = []
  const lines = []
  let faults = 0
  for (const r of reports) {
    let touched = 0
    const entries = (r.entries ?? []).map((e) => ({
      ...e,
      faults: (e.faults ?? []).map((f) => {
        const to = targetFor(e.model, f.issue)
        if (!to) return f
        touched++
        lines.push(`${e.model}: "${String(f.issue).trim()}" -> "${to}"`)
        return { ...f, issue: to }
      }),
    }))
    if (touched) {
      faults += touched
      reportEdits.push({ id: r.id, entries })
    }
  }

  // The working set's faults carry no model of their own — it sits on the entry
  // they belong to — so they are read through it.
  const working = await prisma.reportEntry.findMany({
    select: { id: true, model: true, faults: { select: { id: true, issue: true } } },
  })
  const workingEdits = []
  for (const e of working) {
    for (const f of e.faults ?? []) {
      const to = targetFor(e.model, f.issue)
      if (to) workingEdits.push({ id: f.id, to, line: `${e.model}: "${String(f.issue).trim()}" -> "${to}"` })
    }
  }

  console.log(`\nSaved reports: ${faults} fault(s) across ${reportEdits.length} report(s)`)
  for (const [line, count] of tally(lines)) console.log(`   ${line}   x${count}`)
  console.log(`Working set:   ${workingEdits.length} fault(s)`)
  for (const [line, count] of tally(workingEdits.map((w) => w.line))) console.log(`   ${line}   x${count}`)

  const total = faults + workingEdits.length
  if (!total) {
    console.log('\nEvery speaker already reads as its device names it - nothing to change.')
    return
  }
  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.')
    return
  }

  await prisma.$transaction(
    async (tx) => {
      for (const e of reportEdits) await tx.savedReport.update({ where: { id: e.id }, data: { entries: e.entries } })
      for (const f of workingEdits) await tx.fault.update({ where: { id: f.id }, data: { issue: f.to } })
    },
    { timeout: 5 * 60 * 1000, maxWait: 30 * 1000 },
  )
  console.log(`\nDone. ${total} rename(s) written.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
