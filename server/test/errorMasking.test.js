/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The error handler in src/app.js, exercised through the REAL app.
 *
 * A deployed server must never hand a stranger an error message. The desktop
 * build must always hand one over: it listens on 127.0.0.1, only the person at
 * the keyboard can reach it, and it writes no log they can open — so a masked
 * message is not withheld from an attacker, it is withheld from the only person
 * who could act on it. That build showed "Internal server error" for every
 * fault and offered no second way to find out what happened.
 *
 * A malformed JSON body is the fault used to provoke it: express.json throws,
 * which is exactly the path a route's own throw takes to the same handler.
 *
 * The env is read per REQUEST, not at import, which is what lets one server
 * answer as both editions here — and is deliberate in app.js, so that main.js
 * setting APP_EDITION after importing app.js could never silently re-mask.
 */
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { app } from '../src/app.js'

let server
let baseUrl
const saved = {}

before(async () => {
  for (const k of ['NODE_ENV', 'APP_EDITION']) saved[k] = process.env[k]
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(() => {
  for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
  server?.close()
})

// Unparseable on purpose — express.json throws, and the throw lands in the
// same handler every route's own error does.
const provoke = async (nodeEnv, edition) => {
  process.env.NODE_ENV = nodeEnv
  if (edition === undefined) delete process.env.APP_EDITION
  else process.env.APP_EDITION = edition
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  })
  return (await res.json()).error
}

describe('error messages are masked for strangers and shown to the person at the keyboard', () => {
  test('the deployed server masks', async () => {
    assert.equal(await provoke('production', 'server'), 'Internal server error')
  })

  // The default has to be the safe one: anything that forgets to set an edition
  // must behave like the public server, never like the desktop build.
  test('an unset edition masks', async () => {
    assert.equal(await provoke('production', undefined), 'Internal server error')
  })

  test('the desktop build shows the real message', async () => {
    const msg = await provoke('production', 'desktop')
    assert.notEqual(msg, 'Internal server error')
    assert.match(msg, /JSON|token/i)
  })

  test('development still shows it, as it always did', async () => {
    const msg = await provoke('development', 'server')
    assert.notEqual(msg, 'Internal server error')
  })
})
