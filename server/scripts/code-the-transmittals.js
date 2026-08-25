/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Give the transmittal materials real codes, the same shape as a fault code.
 *
 * A transmittal moves stock and deducts it exactly as a daily report does
 * (applyInventoryUsage runs for both), but its entries carry model "-", so
 * pairCodeForFault answers '' and every item falls through to matching on its
 * NAME alone. The materials list also spells several parts differently from
 * the fault vocabulary — "UI Frame" against "UIFrame", "Side Grip" against
 * "Sidegrip", "Fuse 10" against "Fuse10" — so the same physical part counts as
 * two separate lines depending on which door it came through.
 *
 * The list turned out to hold three different kinds of thing, and they are not
 * fixed the same way:
 *
 *   1. DEVICE PARTS that already have a fault code and are merely spelled
 *      differently. These get the vocabulary's own spelling and the model they
 *      belong to, so a Speaker82 moved on a transmittal and one fitted on a
 *      bench are one item on one line: H45B either way.
 *
 *   2. STORE ITEMS belonging to no device at all — solder, tape, glue, screws,
 *      office paper. A code is [device letter][parts][variant] and there was no
 *      letter to put in front of these, so they had none. G is added for the
 *      general stores and they are numbered in the free 80s block, which keeps
 *      one code shape across the whole system: the WhatsApp decoder, the
 *      reports and the reference card all read G82A the way they read H99A.
 *
 *   3. Items belonging to a device that had no code yet — the STP9000 antenna,
 *      the Carkit data cable, a whole STP9000 terminal. These code under their
 *      OWN device letter, not under G: an STP9000 antenna is a Sepura part that
 *      happens to be in the store, not a store item.
 *
 * The model is set per ENTRY, which is exact here because every transmittal
 * entry holds precisely one item (66 of 66 — checked before this was written).
 *
 * SAFE FOR PAST STOCK. The ledger rows recorded what was actually deducted at
 * the time and are untouched. This changes what a code says an item IS, not
 * what any past movement did.
 *
 * DRY RUN BY DEFAULT:
 *   cd server && node --env-file=.env scripts/code-the-transmittals.js
 * Add --apply to write:
 *   cd server && node --env-file=.env scripts/code-the-transmittals.js --apply
 */
import { prisma } from '../src/db.js'
import { norm } from '../../client/src/pairCode.js'
import { issueName, issueCode } from '../../client/src/options.js'

const APPLY = process.argv.includes('--apply')

// The stores are a "device" only in the sense that a code needs a letter in
// front of it. Spelled with a leading word because deviceLetterFor reads the
// FIRST word of a label as the brand and the rest as the model (modelHalf), so
// "TRC General Stores" is what makes the model "General Stores" resolve to G.
const STORES_LETTER = 'G'
const STORES_LABEL = 'TRC General Stores'
const STORES_MODEL = 'General Stores'

// Free numbers in the 80s, one per family.
const COMPONENTS = {
  80: 'Adhesive & Solvent',
  81: 'Tape',
  82: 'Solder',
  83: 'Screws',
  84: 'Lugs',
  85: 'RG58 Connector',
  86: 'Office Supplies',
  87: 'Complete Unit',
  88: 'Wire Kit',
}

// Group 2 + 3: what had no code at all. `models` is what puts the letter in
// front — General Stores gives G, STP9000 gives T, and so on.
const NEW_TYPES = [
  { name: 'Super Glue', parts: '80', variant: 'A', models: [STORES_MODEL] },
  { name: 'Laquer Thinner', parts: '80', variant: 'B', models: [STORES_MODEL] },
  { name: 'WD40', parts: '80', variant: 'C', models: [STORES_MODEL] },
  { name: 'Electric Tape', parts: '81', variant: 'A', models: [STORES_MODEL] },
  { name: 'Solder Lead', parts: '82', variant: 'A', models: [STORES_MODEL] },
  { name: 'ScrewA', parts: '83', variant: 'A', models: [STORES_MODEL] },
  { name: 'ScrewB', parts: '83', variant: 'B', models: [STORES_MODEL] },
  { name: 'ScrewC', parts: '83', variant: 'C', models: [STORES_MODEL] },
  { name: 'Lugs', parts: '84', variant: 'A', models: [STORES_MODEL] },
  { name: 'BNC', parts: '85', variant: 'A', models: [STORES_MODEL] },
  { name: 'A4 Paper (500pcs/RIM)', parts: '86', variant: 'A', models: [STORES_MODEL] },
  // Group 3 — a device's own part, so a device's own letter.
  { name: 'AntennaSTP', parts: '10', variant: 'S', models: ['STP9000'] },
  { name: 'Data Cable/LCD Cable', parts: '20', variant: 'E', models: ['SRG3900 CARKIT'] },
  { name: 'STP9000 Terminal', parts: '87', variant: 'A', models: ['STP9000'] },
  { name: '2 Wire Kit RAC Sepura', parts: '88', variant: 'A', models: ['SRG3900 CARKIT'] },
]

