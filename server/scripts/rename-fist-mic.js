/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Rename the fistmic — and the 3D one — everywhere the older spelling is still
 * written down: the code map, the option lists, the saved reports, and the
 * entries still on the working set.
 *
 *     Fistmic     ->  Fist Mic
 *     Fistmic 3D  ->  Fist Mic 3D
 *
 * The part has been renamed in Manage inputs, and that settles what every fault
 * written from now on says. It settles nothing about what is already written:
 * the saved reports still read "Fistmic", and the code map still names 19 that
 * way, so the Code Reference card and the WhatsApp bot go on saying a name the
 * app itself no longer uses.
 *
 * A NAME AND ITS CODE MOVE TOGETHER, OR NOT AT ALL. A saved fault claims its
 * parts code by an EXACT name match (claimedPartsCode — exact on purpose, see
 * consolidate-issue-names.js), so a fault renamed away from the issue type that
 * names it loses its code and its shelf, quietly, in every report at once. That
 * is why the vocabulary is rewritten in the same transaction as the records,
 * and why the plan is checked before anything is written: every issue-type name
 * that folds to one of the keys above must come out of this as the spelling
 * above, or the run is refused.
 *
 * WHAT IS MATCHED is the folded key, through norm() — the same comparison the
 * codes are resolved by. "Fistmic", "FIST MIC" and "fist-mic" are one part
 * under three spellings and all three land on "Fist Mic"; "Fistmic 3D" folds to
 * a key of its own and lands on "Fist Mic 3D". A name folding to neither is a
 * different part: it is reported and left exactly as it is.
 *
 * STOCK IS NOT AFFECTED. The inventory ledger recorded what was actually
 * deducted at the time and is never rewritten. This changes what the records
 * SAY, which is the part that is out of date.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/rename-fist-mic.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/rename-fist-mic.js --apply
 */
import { prisma } from '../src/db.js'
import { norm } from '../../client/src/pairCode.js'
import { issueAllNames } from '../../client/src/options.js'

const APPLY = process.argv.includes('--apply')

// The spellings to end on. Every other spelling of each folds onto it.
const RENAMES = ['Fist Mic', 'Fist Mic 3D']
const TARGETS = new Map(RENAMES.map((to) => [norm(to), to]))

// The spelling this name should end on, or null when it names something else.
const targetFor = (v) => TARGETS.get(norm(v)) ?? null
// Near enough to be worth mentioning, far enough to leave alone: a name that
// contains one of the keys without folding to it, like "FISTMIC CABLE".
const near = (v) => !targetFor(v) && [...TARGETS.keys()].some((k) => norm(v).includes(k))

const tally = (names) => {
  const out = new Map()
  for (const n of names) out.set(n, (out.get(n) ?? 0) + 1)
  return [...out].sort((a, b) => b[1] - a[1])
}

