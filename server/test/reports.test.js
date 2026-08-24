import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { app } from '../src/app.js'
import { prisma } from '../src/db.js'
import { hashPassword } from '../src/auth.js'

let server
let baseUrl
let cookie = '' // session cookie for the authed data routes
let testUserId

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
  // The tests own their admin instead of leaning on seedAdmin(), which no-ops
  // as soon as any admin exists — so seeding would silently skip on every real
  // database and every authed request below would 401. Password is random per
  // run and never leaves this process, so there is nothing to hardcode.
  const password = randomBytes(12).toString('base64url')
  const user = await prisma.user.create({
    data: {
      username: `test-admin-${randomBytes(6).toString('hex')}`,
      passwordHash: await hashPassword(password),
      role: 'admin',
      branch: '',
    },
  })
  testUserId = user.id

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password }),
  })
  assert.equal(res.status, 200, 'test admin login failed — the authed tests cannot run')
  cookie = (res.headers.get('set-cookie') || '').split(';')[0]
})

after(async () => {
  if (testUserId) await prisma.user.delete({ where: { id: testUserId } })
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

  // The Model Code is what makes "Speaker (45A)" on a Carkit a different shelf
  // from the same words on a TH1n. These guard the two ways it can be set to
  // something that would look right and draw nothing.
  describe('Model Code', () => {
    const branch = `TEST-${randomBytes(4).toString('hex')}`
    const post = (body) => authFetch('/api/inventory', { method: 'POST', body: JSON.stringify(body) })

    after(async () => {
      await prisma.inventoryTxn.deleteMany({ where: { branch } })
      await prisma.inventoryItem.deleteMany({ where: { branch } })
    })

    test('refuses a code that is neither form', async () => {
      const res = await post({ sku: `${branch}-A`, pairCode: '45A', branch })
      assert.equal(res.status, 400) // no model in front of it
      assert.match((await res.json()).error, /Model Code/)
    })

    // An item coded ahead of its vocabulary is stocked, listed, and drawn on by
    // nothing — a fault only resolves to C45A once an Issue type says what 45A
    // is. Caught here, where someone is looking at the form.
    test('refuses a parts code no Issue type claims', async () => {
      const res = await post({ sku: `${branch}-B`, pairCode: 'H77A', branch })
      assert.equal(res.status, 400)
      assert.match((await res.json()).error, /no Issue type claims/)
    })

    // Being unclaimed is the whole reason the provisional form exists.
    test('accepts the provisional form for a part with no code', async () => {
      const res = await post({
        sku: `${branch}-C`,
        pairCode: 'M:CUR3 Display for TMR880i - HT10280AA',
        branch,
      })
      assert.equal(res.status, 201)
      // Stored upper-cased and whitespace-collapsed, so one shelf is one code
      // however the name was typed.
      assert.equal((await res.json()).pairCode, 'M:CUR3 DISPLAY FOR TMR880I - HT10280AA')
    })

    test('refuses a code another item in the branch already holds', async () => {
      const res = await post({ sku: `${branch}-D`, pairCode: 'M:CUR3 DISPLAY FOR TMR880I - HT10280AA', branch })
      assert.equal(res.status, 409)
      assert.match((await res.json()).error, new RegExp(`${branch}-C`))
    })
  })
})
