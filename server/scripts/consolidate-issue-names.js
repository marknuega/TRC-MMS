/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Put every fault in the saved reports back on a name the vocabulary knows.
 *
 * A saved report stores the issue NAME, and the parts code is derived from it
 * at read time by an EXACT match (claimedPartsCode, exact on purpose — a loose
 * one would silently promote "SPEAKER" onto "SPEAKER LOUD"'s code and draw the
 * wrong item off the shelf for good). So a fault written as "Charger12" while
 * the list says "Charger ACP-12" claims no code at all: it counts as a line of
 * its own in every total, and never reaches the Model+Parts+Company its stock
 * actually sits under.
 *
 * That is why the same charger has been two lines in the totals since day one,
 * and it was never only the chargers — the table below is the whole of it.
 *
 * Renaming is safe for STOCK, because a name is not what moved it. The ledger
 * rows (InventoryTxn) recorded what was actually deducted at the time, and are
 * untouched here. This changes what the reports SAY, which is the part that
 * was wrong.
 *
 * TWO STEPS, in this order:
 *   1. Add the issue types the old names were reaching for and never had.
 *   2. Rewrite the fault names in every saved report.
 * Step 1 first, so nothing is renamed onto a name that does not exist yet.
 *
 * WHAT IS DELIBERATELY LEFT ALONE:
 *   - "Antenna" on a TH1N. It has no coded issue type, but it matches the
 *     inventory item H11A by NAME, so it already draws from the right box on
 *     the right company's shelf. Only its casing is normalised, so the two
 *     spellings stop counting as two lines.
 *   - The transmittal consumables: Solder Lead, Electric Tape, Super Glue, A4
 *     Paper, BNC, Lugs, AntennaSTP, Data Cable/LCD Cable. Those are materials
 *     moved on a transmittal, not faults on a device, and carry no issue code
 *     by design.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/consolidate-issue-names.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/consolidate-issue-names.js --apply
 */
import { prisma } from '../src/db.js'
import { norm } from '../../client/src/pairCode.js'
import { issueName, issueCode, issueAllNames } from '../../client/src/options.js'

const APPLY = process.argv.includes('--apply')

// The siblings the 45 family was missing. Component 45 is "Speaker Low" and
// the list held 45A Speaker and 45B Speaker82, so a Mid and a Loud had nothing
// to be picked from and were written by hand, report after report, with no
// code behind them.
const NEW_TYPES = [
  { name: 'Speaker Mid', parts: '45', variant: 'C', models: ['TH1N'] },
  { name: 'Speaker Loud', parts: '45', variant: 'D', models: ['SRG3900 CARKIT'] },
]

// (model, name as written) -> the vocabulary's own name.
//
// Scoped to the MODEL on purpose. "CHARGER" on a TH1n is the ACP-12; the same
// word on an STP9000 is a different item on a different shelf, and a rename
// blind to the model would move one onto the other.
const RENAMES = [
  { model: 'TH1N', from: 'Charger12', to: 'Charger ACP-12' },
  { model: 'TH1N', from: 'CHARGER', to: 'Charger ACP-12' },
  { model: 'STP9000', from: 'Charger-DEY', to: 'ChargerDEY' },
  { model: 'SRG3900 CARKIT', from: 'INSTALL', to: 'Installation' },
  { model: 'TH1N', from: 'ROT KNOB', to: 'Rotary Knob' },
  { model: 'SRG3900 CARKIT', from: 'FusibleResistor', to: 'Resistor' },
  { model: 'TH1N', from: 'ButtonPTT', to: 'PTT' },
  { model: 'TH1N', from: 'ANTENNA', to: 'Antenna' },
  { model: 'TH1N', from: 'SPEAKER MID', to: 'Speaker Mid' },
  { model: 'SRG3900 CARKIT', from: 'SPEAKER LOUD', to: 'Speaker Loud' },
  { model: 'SRG3900 CARKIT', from: 'FUSE HOLDER', to: 'Fuse10' },
]

const key = (model, name) => `${norm(model)} ${norm(name)}`
const MAP = new Map(RENAMES.map((r) => [key(r.model, r.from), r.to]))

