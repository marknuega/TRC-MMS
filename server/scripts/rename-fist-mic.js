/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Rename the fistmic to "Fist Mic", everywhere the older spelling is still
 * written down: the code map, the option lists, the saved reports, and the
 * entries still on the working set.
 *
 * The part has already been renamed in Manage inputs — that is the vocabulary,
 * and the vocabulary is what every new fault will be written as. What is left
 * is everything written BEFORE that: the saved reports still read "Fistmic",
 * and the code map still names 19 that way, so the Code Reference card and the
 * WhatsApp bot go on saying a name the app itself no longer uses.
 *
 * WHY THE VOCABULARY IS CHECKED FIRST, AND THE SCRIPT REFUSES WITHOUT IT: a
 * saved fault claims its parts code by an EXACT name match (claimedPartsCode —
 * exact on purpose, see consolidate-issue-names.js). Renaming a fault onto a
 * name no issue type carries would cost it its code and its shelf, quietly, in
 * every report at once. So the target spelling must be a name the vocabulary
 * already knows before a single record moves.
 *
 * WHAT IS MATCHED is the folded key, through norm() — the same comparison the
 * codes are resolved by. "Fistmic", "FIST MIC" and "fist-mic" are one part
 * under three spellings, and all three land on the one below. A name folding
 * to anything else is a different part: "Fistmic 3D" is reported, not touched.
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

// The one spelling, and the key every other spelling of it folds to.
const TO = 'Fist Mic'
const KEY = norm(TO)

const isIt = (v) => norm(v) === KEY
const near = (v) => !isIt(v) && norm(v).includes(KEY) // "Fistmic 3D" and friends

const tally = (names) => {
  const out = new Map()
  for (const n of names) out.set(n, (out.get(n) ?? 0) + 1)
  return [...out].sort((a, b) => b[1] - a[1])
}

async function main() {
  const options = (await prisma.appOptions.findUnique({ where: { id: 1 } }))?.data ?? {}

  // 1. The vocabulary has to name it, or nothing else may move (see header).
  const vocabulary = []
  for (const t of options.issueTypes ?? []) for (const n of issueAllNames(t)) if (n) vocabulary.push(n)
  const named = vocabulary.filter(isIt)
  if (!named.length) {
    console.log(`No issue type is named "${TO}", or any spelling of it.`)
    console.log('Rename it in Manage inputs -> Issue types first, then run this again.')
    process.exitCode = 1
    return
  }
  console.log(`Vocabulary: ${named.length} issue-type name(s) fold to ${KEY}.`)
  const wrongly = [...new Set(named.filter((n) => n !== TO))]
  if (wrongly.length) console.log(`   still spelled otherwise: ${wrongly.join(', ')}`)

  // 2. The code map — what the Reference card and the WhatsApp bot say.
  const map = (await prisma.codeMap.findUnique({ where: { id: 1 } }))?.data ?? null
  const mapEdits = []
  const nextMap = map ? { ...map } : null
  for (const [category, entries] of Object.entries(map ?? {})) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue
    const hits = Object.entries(entries).filter(([, n]) => typeof n === 'string' && isIt(n) && n !== TO)
    if (!hits.length) continue
    nextMap[category] = { ...entries }
    for (const [code, was] of hits) {
      nextMap[category][code] = TO
      mapEdits.push(`${category} ${code}: "${was}" -> "${TO}"`)
    }
  }

  // 3. The option lists, for any row left on an older spelling — an issue
  //    type's own name, its per-device names, and the materials.
  const optionEdits = []
  const rename = (n) => {
    if (typeof n !== 'string' || !isIt(n) || n === TO) return n
    optionEdits.push(n)
    return TO
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
        if (!isIt(was) || was === TO) return f
        touched++
        spellings.push(was)
        return { ...f, issue: TO }
      }),
    }))
    if (touched) {
      faultsInReports += touched
      reportEdits.push({ id: r.id, entries })
    }
  }

  const working = await prisma.fault.findMany({ select: { id: true, issue: true } })
  for (const f of working) if (near(f.issue)) left.add(f.issue)
  const workingEdits = working.filter((f) => isIt(f.issue) && f.issue !== TO)

  console.log(`\nCode map:      ${mapEdits.length} entry(ies)`)
  for (const line of mapEdits) console.log(`   ${line}`)
  console.log(`Option lists:  ${optionEdits.length} name(s)`)
  for (const [name, count] of tally(optionEdits)) console.log(`   "${name}" -> "${TO}"   x${count}`)
  console.log(`Saved reports: ${faultsInReports} fault(s) across ${reportEdits.length} report(s)`)
  for (const [was, count] of tally(spellings)) console.log(`   "${was}" -> "${TO}"   x${count}`)
  console.log(`Working set:   ${workingEdits.length} fault(s)`)
  if (left.size) {
    console.log('\na different part, so left exactly as it is:')
    for (const l of [...left].sort()) console.log(`   ${l}`)
  }

  const total = mapEdits.length + optionEdits.length + faultsInReports + workingEdits.length
  if (!total) {
    console.log(`\nEverything already reads "${TO}" - nothing to change.`)
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
      for (const f of workingEdits) await tx.fault.update({ where: { id: f.id }, data: { issue: TO } })
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
