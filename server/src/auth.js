/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Authentication: bcrypt password hashing + a JWT stored in an httpOnly cookie.
 */
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from './db.js'

const SECRET = process.env.JWT_SECRET || 'trc-mms-dev-secret-change-me'
const COOKIE = 'trc_session'
const MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days

export const hashPassword = (pw) => bcrypt.hash(String(pw), 10)
export const verifyPassword = (pw, hash) => bcrypt.compare(String(pw), String(hash || ''))

// Shape a user for the client (never leak the hash).
export const publicUser = (u) => (u ? { id: u.id, username: u.username, role: u.role, branch: u.branch, active: u.active } : null)

export function setSession(res, user) {
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, branch: user.branch }, SECRET, {
    expiresIn: '7d',
  })
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
export async function loadUser(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE]
    if (token) {
      const claims = jwt.verify(token, SECRET)
      const user = await prisma.user.findUnique({ where: { id: claims.id } })
      if (user && user.active) req.user = user
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

// Ensure a starting admin exists (username Amir / password 4645) on boot.
export async function seedAdmin() {
  const admins = await prisma.user.count({ where: { role: 'admin' } })
  if (admins > 0) return
  const existing = await prisma.user.findUnique({ where: { username: 'Amir' } })
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin', active: true } })
    return
  }
  await prisma.user.create({
    data: { username: 'Amir', passwordHash: await hashPassword('4645'), role: 'admin', branch: '' },
  })
  console.log('Seeded default admin: Amir')
}
