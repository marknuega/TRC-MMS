import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { app } from '../src/app.js'
import { prisma } from '../src/db.js'
import { seedAdmin } from '../src/auth.js'

let server
let baseUrl
let cookie = '' // session cookie for the authed data routes

// Like fetch, but carries the session cookie + JSON content-type.
const authFetch = (path, opts = {}) =>
  fetch(`${baseUrl}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) },
  })

before(async () => {
  // Port 0 = let the OS pick a free port, so tests never clash with `npm run dev`.
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${server.address().port}`
  await seedAdmin()
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Amir', password: '4645' }),
  })
  cookie = (res.headers.get('set-cookie') || '').split(';')[0]
})

after(async () => {
  await prisma.$disconnect()
  server.close()
})

describe('health', () => {
  test('GET /health returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`)
    assert.equal(res.status, 200)
    assert.equal((await res.json()).status, 'ok')
  })
})

describe('reports', () => {
  test('requires auth on the data routes', async () => {
    const res = await fetch(`${baseUrl}/api/reports?mode=report`)
    assert.equal(res.status, 401)
  })

  test('rejects a report with missing fields', async () => {
    const res = await authFetch('/api/reports', { method: 'POST', body: JSON.stringify({ author: 'Mark' }) })
    assert.equal(res.status, 400)
  })

  test('creates, lists and deletes a device entry with faults', async () => {
    const created = await authFetch('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        reportDate: '2026-07-20',
        agency: 'PSD',
        type: 'SEPURA',
        model: 'TH1N',
        faults: [{ issue: 'A COVER', action: 'CHANGE', quantity: 1, company: 'MOI' }],
      }),
    }).then((r) => r.json())

    assert.ok(created.id)
    assert.equal(created.model, 'TH1N')
    assert.equal(created.faults.length, 1)
    assert.equal(created.faults[0].issue, 'A COVER')
    assert.ok(created.reportId) // REP-#### assigned

    const list = await authFetch('/api/reports').then((r) => r.json())
    assert.ok(list.some((r) => r.id === created.id))

    const del = await authFetch(`/api/reports/${created.id}`, { method: 'DELETE' })
    assert.equal(del.status, 204)

    const gone = await authFetch(`/api/reports/${created.id}`)
    assert.equal(gone.status, 404)
  })
})

describe('inventory', () => {
  test('creates with derived avail, rejects duplicate SKU, deletes', async () => {
    const sku = `TEST-${Date.now()}`
    const created = await authFetch('/api/inventory', {
      method: 'POST',
      body: JSON.stringify({ sku, begin: 20, out: 15, lowStock: 10 }),
    }).then((r) => r.json())
    assert.equal(created.avail, 5) // begin - out

    const dup = await authFetch('/api/inventory', { method: 'POST', body: JSON.stringify({ sku }) })
    assert.equal(dup.status, 409)

    const del = await authFetch(`/api/inventory/${created.id}`, { method: 'DELETE' })
    assert.equal(del.status, 204)
  })
})
