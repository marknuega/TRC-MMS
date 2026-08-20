/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Headless check that the packaged server really runs on SQLite.
 *
 * This is the part of the desktop build most likely to break silently — a model
 * that does not translate, a Postgres-only default, a route that never gets
 * exercised until a technician clicks it — and none of it needs a window to
 * test. So it runs the same boot sequence main.js does, against a throwaway
 * database, and drives the real HTTP API.
 *
 *   node scripts/smoke.mjs
 */

import { createServer } from 'node:http'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = dirname(here)
const work = mkdtempSync(join(tmpdir(), 'trc-smoke-'))
const db = join(work, 'trc-mms.db')

copyFileSync(join(desktop, 'app/template.db'), db)

process.env.NODE_ENV = 'production'
process.env.DATABASE_URL = `file:${db}`
// Same SQLite client the packaged app loads — testing against the repo's
// Postgres client would prove nothing about the build being shipped.
process.env.PRISMA_CLIENT_URL = pathToFileURL(join(desktop, 'app/generated/prisma/index.js')).href
process.env.JWT_SECRET = 'smoke-test-secret-not-used-anywhere-real'
process.env.TRUST_PROXY = '0'
process.env.APP_EDITION = 'desktop'
process.env.SEED_ADMIN_USERNAME = 'admin'
process.env.SEED_ADMIN_PASSWORD = 'smoke-test-password'

const src = join(desktop, 'app/server/src')
const { app } = await import(pathToFileURL(join(src, 'app.js')).href)
const { seedAdmin } = await import(pathToFileURL(join(src, 'auth.js')).href)
await seedAdmin()

const server = createServer(app)
const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)))
const base = `http://127.0.0.1:${port}`

let failures = 0
let cookie = ''

async function check(name, fn) {
  try {
    await fn()
    console.log(`  ok    ${name}`)
  } catch (err) {
    failures += 1
    console.log(`  FAIL  ${name}\n        ${err.message}`)
  }
}

const must = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

console.log(`\nTRC-MMS desktop smoke test  (${base})\n`)

await check('health endpoint responds', async () => {
  const res = await fetch(`${base}/health`)
  must(res.ok, `expected 2xx, got ${res.status}`)
})

await check('the built client is served', async () => {
  const res = await fetch(base)
  const html = await res.text()
  must(res.ok, `expected 2xx, got ${res.status}`)
  must(html.includes('<div id="root">'), 'index.html did not contain the React root')
})

await check('API requires a session', async () => {
  const res = await fetch(`${base}/api/reports`)
  must(res.status === 401, `expected 401 for an anonymous read, got ${res.status}`)
})

await check('seeded admin can log in', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'smoke-test-password' }),
  })
  must(res.ok, `login failed with ${res.status}: ${await res.text()}`)
  cookie = (res.headers.get('set-cookie') || '').split(';')[0]
  must(cookie, 'login returned no session cookie')
})

const authed = (path, init = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', cookie, ...init.headers } })

await check('session is accepted', async () => {
  const res = await authed('/api/auth/me')
  const body = await res.json()
  must(res.ok, `expected 2xx, got ${res.status}`)
  must(body.user?.username === 'admin', `expected admin, got ${JSON.stringify(body.user)}`)
})

// The whole standalone UI hinges on this one field: without it the client shows
// a permanent "Offline" badge (navigator.onLine is false on a PC with no
// network) and refuses to drain its queue.
await check('reports itself as the desktop edition', async () => {
  const body = await authed('/api/auth/me').then((r) => r.json())
  must(body.edition === 'desktop', `expected edition "desktop", got ${JSON.stringify(body.edition)}`)
})

// The Json columns are the ones whose SQLite translation was least certain, so
// they get a real round trip rather than a read.
await check('Json column round-trips (options)', async () => {
  const res = await authed('/api/options')
  must(res.ok, `expected 2xx, got ${res.status}`)
  const body = await res.json()
  must(body && typeof body === 'object', 'options did not return an object')
})

await check('Json column round-trips (code map)', async () => {
  const res = await authed('/api/codemap')
  must(res.ok, `expected 2xx, got ${res.status}`)
  const body = await res.json()
  must(body && typeof body === 'object', 'codemap did not return an object')
})

// The reportDate columns are the ones that lost @db.Date, so a write and a read
// back is the check that date-only semantics survived the conversion.
await check('report entry writes and reads back on the right date', async () => {
  const reportDate = '2026-08-20'
  const res = await authed('/api/reports', {
    method: 'POST',
    body: JSON.stringify({
      reportDate,
      type: 'SRG3900',
      model: 'SRG3900',
      technician: 'Smoke Test',
      faults: [{ issue: 'Antenna', qty: 1, action: 'Replace' }],
    }),
  })
  must(res.ok, `create failed with ${res.status}: ${await res.text()}`)

  const list = await authed('/api/reports').then((r) => r.json())
  must(Array.isArray(list), 'reports did not return an array')
  const mine = list.find((e) => e.technician === 'Smoke Test')
  must(mine, 'the entry just created was not returned')
  must(
    String(mine.reportDate).slice(0, 10) === reportDate,
    `date drifted: stored ${mine.reportDate}, expected ${reportDate}`,
  )
})

await check('inventory endpoint responds', async () => {
  const res = await authed('/api/inventory')
  must(res.ok, `expected 2xx, got ${res.status}`)
})

await check('monthly endpoint responds', async () => {
  const res = await authed('/api/monthly?month=2026-08')
  must(res.ok || res.status === 400, `expected 2xx or 400, got ${res.status}`)
})

server.close()

// Windows will not unlink a file that still has an open handle, and Prisma
// keeps one on the SQLite database until it is disconnected explicitly.
const { prisma } = await import(pathToFileURL(join(src, 'db.js')).href)
await prisma.$disconnect()
rmSync(work, { recursive: true, force: true })

console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
