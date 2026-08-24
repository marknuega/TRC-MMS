import { Router } from 'express'
import { prisma } from '../db.js'
import { branchWhere, writeBranch, canAccessBranch } from '../scope.js'
// The Model+Parts pair code an item is held by — the same helpers the save
// path resolves faults through, so a code that lists here is a code that
// looks up there. See client/src/pairCode.js.
import { normalizePairCode, parsePairCode } from '../../../client/src/pairCode.js'
import { issueCodeIndex, mergeOptions } from '../../../client/src/options.js'

const router = Router()

const clean = (v) => String(v ?? '').trim()
const int = (v) => Math.trunc(Number(v)) || 0

// Shape an item for the client (adds derived avail).
const shape = (i) => ({ ...i, avail: i.begin - i.out })

/**
 * The Model Code as it should be stored, or an error naming both forms.
 *
 * Blank is allowed and means SHARED — an item every model draws from, matched
 * by its name the way the whole store was before pair codes existed. Most of
 * the shelf genuinely is shared, so this must stay the easy default rather than
 * something to be filled in with a guess.
 *
 * Anything else must be one of the two real forms, because a code that is
 * neither would silently never match a fault: the item would look coded and
 * draw nothing, which is worse than being left blank.
 */
function parsePairCodeField(value) {
  const raw = clean(value)
  if (!raw) return { value: '' }
  const parsed = parsePairCode(raw)
  if (!parsed) {
    return {
      error:
        `"${raw}" is not a Model Code. Use the device letter with a parts code (C45A), ` +
        `or the device letter, a colon and the item name (M:CUR3 DISPLAY FOR TMR880I - HT10280AA).`,
    }
  }
  return { value: normalizePairCode(raw) }
}

function parseItem(body) {
  const sku = clean(body?.sku)
  if (!sku) return { error: 'SKU is required' }
  const pair = parsePairCodeField(body?.pairCode)
  if (pair.error) return { error: pair.error }
  return {
    data: {
      sku,
      store: clean(body?.store),
      roomId: clean(body?.roomId),
      shelf: clean(body?.shelf),
      itemCode: clean(body?.itemCode),
      description: clean(body?.description),
      alias: clean(body?.alias),
      pairCode: pair.value,
      begin: Math.max(0, int(body?.begin)),
      out: Math.max(0, int(body?.out)),
      lowStock: Math.max(0, int(body?.lowStock)),
      remarks: clean(body?.remarks),
    },
  }
}

/**
 * Which parts codes the vocabulary currently means something by.
 *
 * A Model Code in the real form is a device letter in front of a parts code,
 * and a parts code only exists because an Issue type claims it. Read once per
 * request rather than per row, so a bulk import costs one query.
 */
async function claimedCodes() {
  const row = await prisma.appOptions.findUnique({ where: { id: 1 } })
  return issueCodeIndex(mergeOptions(row?.data ?? {}).issueTypes)
}

/**
 * Refuse a real-form Model Code whose parts code nothing claims.
 *
 * Without this the item is stocked, listed, and drawn on by nothing: a fault
 * only ever resolves to C45A if some Issue type says what 45A IS, so an item
 * coded ahead of its vocabulary sits there looking correct while every save
 * walks past it to the shared shelf. Failing here, where someone is looking at
 * the form, is the only place it can be noticed.
 *
 * The provisional form needs no claim — being unclaimed is the whole reason it
 * exists.
 */
function unclaimedPartsCode(pairCode, claimed) {
  const parsed = parsePairCode(pairCode)
  if (!parsed || parsed.provisional) return null
  return claimed[parsed.part] ? null : parsed
}

const unclaimedError = ({ letter, part }) =>
  `Model Code ${letter}${part} names the parts code ${part}, which no Issue type claims yet. ` +
  `Either claim it under Manage inputs → Issue types, or clear this field and pick the Model instead — ` +
  `that holds the item by its own name until the name is given a code.`

/**
 * Refuse a Model Code already held by another item in the same branch.
 *
 * Checked here rather than by a unique index: a shared item's code is '', not
 * NULL, so an index would collide on every one of them. Two items under one
 * code is exactly the ambiguity the save path refuses — better to catch it
 * while someone is looking at the form than at the moment stock moves.
 */
async function pairCodeTaken(db, pairCode, branch, exceptId) {
  if (!pairCode) return null
  const clash = await db.inventoryItem.findFirst({
    where: {
      pairCode,
      branch: branch ?? '',
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  })
  return clash
}

// GET /api/inventory - items for the user's branch (non-admin) or all/one (admin).
router.get('/', async (req, res, next) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      where: branchWhere(req, req.query.branch, req.query.region),
      orderBy: [{ store: 'asc' }, { sku: 'asc' }],
    })
    res.json(items.map(shape))
  } catch (err) {
    next(err)
  }
})