async function main() {
  const options = (await prisma.appOptions.findUnique({ where: { id: 1 } }))?.data ?? {}

  // 1. What the vocabulary calls these parts today. A key it does not name at
  //    all claims no code, so renaming those records is only ever text.
  const vocabulary = []
  for (const t of options.issueTypes ?? []) for (const n of issueAllNames(t)) if (n) vocabulary.push(n)
  for (const [key, to] of TARGETS) {
    const named = vocabulary.filter((n) => norm(n) === key)
    if (!named.length) console.log(`"${to}": no issue type names it — the records carry it as text and claim no code.`)
    else console.log(`"${to}": ${named.length} issue-type name(s) — ${[...new Set(named)].join(', ')}`)
  }

  // 2. The code map — what the Reference card and the WhatsApp bot say.
  const map = (await prisma.codeMap.findUnique({ where: { id: 1 } }))?.data ?? null
  const mapEdits = []
  const nextMap = map ? { ...map } : null
  for (const [category, entries] of Object.entries(map ?? {})) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue
    const hits = Object.entries(entries).filter(([, n]) => typeof n === 'string' && targetFor(n) && targetFor(n) !== n)
    if (!hits.length) continue
    nextMap[category] = { ...entries }
    for (const [code, was] of hits) {
      nextMap[category][code] = targetFor(was)
      mapEdits.push(`${category} ${code}: "${was}" -> "${targetFor(was)}"`)
    }
  }

  // 3. The option lists: an issue type's own name, its per-device names, and
  //    the materials. Rewritten in the same transaction as the records below,
  //    so a fault never sits on a name its issue type has stopped carrying.
  const optionEdits = []
  const rename = (n) => {
    const to = typeof n === 'string' ? targetFor(n) : null
    if (!to || to === n) return n
    optionEdits.push(`"${n}" -> "${to}"`)
    return to
  }
  const nextIssueTypes = (options.issueTypes ?? []).map((t) => {
    if (typeof t === 'string') return rename(t)
    const out = { ...t, name: rename(t?.name) }
    if (out.names && typeof out.names === 'object' && !Array.isArray(out.names)) {
      out.names = Object.fromEntries(Object.entries(out.names).map(([m, n]) => [m, rename(n)]))
    }
    return out
  })
  const nextMaterials = (options.materials ?? []).map((m) =>
    typeof m === 'string' ? rename(m) : { ...m, name: rename(m?.name) },
  )

  // The check the header promises: after this plan, no issue-type name that
  // folds to one of our keys may be spelled anything but its target. If one
  // survives, the records must not move — they would land on a name the
  // vocabulary no longer carries and lose their code.
  const survivors = []
  for (const t of nextIssueTypes)
    for (const n of issueAllNames(t)) if (targetFor(n) && targetFor(n) !== n) survivors.push(n)
  if (survivors.length) {
    console.log(
      `\nRefusing: these issue-type names would still read differently: ${[...new Set(survivors)].join(', ')}`,
    )
    process.exitCode = 1
    return
  }

  // 4. The records: every saved report, and the entries still on the bench.
  const reports = await prisma.savedReport.findMany({
    select: { id: true, reportId: true, entries: true },
    orderBy: { seq: 'asc' },
  })
  const reportEdits = []
  const spellings = []
  const left = new Set()
  let faultsInReports = 0
  for (const r of reports) {
    let touched = 0
    const entries = (r.entries ?? []).map((e) => ({
      ...e,
      faults: (e.faults ?? []).map((f) => {
        const was = String(f.issue ?? '').trim()
        if (near(was)) left.add(was)
        const to = targetFor(was)
        if (!to || to === was) return f
        touched++
        spellings.push(`"${was}" -> "${to}"`)
        return { ...f, issue: to }
      }),
    }))
    if (touched) {
      faultsInReports += touched
      reportEdits.push({ id: r.id, entries })
    }
  }

  const working = await prisma.fault.findMany({ select: { id: true, issue: true } })
  for (const f of working) if (near(f.issue)) left.add(f.issue)
  const workingEdits = working.map((f) => ({ ...f, to: targetFor(f.issue) })).filter((f) => f.to && f.to !== f.issue)

  console.log(`\nCode map:      ${mapEdits.length} entry(ies)`)
  for (const line of mapEdits) console.log(`   ${line}`)
  console.log(`Option lists:  ${optionEdits.length} name(s)`)
  for (const [line, count] of tally(optionEdits)) console.log(`   ${line}   x${count}`)
  console.log(`Saved reports: ${faultsInReports} fault(s) across ${reportEdits.length} report(s)`)
  for (const [line, count] of tally(spellings)) console.log(`   ${line}   x${count}`)
  console.log(`Working set:   ${workingEdits.length} fault(s)`)
  if (left.size) {
    console.log('\na different part, so left exactly as it is:')
    for (const l of [...left].sort()) console.log(`   ${l}`)
  }

  const total = mapEdits.length + optionEdits.length + faultsInReports + workingEdits.length
  if (!total) {
    console.log(`\nEverything already reads as it should - nothing to change.`)
    return
  }
  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.')
    return
  }

  await prisma.$transaction(
    async (tx) => {
      if (mapEdits.length) await tx.codeMap.update({ where: { id: 1 }, data: { data: nextMap } })
      if (optionEdits.length) {
        await tx.appOptions.update({
          where: { id: 1 },
          data: { data: { ...options, issueTypes: nextIssueTypes, materials: nextMaterials } },
        })
      }
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
