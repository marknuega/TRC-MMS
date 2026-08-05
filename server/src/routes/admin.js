import { Router } from 'express'
import { prisma } from '../db.js'
import { adminRequired, hashPassword, publicUser } from '../auth.js'

const router = Router()
router.use(adminRequired)

const clean = (v) => String(v ?? '').trim()
const normRole = (r) => (clean(r).toLowerCase() === 'admin' ? 'admin' : 'user')

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: [{ role: 'asc' }, { username: 'asc' }] })
    res.json(users.map(publicUser))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/users - create an account.
router.post('/users', async (req, res, next) => {
  try {
    const username = clean(req.body?.username)
    const password = String(req.body?.password ?? '')
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' })
    const role = normRole(req.body?.role)
    const user = await prisma.user.create({
      data: { username, passwordHash: await hashPassword(password), role, branch: clean(req.body?.branch) },
    })
    res.status(201).json(publicUser(user))
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: `Username "${req.body?.username}" already exists` })
    next(err)
  }
})

// PUT /api/admin/users/:id - update (password optional).
router.put('/users/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const data = {}
    if (req.body?.username != null) data.username = clean(req.body.username)
    if (req.body?.role != null) data.role = normRole(req.body.role)
    if (req.body?.branch != null) data.branch = clean(req.body.branch)
    if (req.body?.active != null) data.active = Boolean(req.body.active)
    if (req.body?.password) data.passwordHash = await hashPassword(String(req.body.password))

    // Don't let the last admin lose admin / be deactivated (would lock everyone out).
    if (data.role === 'user' || data.active === false) {
      const target = await prisma.user.findUnique({ where: { id } })
      if (target?.role === 'admin') {
        const admins = await prisma.user.count({ where: { role: 'admin', active: true } })
        if (admins <= 1) return res.status(400).json({ error: 'Cannot demote or disable the only admin' })
      }
    }
    const user = await prisma.user.update({ where: { id }, data })
    res.json(publicUser(user))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' })
    if (err.code === 'P2002') return res.status(409).json({ error: `Username "${req.body?.username}" already exists` })
    next(err)
  }
})

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' })
    const target = await prisma.user.findUnique({ where: { id } })
    if (target?.role === 'admin') {
      const admins = await prisma.user.count({ where: { role: 'admin' } })
      if (admins <= 1) return res.status(400).json({ error: 'Cannot delete the only admin' })
    }
    await prisma.user.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' })
    next(err)
  }
})

// GET /api/admin/requests - credential requests, newest first.
router.get('/requests', async (req, res, next) => {
  try {
    res.json(await prisma.credentialRequest.findMany({ orderBy: { id: 'desc' } }))
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/requests/:id - set status (pending | approved | rejected).
router.put('/requests/:id', async (req, res, next) => {
  try {
    const status = clean(req.body?.status).toLowerCase()
    if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Bad status' })
    const request = await prisma.credentialRequest.update({ where: { id: Number(req.params.id) }, data: { status } })
    res.json(request)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Request not found' })
    next(err)
  }
})

// DELETE /api/admin/requests/:id
router.delete('/requests/:id', async (req, res, next) => {
  try {
    await prisma.credentialRequest.delete({ where: { id: Number(req.params.id) } })
    res.status(204).end()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Request not found' })
    next(err)
  }
})

export default router