// Group 1 + 3: item as written on a transmittal -> the name it should carry
// and the model whose letter belongs in front of its code.
const ITEMS = [
  { from: 'Speaker82', to: 'Speaker82', model: 'TH1N' },
  { from: 'UI Frame', to: 'UIFrame', model: 'TH1N' },
  { from: 'Side Grip', to: 'Sidegrip', model: 'TH1N' },
  { from: 'Side Grip 3D', to: 'Sidegrip3D', model: 'TH1N' },
  { from: 'PCB', to: 'PCB', model: 'TH1N' },
  { from: 'Hand-Micro Loud Speaker', to: 'Hand-MicroLoudSpeaker', model: 'TH1N' },
  { from: 'Fuse 10', to: 'Fuse10', model: 'SRG3900 CARKIT' },
  { from: 'Antenna Cable', to: 'Antenna Cable', model: 'SRG3900 CARKIT' },
  { from: 'Power Cable', to: 'Power Cable', model: 'SRG3900 CARKIT' },
  { from: 'AntennaSTP', to: 'AntennaSTP', model: 'STP9000' },
  { from: 'Data Cable/LCD Cable', to: 'Data Cable/LCD Cable', model: 'SRG3900 CARKIT' },
  { from: 'STP9000', to: 'STP9000 Terminal', model: 'STP9000' },
  { from: '2 WIRE KIT RAC VERSION SEPURA - 300-00755', to: '2 Wire Kit RAC Sepura', model: 'SRG3900 CARKIT' },
  // Group 2 — the store items, which take the stores model.
  { from: 'Super Glue', to: 'Super Glue', model: STORES_MODEL },
  { from: 'Laquer Thinner', to: 'Laquer Thinner', model: STORES_MODEL },
  { from: 'WD40', to: 'WD40', model: STORES_MODEL },
  { from: 'Electric Tape', to: 'Electric Tape', model: STORES_MODEL },
  { from: 'Solder Lead', to: 'Solder Lead', model: STORES_MODEL },
  { from: 'ScrewA', to: 'ScrewA', model: STORES_MODEL },
  { from: 'ScrewB', to: 'ScrewB', model: STORES_MODEL },
  { from: 'ScrewC', to: 'ScrewC', model: STORES_MODEL },
  { from: 'Lugs', to: 'Lugs', model: STORES_MODEL },
  { from: 'BNC', to: 'BNC', model: STORES_MODEL },
  { from: 'A4 Paper (500pcs/RIM)', to: 'A4 Paper (500pcs/RIM)', model: STORES_MODEL },
]
const BY_NAME = new Map(ITEMS.map((i) => [norm(i.from), i]))

