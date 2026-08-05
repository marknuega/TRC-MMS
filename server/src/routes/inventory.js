import { Router } from 'express'
import { prisma } from '../db.js'

const router = Router()

const clean = (v) => String(v ?? '').trim()
const int = (v) => Math.trunc(Number(v)) || 0

// Shape an item for the client (adds derived avail).
const shape = (i) => ({ ...i, avail: i.begin - i.out })

function parseItem(body) {
  const sku = clean(body?.sku)
  if (!sku) return { error: 'SKU is required' }
  return {
    data: {
      sku,
      store: clean(body?.store),
      shelf: clean(body?.shelf),
      itemCode: clean(body?.itemCode),
      begin: Math.max(0, int(body?.begin)),
      out: Math.max(0, int(body?.out)),
      lowStock: Math.max(0, int(body?.lowStock)),
      remarks: clean(body?.remarks),
    },
  }
}

// GET /api/inventory - all items (client filters/searches).
router.get('/', async (req, res, next) => {
  try {
    const items = await prisma.inventoryItem.findMany({ orderBy: [{ store: 'asc' }, { sku: 'asc' }] })
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
    const txns = await prisma.inventoryTxn.findMany({
      where: { itemId: Number(req.params.id) },
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
    const id = Number(req.params.id)
    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.inventoryItem.findUnique({ where: { id } })
      if (!before) {
        const e = new Error('Item not found')
        e.code = 'P2025'
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
          },
        })
      }
      return updated
    })
    res.json(shape(item))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found' })
    if (err.code === 'P2002') return res.status(409).json({ error: `SKU "${req.body?.sku}" already exists` })
    next(err)
  }
})

// DELETE /api/inventory/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.inventoryItem.delete({ where: { id: Number(req.params.id) } })
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
    let created = 0
    let updated = 0
    let skipped = 0
    for (const row of rows) {
      const { data, error } = parseItem(row)
      if (error) {
        skipped += 1
        continue
      }
      const existing = await prisma.inventoryItem.findUnique({ where: { sku: data.sku } })
      if (existing) {
        await prisma.inventoryItem.update({ where: { sku: data.sku }, data })
        updated += 1
      } else {
        await prisma.inventoryItem.create({ data })
        created += 1
      }
    }
    res.json({ created, updated, skipped, total: rows.length })
  } catch (err) {
    next(err)
  }
})

export default router
