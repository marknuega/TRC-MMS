/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Authentication: bcrypt password hashing + a JWT stored in an httpOnly cookie.
 */
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'
import { prisma } from './db.js'
// The built-in region map, imported rather than mirrored so this side and the
// toolbar can never disagree about which regions exist or what is in them.
import { DEFAULT_OPTIONS } from '../../client/src/options.js'

// No fallback on purpose. A default secret here is a silent way to hand out
// forgeable admin sessions: anyone who has read this file could sign their own
// token. Fail at boot instead — the same way db.js does for DATABASE_URL.
const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.')
}

const COOKIE = 'trc_session'
const MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days

export const hashPassword = (pw) => bcrypt.hash(String(pw), 10)
export const verifyPassword = (pw, hash) => bcrypt.compare(String(pw), String(hash || ''))

// Shape a user for the client (never leak the hash).
export const publicUser = (u) =>
  u ? { id: u.id, username: u.username, role: u.role, branch: u.branch, region: u.region, active: u.active } : null

export function setSession(res, user) {
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, branch: user.branch, region: user.region },
    SECRET,
    { expiresIn: '7d' },
  )
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
  })
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
}

// Populate req.user from the cookie when present (never rejects).
//
// The region map is resolved here too — the single place every region-scoped
// request picks up which branches a region covers, so no route has to read
// AppOptions for itself and none of them can disagree about the membership:
//
//   director -> req.regionBranches, the one region they run
//   admin    -> req.regions, the whole map, because an admin may VIEW any one
//               region and the branch list for it has to come from the server.
//               A client-supplied list would let the caller name its own
//               membership, which is the whole thing region scoping prevents.
export async function loadUser(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE]
    if (token) {
      const claims = jwt.verify(token, SECRET)
      const user = await prisma.user.findUnique({ where: { id: claims.id } })
      if (user && user.active) {
        req.user = user
        const wantsRegions = user.role === 'admin' || (user.role === 'director' && user.region)
        if (wantsRegions) {
          const opts = await prisma.appOptions.findUnique({ where: { id: 1 } })
          // The same fallback the client applies (mergeOptions spreads the
          // stored map over DEFAULT_OPTIONS.regions), from the same module. An
          // install that has never saved a region map still HAS the four built-in
          // regions, and both sides agree on their membership — a region the
          // toolbar offers but this side had never heard of would resolve to no
          // branches and blank the whole app.
          const stored = opts?.data?.regions
          const regions = { ...DEFAULT_OPTIONS.regions, ...(stored && typeof stored === 'object' ? stored : {}) }
          if (user.role === 'admin') req.regions = regions
          else req.regionBranches = regions[user.region] ?? []
        }
      }
    }
  } catch {
    /* invalid/expired token — treat as anonymous */
  }
  next()
}

export function authRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' })
  next()
}

export function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' })
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  next()
}

// Global admin OR a regional director — used by account-management routes a
// director may also reach. adminRequired above is left untouched for routes
// that must stay admin-exclusive (Manage Inputs/AppOptions, Code Map).
export function adminOrDirectorRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' })
  if (!['admin', 'director'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' })
  next()
}

// Ensure a starting admin exists on boot, so a fresh database is never locked
// out. Does nothing once any admin exists — so this never runs in production
// after the first deploy.
//
// The password is NEVER hardcoded: it comes from SEED_ADMIN_PASSWORD, and if
// that isn't set we generate a random one and print it once. A committed
// default password is a published password.
export async function seedAdmin() {
  const admins = await prisma.user.count({ where: { role: 'admin' } })
  if (admins > 0) return

  const username = process.env.SEED_ADMIN_USERNAME || 'admin'

  // Recovery path: an existing user by that name gets promoted rather than
  // colliding, so a database that lost its last admin can be repaired.
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin', active: true } })
    console.log(`Promoted existing user to admin: ${username}`)
    return
  }

  const generated = !process.env.SEED_ADMIN_PASSWORD
  const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString('base64url')

  await prisma.user.create({
    data: { username, passwordHash: await hashPassword(password), role: 'admin', branch: '' },
  })

  if (generated) {
    // Only appears in the boot log, once. Sign in and change it immediately.
    console.log(`Seeded admin "${username}" with generated password: ${password}`)
    console.log('Sign in and change this password now — it will not be shown again.')
  } else {
    console.log(`Seeded admin: ${username}`)
  }
}
