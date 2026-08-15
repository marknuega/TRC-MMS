import { Router } from 'express'
import { prisma } from '../db.js'
import { adminOrDirectorRequired, hashPassword, publicUser } from '../auth.js'
import { isDirector } from '../scope.js'

const router = Router()
router.use(adminOrDirectorRequired)

const clean = (v) => String(v ?? '').trim()
const normRole = (r) => {
  const v = clean(r).toLowerCase()
  return v === 'admin' || v === 'director' ? v : 'user'
}

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const where = isDirector(req)
      ? { OR: [{ role: 'user', branch: { in: req.regionBranches || [] } }, { id: req.user.id }] }
      : {}
    const users = await prisma.user.findMany({ where, orderBy: [{ role: 'asc' }, { username: 'asc' }] })
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

    if (isDirector(req)) {
      const branch = clean(req.body?.branch)
      if (!branch || !(req.regionBranches || []).includes(branch)) {
        return res.status(400).json({ error: 'Branch must be within your region' })
      }
      const user = await prisma.user.create({
        data: { username, passwordHash: await hashPassword(password), role: 'user', branch, region: '' },
      })
      return res.status(201).json(publicUser(user))
    }

    const role = normRole(req.body?.role)
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        role,
        branch: role === 'director' ? '' : clean(req.body?.branch),
        region: role === 'director' ? clean(req.body?.region) : '',
      },
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
    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'User not found' })

    if (isDirector(req)) {
      if (existing.role !== 'user' || !(req.regionBranches || []).includes(existing.branch)) {
        return res.status(403).json({ error: 'Admin only' })
      }
      if (req.body?.role != null && normRole(req.body.role) !== 'user') {
        return res.status(403).json({ error: 'Cannot change role' })
      }
      const data = {}
      if (req.body?.username != null) data.username = clean(req.body.username)
      if (req.body?.branch != null) {
        const branch = clean(req.body.branch)
        if (!branch || !(req.regionBranches || []).includes(branch)) {
          return res.status(400).json({ error: 'Branch must be within your region' })
        }
        data.branch = branch
      }
      if (req.body?.active != null) data.active = Boolean(req.body.active)
      if (req.body?.password) data.passwordHash = await hashPassword(String(req.body.password))
      const user = await prisma.user.update({ where: { id }, data })
      return res.json(publicUser(user))
    }

    const data = {}
    if (req.body?.username != null) data.username = clean(req.body.username)
    if (req.body?.role != null) data.role = normRole(req.body.role)
    if (req.body?.branch != null) data.branch = clean(req.body.branch)
    if (req.body?.region != null) data.region = clean(req.body.region)
    if (req.body?.active != null) data.active = Boolean(req.body.active)
    if (req.body?.password) data.passwordHash = await hashPassword(String(req.body.password))
    if (data.role === 'director') {
      data.branch = ''
    } else if (data.role === 'user' || data.role === 'admin') {
      data.region = ''
    }

    // Don't let the last admin lose admin / be deactivated (would lock everyone out).
    if (data.role === 'user' || data.role === 'director' || data.active === false) {
      if (existing.role === 'admin') {
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
    if (!target) return res.status(404).json({ error: 'User not found' })

    if (isDirector(req)) {
      if (target.role !== 'user' || !(req.regionBranches || []).includes(target.branch)) {
        return res.status(403).json({ error: 'Admin only' })
      }
    } else if (target.role === 'admin') {
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
    const where = isDirector(req) ? { branch: { in: req.regionBranches || [] } } : {}
    res.json(await prisma.credentialRequest.findMany({ where, orderBy: { id: 'desc' } }))
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/requests/:id - set status (pending | approved | rejected).
router.put('/requests/:id', async (req, res, next) => {
  try {
    const status = clean(req.body?.status).toLowerCase()
    if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Bad status' })
    const id = Number(req.params.id)
    if (isDirector(req)) {
      const existing = await prisma.credentialRequest.findUnique({ where: { id } })
      if (!existing) return res.status(404).json({ error: 'Request not found' })
      if (!(req.regionBranches || []).includes(existing.branch)) return res.status(403).json({ error: 'Admin only' })
    }
    const request = await prisma.credentialRequest.update({ where: { id }, data: { status } })
    res.json(request)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Request not found' })
    next(err)
  }
})

// DELETE /api/admin/requests/:id
router.delete('/requests/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (isDirector(req)) {
      const existing = await prisma.credentialRequest.findUnique({ where: { id } })
      if (!existing) return res.status(404).json({ error: 'Request not found' })
      if (!(req.regionBranches || []).includes(existing.branch)) return res.status(403).json({ error: 'Admin only' })
    }
    await prisma.credentialRequest.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Request not found' })
    next(err)
  }
})

export default router
