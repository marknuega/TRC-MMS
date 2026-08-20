import { Router } from 'express'
import { prisma } from '../db.js'
import { verifyPassword, setSession, clearSession, publicUser } from '../auth.js'

const router = Router()
const clean = (v) => String(v ?? '').trim()

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const username = clean(req.body?.username)
    const password = String(req.body?.password ?? '')
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' })
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }
    setSession(res, user)
    res.json({ user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSession(res)
  res.json({ ok: true })
})

// GET /api/auth/me - current user (or null). Never 401 so the client can probe.
router.get('/me', (req, res) => {
  // Which build the client is talking to. The offline desktop edition serves
  // this same client from 127.0.0.1 against a database on the same machine, so
  // there is no remote to fall behind and nothing for the sync machinery to
  // mean — and on a PC with no network at all, navigator.onLine is false, which
  // would otherwise brand a perfectly working app "Offline" forever.
  // Absent or 'server' means the normal deployed app.
  res.json({ user: publicUser(req.user), edition: process.env.APP_EDITION || 'server' })
})

// POST /api/auth/request - prospective user asks an admin for credentials (public).
router.post('/request', async (req, res, next) => {
  try {
    const name = clean(req.body?.name)
    if (!name) return res.status(400).json({ error: 'Your name is required' })
    const request = await prisma.credentialRequest.create({
      data: {
        name,
        branch: clean(req.body?.branch),
        contact: clean(req.body?.contact),
        note: clean(req.body?.note),
      },
    })
    res.status(201).json({ ok: true, id: request.id })
  } catch (err) {
    next(err)
  }
})

export default router
