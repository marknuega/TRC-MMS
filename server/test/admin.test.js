/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * End-to-end coverage for the director account-management tier added to
 * server/src/routes/admin.js — a director can only create/edit/delete plain
 * `user` accounts within their own region, never touch admin/director rows
 * or another region, and can never self-escalate. Admin's own behavior is
 * asserted unchanged alongside it.
 */
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { app } from '../src/app.js'
import { prisma } from '../src/db.js'
import { hashPassword } from '../src/auth.js'

let server
let baseUrl
let adminCookie = ''
let directorCookie = ''
let adminId, directorId
const cleanupUserIds = []

const REGION = `Test Western ${randomBytes(4).toString('hex')}`
const IN_REGION_BRANCH = `TestMakkah-${randomBytes(4).toString('hex')}`
const OUT_OF_REGION_BRANCH = `TestDammam-${randomBytes(4).toString('hex')}`

const asAdmin = (path, opts = {}) =>
  fetch(`${baseUrl}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: adminCookie, ...(opts.headers || {}) } })
const asDirector = (path, opts = {}) =>
  fetch(`${baseUrl}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: directorCookie, ...(opts.headers || {}) } })

async function login(username, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  assert.equal(res.status, 200, `login failed for ${username}`)
  return (res.headers.get('set-cookie') || '').split(';')[0]
}

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${server.address().port}`

  const adminPassword = randomBytes(12).toString('base64url')
  const admin = await prisma.user.create({
    data: { username: `test-admin-${randomBytes(6).toString('hex')}`, passwordHash: await hashPassword(adminPassword), role: 'admin', branch: '' },
  })
  adminId = admin.id
  adminCookie = await login(admin.username, adminPassword)

  // Seed the region this director runs, without disturbing any real AppOptions data.
  const opts = await prisma.appOptions.findUnique({ where: { id: 1 } })
  const data = opts?.data ?? {}
  await prisma.appOptions.upsert({
    where: { id: 1 },
    create: { id: 1, data: { ...data, regions: { ...(data.regions ?? {}), [REGION]: [IN_REGION_BRANCH] } } },
    update: { data: { ...data, regions: { ...(data.regions ?? {}), [REGION]: [IN_REGION_BRANCH] } } },
  })

  const directorPassword = randomBytes(12).toString('base64url')
  const director = await prisma.user.create({
    data: { username: `test-director-${randomBytes(6).toString('hex')}`, passwordHash: await hashPassword(directorPassword), role: 'director', region: REGION, branch: '' },
  })
  directorId = director.id
  directorCookie = await login(director.username, directorPassword)
})

after(async () => {
  for (const id of cleanupUserIds) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.user.delete({ where: { id: directorId } }).catch(() => {})
  await prisma.user.delete({ where: { id: adminId } }).catch(() => {})
  // Un-seed the test region so it never lingers in real AppOptions data.
  const opts = await prisma.appOptions.findUnique({ where: { id: 1 } })
  if (opts?.data?.regions?.[REGION]) {
    const regions = { ...opts.data.regions }
    delete regions[REGION]
    await prisma.appOptions.update({ where: { id: 1 }, data: { data: { ...opts.data, regions } } })
  }
  await prisma.$disconnect()
  server.close()
})

describe('director account management', () => {
  test('can create a user account within their region', async () => {
    const res = await asDirector('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: `dir-created-${randomBytes(4).toString('hex')}`, password: 'x', branch: IN_REGION_BRANCH, role: 'admin' }),
    })
    assert.equal(res.status, 201)
    const created = await res.json()
    cleanupUserIds.push(created.id)
    // role is forced to 'user' server-side even though 'admin' was requested — no escalation via this route.
    assert.equal(created.role, 'user')
    assert.equal(created.branch, IN_REGION_BRANCH)
  })

  test('cannot create an account outside their region', async () => {
    const res = await asDirector('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: `dir-oor-${randomBytes(4).toString('hex')}`, password: 'x', branch: OUT_OF_REGION_BRANCH }),
    })
    assert.equal(res.status, 400)
  })

  test('lists only their own region\'s user accounts (plus themselves)', async () => {
    const res = await asDirector('/api/admin/users')
    assert.equal(res.status, 200)
    const users = await res.json()
    assert.ok(users.every((u) => u.id === directorId || (u.role === 'user' && u.branch === IN_REGION_BRANCH)))
    assert.ok(!users.some((u) => u.id === adminId)) // the global admin is not visible to a director
  })

  test('can edit and delete a user account within their region', async () => {
    const created = await asDirector('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: `dir-edit-${randomBytes(4).toString('hex')}`, password: 'x', branch: IN_REGION_BRANCH }),
    }).then((r) => r.json())

    const edited = await asDirector(`/api/admin/users/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: false }),
    })
    assert.equal(edited.status, 200)
    assert.equal((await edited.json()).active, false)

    const del = await asDirector(`/api/admin/users/${created.id}`, { method: 'DELETE' })
    assert.equal(del.status, 204)
  })

  test('cannot escalate a target account to admin or director', async () => {
    const created = await asDirector('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: `dir-noesc-${randomBytes(4).toString('hex')}`, password: 'x', branch: IN_REGION_BRANCH }),
    }).then((r) => r.json())
    cleanupUserIds.push(created.id)

    const res = await asDirector(`/api/admin/users/${created.id}`, { method: 'PUT', body: JSON.stringify({ role: 'admin' }) })
    assert.equal(res.status, 403)
  })

  test('cannot edit or delete the global admin account', async () => {
    const editRes = await asDirector(`/api/admin/users/${adminId}`, { method: 'PUT', body: JSON.stringify({ active: false }) })
    assert.equal(editRes.status, 403)

    const delRes = await asDirector(`/api/admin/users/${adminId}`, { method: 'DELETE' })
    assert.equal(delRes.status, 403)
  })
})