async function main() {
  const optRow = await prisma.appOptions.findUnique({ where: { id: 1 } })
  const data = optRow?.data ?? {}
  const types = [...(data.issueTypes ?? [])]

  // ---- step 1: the issue types that were missing --------------------------
  const claimed = new Map()
  for (const t of types) {
    const c = issueCode(t)
    if (c) claimed.set(c, issueName(t))
  }
  const adding = []
  for (const t of NEW_TYPES) {
    const code = `${t.parts}${t.variant}`
    const held = claimed.get(code)
    // A code means one part to every reader of it, so a clash is refused
    // rather than resolved — the same refusal the entry form makes.
    if (held && norm(held) !== norm(t.name)) {
      console.log(`FAILED: ${code} is already ${held} - pick another variant for ${t.name}. Nothing written.`)
      process.exitCode = 1
      return
    }
    if (types.some((x) => norm(issueName(x)) === norm(t.name))) continue // already there
    adding.push(t)
  }
  console.log(adding.length ? `${adding.length} issue type(s) to add:` : 'No issue types to add.')
  for (const t of adding) console.log(`   ${t.name}  ${t.parts}${t.variant}  ${t.models.join(', ')}`)

  // ---- step 2: the renames ------------------------------------------------
  // Every name a fault can still resolve through once the additions are in, so
  // a rename can never point at something nothing will match.
  //
  // TWO sources, because a save has two ways to find the box: the parts code
  // an issue type claims, and failing that the inventory item's own name (see
  // collectUsage in routes/savedReports.js). "Antenna" is the second kind — no
  // issue type carries it, but H11A is aliased exactly that, so a fault named
  // Antenna already draws from the right item. Checking only the vocabulary
  // would refuse a target that in fact resolves perfectly well.
  const after = [...types, ...adding]
  const known = new Set()
  for (const t of after) for (const n of issueAllNames(t)) if (n) known.add(norm(n))
  const inv = await prisma.inventoryItem.findMany({ select: { itemCode: true, alias: true } })
  for (const i of inv) for (const n of [norm(i.itemCode), norm(i.alias)]) if (n) known.add(n)

  const missing = [...new Set(RENAMES.map((r) => r.to))].filter((t) => !known.has(norm(t)))
  if (missing.length) {
    console.log(`\nFAILED: nothing would match these rename targets: ${missing.join(', ')}. Nothing written.`)
    process.exitCode = 1
    return
  }

  const reports = await prisma.savedReport.findMany({
    select: { id: true, reportId: true, entries: true },
    orderBy: { seq: 'asc' },
  })

  const edits = []
  const tally = new Map()
  for (const r of reports) {
    let touched = 0
    const entries = (r.entries ?? []).map((e) => ({
      ...e,
      faults: (e.faults ?? []).map((f) => {
        const to = MAP.get(key(e.model, f.issue))
        if (!to || to === f.issue) return f
        touched++
        const line = `${e.model} | ${f.issue}  ->  ${to}`
        tally.set(line, (tally.get(line) ?? 0) + 1)
        return { ...f, issue: to }
      }),
    }))
    if (touched) edits.push({ id: r.id, reportId: r.reportId, entries })
  }

  const faults = [...tally.values()].reduce((n, v) => n + v, 0)
  console.log(`\n${reports.length} saved reports - ${faults} fault(s) to rename across ${edits.length} report(s):`)
  for (const [line, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`   ${line}   x${n}`)

  if (!adding.length && !edits.length) {
    console.log('\nEverything already reads as the vocabulary names it - nothing to change.')
    return
  }
  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.')
    return
  }

  // One transaction: the reports must not be left naming a type the options
  // row does not carry, nor the other way round.
  await prisma.$transaction(
    async (tx) => {
      if (adding.length) {
        await tx.appOptions.upsert({
          where: { id: 1 },
          create: { id: 1, data: { ...data, issueTypes: after } },
          update: { data: { ...data, issueTypes: after } },
        })
      }
      for (const e of edits) await tx.savedReport.update({ where: { id: e.id }, data: { entries: e.entries } })
    },
    { timeout: 5 * 60 * 1000, maxWait: 30 * 1000 },
  )
  console.log(
    `\nDone. Added ${adding.length} issue type(s) and renamed ${faults} fault(s) in ${edits.length} report(s).`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