// POST /api/inventory - create one.
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = parseItem(req.body)
    if (error) return res.status(400).json({ error })
    data.branch = writeBranch(req, req.body?.branch)
    if (data.branch === null) return res.status(400).json({ error: 'That branch is outside your region' })
    const unclaimed = unclaimedPartsCode(data.pairCode, await claimedCodes())
    if (unclaimed) return res.status(400).json({ error: unclaimedError(unclaimed) })
    const clash = await pairCodeTaken(prisma, data.pairCode, data.branch)
    if (clash) {
      return res.status(409).json({ error: `Model Code ${data.pairCode} is already ${clash.sku}` })
    }
    const item = await prisma.inventoryItem.create({ data })
    res.status(201).json(shape(item))
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: `SKU "${req.body?.sku}" already exists` })
    next(err)
  }
})

// GET /api/inventory/:id/transactions - ledger for one item, newest first.
router.get('/:id/transactions', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const item = await prisma.inventoryItem.findUnique({ where: { id } })
    if (!item) return res.status(404).json({ error: 'Item not found' })
    if (!canAccessBranch(req, item.branch)) return res.status(404).json({ error: 'Item not found' })
    const txns = await prisma.inventoryTxn.findMany({
      where: { itemId: id },
      orderBy: { id: 'desc' },
    })
    res.json(txns)
  } catch (err) {
    next(err)
  }
})

// PUT /api/inventory/:id - update one (logs an adjustment if avail changes).
router.put('/:id', async (req, res, next) => {
  try {
    const { data, error } = parseItem(req.body)
    if (error) return res.status(400).json({ error })
    const unclaimed = unclaimedPartsCode(data.pairCode, await claimedCodes())
    if (unclaimed) return res.status(400).json({ error: unclaimedError(unclaimed) })
    const id = Number(req.params.id)
    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.inventoryItem.findUnique({ where: { id } })
      if (!before || !canAccessBranch(req, before.branch)) {
        const e = new Error('Item not found')
        e.code = 'P2025'
        throw e
      }
      const clash = await pairCodeTaken(tx, data.pairCode, before.branch, id)
      if (clash) {
        const e = new Error(`Model Code ${data.pairCode} is already ${clash.sku}`)
        e.status = 409
        throw e
      }
      const updated = await tx.inventoryItem.update({ where: { id }, data })
      const oldAvail = before.begin - before.out
      const newAvail = updated.begin - updated.out
      if (newAvail !== oldAvail) {
        await tx.inventoryTxn.create({
          data: {
            itemId: id,
            sku: updated.sku,
            type: 'adjustment',
            change: newAvail - oldAvail,
            availAfter: newAvail,
            reference: 'Manual edit',
            material: updated.itemCode,
            pairCode: updated.pairCode,
          },
        })
      }
      return updated
    })
    res.json(shape(item))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found' })
    if (err.code === 'P2002') return res.status(409).json({ error: `SKU "${req.body?.sku}" already exists` })
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// DELETE /api/inventory/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const item = await prisma.inventoryItem.findUnique({ where: { id } })
    if (!item || !canAccessBranch(req, item.branch)) return res.status(404).json({ error: 'Item not found' })
    await prisma.inventoryItem.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found' })
    next(err)
  }
})

// POST /api/inventory/import - bulk upsert by SKU. Body: { items: [...] }.
router.post('/import', async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.items) ? req.body.items : []
    const branch = writeBranch(req, req.body?.branch)
    if (branch === null) return res.status(400).json({ error: 'That branch is outside your region' })
    let created = 0
    let updated = 0
    let skipped = 0
    const claimed = await claimedCodes()
    for (const row of rows) {
      const { data, error } = parseItem(row)
      if (error) {
        skipped += 1
        continue
      }
      // Same rule as the form, applied quietly: a coded row whose parts code
      // nothing claims would import as stock nothing can draw.
      if (unclaimedPartsCode(data.pairCode, claimed)) {
        skipped += 1
        continue
      }
      const existing = await prisma.inventoryItem.findUnique({ where: { sku: data.sku } })
      if (existing) {
        // Can't touch another branch's item (SKU is global-unique).
        if (!canAccessBranch(req, existing.branch)) {
          skipped += 1
          continue
        }
        // A Model Code already held by a different item is skipped rather than
        // duplicated: a bulk paste must not be able to create the ambiguity
        // that stops every later save.
        if (await pairCodeTaken(prisma, data.pairCode, existing.branch, existing.id)) {
          skipped += 1
          continue
        }
        await prisma.inventoryItem.update({ where: { sku: data.sku }, data })
        updated += 1
      } else {
        if (await pairCodeTaken(prisma, data.pairCode, branch)) {
          skipped += 1
          continue
        }
        await prisma.inventoryItem.create({ data: { ...data, branch } })
        created += 1
      }
    }
    res.json({ created, updated, skipped, total: rows.length })
  } catch (err) {
    next(err)
  }
})

export default router