describe('admin account management (unchanged)', () => {
  test('can create a director account with a region', async () => {
    const res = await asAdmin('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: `admin-mkdir-${randomBytes(4).toString('hex')}`, password: 'x', role: 'director', region: REGION }),
    })
    assert.equal(res.status, 201)
    const created = await res.json()
    cleanupUserIds.push(created.id)
    assert.equal(created.role, 'director')
    assert.equal(created.region, REGION)
    assert.equal(created.branch, '')
  })

  test('sees every account, including the director\'s', async () => {
    const res = await asAdmin('/api/admin/users')
    const users = await res.json()
    assert.ok(users.some((u) => u.id === directorId))
  })
})

// Regression: a director's POST naming a branch outside their region used to
// be silently accepted, tagged branch: '' — an orphaned write, invisible to
// the director who made it (and to any plain user), with no error returned.
// writeBranch() now returns null for this case and every call site must
// reject with 400 instead of writing it. See scope.test.js for the unit-level
// coverage of writeBranch() itself; this exercises the real routes.
describe('data routes reject an out-of-region branch (never orphan a write)', () => {
  let entryId

  test('POST /api/reports with an out-of-region branch is rejected, not silently orphaned', async () => {
    const res = await asDirector('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        branch: OUT_OF_REGION_BRANCH,
        reportDate: '2026-08-15',
        agency: 'PSD',
        type: 'SEPURA',
        model: 'TH1N',
        faults: [{ issue: 'A COVER', action: 'CHANGE', quantity: 1, company: 'MOI' }],
      }),
    })
    assert.equal(res.status, 400)
  })

  test('POST /api/reports with an in-region branch still works normally', async () => {
    const res = await asDirector('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        branch: IN_REGION_BRANCH,
        reportDate: '2026-08-15',
        agency: 'PSD',
        type: 'SEPURA',
        model: 'TH1N',
        faults: [{ issue: 'A COVER', action: 'CHANGE', quantity: 1, company: 'MOI' }],
      }),
    })
    assert.equal(res.status, 201)
    const created = await res.json()
    assert.equal(created.branch, IN_REGION_BRANCH)
    entryId = created.id
  })

  test('POST /api/inventory with an out-of-region branch is rejected', async () => {
    const res = await asDirector('/api/inventory', {
      method: 'POST',
      body: JSON.stringify({ sku: `TEST-OOR-${randomBytes(4).toString('hex')}`, branch: OUT_OF_REGION_BRANCH }),
    })
    assert.equal(res.status, 400)
  })

  test('POST /api/inventory/import with an out-of-region branch is rejected up front, not per-row skipped', async () => {
    const res = await asDirector('/api/inventory/import', {
      method: 'POST',
      body: JSON.stringify({ branch: OUT_OF_REGION_BRANCH, items: [{ sku: `TEST-IMP-${randomBytes(4).toString('hex')}` }] }),
    })
    assert.equal(res.status, 400)
  })

  test('PUT /api/monthly with an out-of-region branch is rejected', async () => {
    const res = await asDirector('/api/monthly', {
      method: 'PUT',
      body: JSON.stringify({ month: '2026-08', branch: OUT_OF_REGION_BRANCH, data: { 1: { counts: {}, description: '' } } }),
    })
    assert.equal(res.status, 400)
  })

  after(async () => {
    if (entryId) await prisma.reportEntry.delete({ where: { id: entryId } }).catch(() => {})
  })
})
