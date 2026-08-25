/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Put every fault name in the saved reports into the spelling the vocabulary
 * uses for it.
 *
 * "FIST MIC" and "Fistmic" are the same part. "BATTERY 3180", "Battery3180"
 * and "Battery 3180" are the same part three times. Twelve items were stored
 * under more than one spelling.
 *
 * The CODES were never split by this. claimedPartsCode compares through norm(),
 * which folds away case and punctuation, so every one of those spellings
 * already reached 19A or 44B. What was split is the text — and the text is what
 * a person reads down the saved-report list, what a search matches on, and what
 * groups a line in anything keyed on the name as written.
 *
 * So this is a readability fix rather than an accounting one, which is why it
 * is separate from consolidate-issue-names.js: that one moved faults onto names
 * they were not reaching at all.
 *
 * THE CANONICAL SPELLING IS THE VOCABULARY'S OWN. Each name in the options list
 * maps to ITSELF, and a fault whose name folds to the same key takes it. That
 * matters more than it looks: an issue type can carry per-model names (99A is
 * "Charger ACP-12" on a TH1n and "ChargerSC2" on an STP9000), and mapping every
 * name onto the type's primary one would quietly rewrite the STP9000 name into
 * the Airbus one. Each spelling is canonical for its own key and nothing else.
 *
 * Anything the vocabulary does not name is left exactly as it is — there is
 * nothing to correct it towards, and inventing one would be a guess.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/normalize-issue-spellings.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/normalize-issue-spellings.js --apply
 */
import { prisma } from '../src/db.js'
import { norm } from '../../client/src/pairCode.js'
import { issueAllNames } from '../../client/src/options.js'

const APPLY = process.argv.includes('--apply')

async function main() {
  const data = (await prisma.appOptions.findUnique({ where: { id: 1 } }))?.data ?? {}

  // norm -> the spelling to use. Every vocabulary name is canonical for its
  // own key; see the header for why it is not the type's primary name.
  const canon = new Map()
  for (const t of data.issueTypes ?? []) for (const n of issueAllNames(t)) if (n) canon.set(norm(n), n)
  // The materials list fills in for anything the issue types do not name, and
  // never overrides them — a coded part's spelling is the one that counts.
  for (const m of data.materials ?? []) {
    const n = typeof m === 'object' ? m?.name : m
    if (n && !canon.has(norm(n))) canon.set(norm(n), n)
  }
  // The standalone actions are names a fault can carry too.
  for (const a of data.actions ?? []) if (a && !canon.has(norm(a))) canon.set(norm(a), a)

  const reports = await prisma.savedReport.findMany({
    select: { id: true, reportId: true, entries: true },
    orderBy: { seq: 'asc' },
  })

  const edits = []
  const tally = new Map()
  const unnamed = new Set()
  for (const r of reports) {
    let touched = 0
    const entries = (r.entries ?? []).map((e) => ({
      ...e,
      faults: (e.faults ?? []).map((f) => {
        const raw = String(f.issue ?? '').trim()
        if (!raw) return f
        const to = canon.get(norm(raw))
        if (!to) {
          unnamed.add(raw)
          return f
        }
        if (to === raw) return f
        touched++
        const line = `"${raw}"  ->  "${to}"`
        tally.set(line, (tally.get(line) ?? 0) + 1)
        return { ...f, issue: to }
      }),
    }))
    if (touched) edits.push({ id: r.id, entries })
  }

  const n = [...tally.values()].reduce((a, b) => a + b, 0)
  console.log(`${reports.length} saved reports - ${n} fault(s) to respell across ${edits.length} report(s):`)
  for (const [line, c] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`   ${line}   x${c}`)
  if (unnamed.size) {
    console.log('\nnamed by nothing in the vocabulary, so left alone:')
    for (const u of [...unnamed].sort()) console.log(`   ${u}`)
  }

  if (!edits.length) {
    console.log('\nEvery fault already reads as the vocabulary spells it - nothing to change.')
    return
  }
  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.')
    return
  }

  await prisma.$transaction(
    async (tx) => {
      for (const e of edits) await tx.savedReport.update({ where: { id: e.id }, data: { entries: e.entries } })
    },
    { timeout: 5 * 60 * 1000, maxWait: 30 * 1000 },
  )
  console.log(`\nDone. Respelled ${n} fault(s) in ${edits.length} report(s).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