async function main() {
  const optRow = await prisma.appOptions.findUnique({ where: { id: 1 } })
  const data = optRow?.data ?? {}
  const mapRow = await prisma.codeMap.findUnique({ where: { id: 1 } })
  const map = mapRow?.data ?? {}

  // ---- 1. the stores letter and the component names ----------------------
  const equip = { ...(map.equipmentCodes ?? {}) }
  const held = equip[STORES_LETTER]
  if (held && held !== STORES_LABEL) {
    console.log(`FAILED: letter ${STORES_LETTER} is already ${held}. Nothing written.`)
    process.exitCode = 1
    return
  }
  const addingLetter = !held
  const comps = { ...(map.components ?? {}) }
  const addingComps = Object.entries(COMPONENTS).filter(([n]) => !comps[n])
  for (const [n, label] of addingComps) comps[n] = label
  if (addingLetter) equip[STORES_LETTER] = STORES_LABEL

  console.log(
    addingLetter ? `device letter to add: ${STORES_LETTER} = ${STORES_LABEL}` : 'device letter already present',
  )
  console.log(`components to add: ${addingComps.map(([n, l]) => `${n} ${l}`).join(', ') || 'none'}`)

  // ---- 2. the stores model -----------------------------------------------
  const models = [...(data.models ?? [])]
  const hasStores = models.some((m) => norm(typeof m === 'object' ? m?.name : m) === norm(STORES_MODEL))
  if (!hasStores) models.push({ name: STORES_MODEL, prefixes: [] })
  console.log(hasStores ? 'model already present' : `model to add: ${STORES_MODEL}`)

  // ---- 3. the issue types -------------------------------------------------
  const types = [...(data.issueTypes ?? [])]
  const claimed = new Map()
  for (const t of types) {
    const c = issueCode(t)
    if (c) claimed.set(c, issueName(t))
  }
  const adding = []
  for (const t of NEW_TYPES) {
    const code = `${t.parts}${t.variant}`
    const owner = claimed.get(code)
    // A code means one part to every reader of it, so a clash is refused.
    if (owner && norm(owner) !== norm(t.name)) {
      console.log(`FAILED: ${code} is already ${owner}, wanted for ${t.name}. Nothing written.`)
      process.exitCode = 1
      return
    }
    if (types.some((x) => norm(issueName(x)) === norm(t.name))) continue
    adding.push(t)
  }
  console.log(`\nissue types to add: ${adding.length}`)
  for (const t of adding) console.log(`   ${t.parts}${t.variant}  ${t.name.padEnd(28)} ${t.models.join(', ')}`)

  // ---- 4. the materials list spellings ------------------------------------
  const mats = [...(data.materials ?? [])]
  const matEdits = []
  const materials = mats.map((m) => {
    const name = typeof m === 'object' ? m?.name : m
    const hit = BY_NAME.get(norm(name))
    if (!hit || hit.to === name) return m
    matEdits.push(`${name}  ->  ${hit.to}`)
    return typeof m === 'object' ? { ...m, name: hit.to } : hit.to
  })
  console.log(`\nmaterials-list spellings to correct: ${matEdits.length}`)
  for (const e of matEdits) console.log(`   ${e}`)

  // ---- 5. the transmittal entries -----------------------------------------
  const reports = await prisma.savedReport.findMany({
    where: { mode: 'transmittal' },
    select: { id: true, reportId: true, entries: true },
    orderBy: { seq: 'asc' },
  })
  const edits = []
  const tally = new Map()
  const unknown = new Set()
  for (const r of reports) {
    let touched = 0
    const entries = (r.entries ?? []).map((e) => {
      const faults = e.faults ?? []
      // One item per entry, which is what lets the model be set per entry.
      const hit = faults.length === 1 ? BY_NAME.get(norm(faults[0].issue)) : null
      if (!hit) {
        for (const f of faults) if (!BY_NAME.get(norm(f.issue))) unknown.add(String(f.issue ?? '').trim())
        return e
      }
      const renamed = hit.to !== faults[0].issue
      const remodelled = e.model !== hit.model
      if (!renamed && !remodelled) return e
      touched++
      tally.set(
        `${faults[0].issue}  ->  ${hit.to}   model ${e.model} -> ${hit.model}`,
        (tally.get(`${faults[0].issue}  ->  ${hit.to}   model ${e.model} -> ${hit.model}`) ?? 0) + 1,
      )
      return { ...e, model: hit.model, faults: [{ ...faults[0], issue: hit.to }] }
    })
    if (touched) edits.push({ id: r.id, entries })
  }

  const n = [...tally.values()].reduce((a, b) => a + b, 0)
  console.log(`\ntransmittal entries to recode: ${n} across ${edits.length} report(s)`)
  for (const [line, c] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`   ${line}   x${c}`)
  if (unknown.size) {
    console.log('\nNOT in the mapping, left exactly as they are:')
    for (const u of unknown) console.log(`   ${u}`)
  }

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply.')
    return
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.codeMap.upsert({
        where: { id: 1 },
        create: { id: 1, data: { ...map, equipmentCodes: equip, components: comps } },
        update: { data: { ...map, equipmentCodes: equip, components: comps } },
      })
      const nextOptions = { ...data, models, issueTypes: [...types, ...adding], materials }
      await tx.appOptions.upsert({
        where: { id: 1 },
        create: { id: 1, data: nextOptions },
        update: { data: nextOptions },
      })
      for (const e of edits) await tx.savedReport.update({ where: { id: e.id }, data: { entries: e.entries } })
    },
    { timeout: 5 * 60 * 1000, maxWait: 30 * 1000 },
  )
  console.log(`\nDone. ${adding.length} issue type(s), ${matEdits.length} spelling(s), ${n} transmittal entr(ies).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
