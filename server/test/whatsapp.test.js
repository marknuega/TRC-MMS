import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { app } from '../src/app.js'
import { prisma } from '../src/db.js'
import { decodeBatch, decodeAgencyOnly } from '../src/whatsapp/decoder.js'
import { alreadyProcessed } from '../src/whatsapp/dedup.js'
import { splitBody } from '../src/whatsapp/send.js'

let server
let baseUrl

// A minimal map covering both resolution paths: 43A/99B are CLAIMED by issue
// types, 19 is an ordinary component resolved through parts + variant.
const MAP = {
  equipmentCodes: { H: 'Airbus TH1n', T: 'Sepura STP9000' },
  // components/variants are still published for the Code Reference page, but
  // the decoder no longer reads them — every fault code must be claimed.
  components: { 19: 'Fistmic', 41: 'Rotary Knob' },
  variants: { A: '', B: '3D' },
  faults: {
    '43A': 'Side Grip',
    '43B': 'Side Grip-3D',
    '99A': 'Charger',
    '99B': 'Charger-818',
    '19A': 'Fistmic',
    '19B': 'Fistmic 3D',
    '41A': 'Rotary Knob',
    '26A': 'LCD',
  },
  // RTO is the one action written out in full — see ACTION_ALT in decoder.js.
  actions: { C: 'Change', R: 'Repair', RTO: 'RTO' },
  companies: { MT: 'MOTECO', MI: 'MOI' },
  agencies: { PSD: 'PUBLIC SECURITY DEPARTMENT' },
  technicians: { 1: 'Amir', MA: 'Muhammad Amir' },
}

const one = (text) => {
  const r = decodeBatch(text, MAP)
  assert.ok(r.ok, `expected "${text}" to decode, got: ${r.reason}`)
  return r.batch.groups[0].faults[0]
}

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${server.address().port}`
})

after(async () => {
  await server?.close()
  await prisma.$disconnect()
})

describe('whatsapp decoder', () => {
  test('a claimed parts+variant outranks the component lookup', () => {
    // 43 is not in components at all; the claim is the only way this resolves.
    assert.equal(one('H43AC1MT 1').componentName, 'Side Grip')
    assert.equal(one('H43BC1MT 1').componentName, 'Side Grip-3D')
    // 99A and 99B are different chargers, not two builds of one — the variant
    // suffix must NOT be appended on a claimed code.
    assert.equal(one('H99BC1MT 1').componentName, 'Charger-818')
  })

  test('an unclaimed code is refused, and names where to define it', () => {
    // 19 IS in components, which used to be enough on its own.
    const r = decodeBatch('H55AC1MT 1', MAP)
    assert.equal(r.ok, false)
    assert.match(r.reason, /55A is not a defined code/)
    assert.match(r.reason, /Manage inputs/)
  })

  test('a claimed code resolves to exactly the claimed name', () => {
    assert.equal(one('H19AC1MT 1').componentName, 'Fistmic')
    assert.equal(one('H19BC1MT 1').componentName, 'Fistmic 3D')
  })

  test('quantity is optional and defaults to 1', () => {
    assert.equal(one('H43AC1MT 1').quantity, 1)
    assert.equal(one('H43ACMT 1').quantity, 1)
    assert.equal(one('H43AC3MT 1').quantity, 3)
  })

  test('the superseded 3-character format is rejected, showing the new code', () => {
    const r = decodeBatch('26HC1MT 1', MAP)
    assert.equal(r.ok, false)
    assert.match(r.reason, /old code format/)
    // The whole point of the message: it must name the replacement.
    assert.match(r.reason, /H26AC1MT/)
  })

  test('tel + issi are pulled off the end, technician id last', () => {
    const r = decodeBatch('H43AC1MT H19AR2MI 2221 6575 1', MAP)
    assert.ok(r.ok, r.reason)
    assert.equal(r.batch.telNumber, '2221')
    assert.equal(r.batch.issiNumber, '6575')
    assert.equal(r.batch.techName, 'Amir')
    assert.equal(r.batch.groups[0].faults.length, 2)
  })

  test('a technician ID may be letters (initials), matched case-insensitively', () => {
    const r = decodeBatch('H43AC1MT ma', MAP)
    assert.ok(r.ok, r.reason)
    assert.equal(r.batch.techId, 'MA')
    assert.equal(r.batch.techName, 'Muhammad Amir')
  })

  test('a batch mixing two brands is refused rather than split', () => {
    const r = decodeBatch('H43AC1MT T41AC1MT 1', MAP)
    assert.equal(r.ok, false)
    assert.match(r.reason, /Mismatched parts/)
  })

  test('unknown codes are named individually', () => {
    assert.match(decodeBatch('X43AC1MT 1', MAP).reason, /device letter "X"/)
    assert.match(decodeBatch('H77AC1MT 1', MAP).reason, /77A is not a defined code/)
    assert.match(decodeBatch('H19ZC1MT 1', MAP).reason, /19Z is not a defined code/)
    assert.match(decodeBatch('H43AC1MT 9', MAP).reason, /Unknown technician ID "9"/)
  })

  test('agency-only messages decode, anything else does not', () => {
    assert.deepEqual(decodeAgencyOnly('psd', MAP), {
      agencyCode: 'PSD',
      agencyName: 'PUBLIC SECURITY DEPARTMENT',
    })
    assert.equal(decodeAgencyOnly('NOPE', MAP), null)
    assert.equal(decodeAgencyOnly('H43AC1MT', MAP), null)
  })
})

describe('whatsapp webhook mount', () => {
  // The regression this file exists for: app.js has a catch-all SPA fallback
  // that answers any unmatched GET with index.html. If the webhook router is
  // ever mounted after it, Meta's verification receives HTML instead of the
  // challenge and the callback URL silently stops working.
  test('the verification handshake returns the challenge, not the SPA', async () => {
    const token = process.env.WA_WEBHOOK_VERIFY_TOKEN || 'test-verify-token'
    process.env.WA_WEBHOOK_VERIFY_TOKEN = token

    const res = await fetch(
      `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=abc123`,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'abc123')
  })

  test('a wrong verify token is refused', async () => {
    process.env.WA_WEBHOOK_VERIFY_TOKEN = 'the-real-token'
    const res = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`)
    assert.equal(res.status, 403)
  })

  test('an incoming message is acked immediately', async () => {
    // Meta retries aggressively on anything but a fast 200, so the ack must not
    // wait on decoding or saving.
    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: [{ changes: [{ value: {} }] }] }),
    })
    assert.equal(res.status, 200)
  })
})

describe('whatsapp dedup', () => {
  test('the same message id is only processed once', async () => {
    const id = `wamid.test.${randomBytes(8).toString('hex')}`
    try {
      assert.equal(await alreadyProcessed(id), false, 'first delivery must be processed')
      assert.equal(await alreadyProcessed(id), true, 'a retry must be refused')
    } finally {
      await prisma.processedMessage.deleteMany({ where: { messageId: id } })
    }
  })

  test('a blank id is never treated as a duplicate', async () => {
    assert.equal(await alreadyProcessed(undefined), false)
  })
})

describe('whatsapp send', () => {
  test('a long body is split on line boundaries and numbered', () => {
    const line = 'x'.repeat(200)
    const parts = splitBody(Array.from({ length: 40 }, () => line).join('\n'))
    assert.ok(parts.length > 1, 'expected the body to be split')
    for (const p of parts) assert.ok(p.length <= 4096, 'each part must fit WhatsApp’s limit')
    assert.match(parts[0], /^\(1\/\d+\)\n/)
  })

  test('a short body is left exactly as-is', () => {
    assert.deepEqual(splitBody('hello'), ['hello'])
  })
})

describe('whatsapp shorthand', () => {
  test('the device letter may be dropped from the second code onward', () => {
    const full = decodeBatch('H43AC1MT H19AC2MI 1', MAP)
    const short = decodeBatch('H43AC1MT 19AC2MI 1', MAP)
    assert.ok(short.ok, short.reason)
    // Not merely "it parses" — it must mean exactly what writing it out means.
    assert.deepEqual(short.batch.groups, full.batch.groups)
  })

  test('the inherited device carries down a chain of codes', () => {
    const r = decodeBatch('H43AC1MT 19AC2MI 19BRMT 1', MAP)
    assert.ok(r.ok, r.reason)
    assert.deepEqual(
      r.batch.groups.flatMap((g) => g.faults).map((f) => f.componentCode),
      ['H43A', 'H19A', 'H19B'],
    )
  })

  test('the first code must still name the device', () => {
    const r = decodeBatch('19ACMI 1', MAP)
    assert.equal(r.ok, false)
    assert.match(r.reason, /no device letter/)
  })

  test('a first code that is also the old format gets the old-format answer', () => {
    // "26HC1MT" fits the shorthand AND the retired grammar exactly. Someone
    // typing it is far likelier to be using the old format than to have
    // forgotten a device letter, so that reading leads — but both are named.
    const r = decodeBatch('26HC1MT 1', MAP)
    assert.equal(r.ok, false)
    assert.match(r.reason, /old code format/)
    assert.match(r.reason, /H26AC1MT/)
    assert.match(r.reason, /SECOND code onward/)
  })

  test('a company may be written with one letter', () => {
    const full = decodeBatch('H43AC1MT H19AC2MI 1', MAP)
    const short = decodeBatch('H43AC1T 19AC2I 1', MAP)
    assert.ok(short.ok, short.reason)
    assert.deepEqual(short.batch.groups, full.batch.groups)
  })

  test('the shorthand is canonicalised to the full company code', () => {
    const f = one('H43AC1T 1')
    assert.equal(f.companyCode, 'MT')
    assert.equal(f.companyName, 'MOTECO')
  })

  test('a one-letter company that names no company is refused', () => {
    // "M" starts both MI and MT but ends neither, so it identifies nothing.
    assert.match(decodeBatch('H43AC1M 1', MAP).reason, /company code "M"/)
  })

  test('an ambiguous one-letter company is refused rather than guessed', () => {
    const map = { ...MAP, companies: { MT: 'MOTECO', PT: 'PROJECT 2' } }
    const r = decodeBatch('H43AC1T 1', map)
    assert.equal(r.ok, false)
    assert.match(r.reason, /could mean MT or PT/)
  })

  test('quantity stays optional in every shorthand combination', () => {
    for (const text of ['H43ACMT 19ACMI 1', 'H43ACT 19ACI 1', 'H43AC1MT 19ACI 1']) {
      const r = decodeBatch(text, MAP)
      assert.ok(r.ok, `${text}: ${r.reason}`)
      assert.deepEqual(
        r.batch.groups.flatMap((g) => g.faults).map((f) => f.quantity),
        [1, 1],
        text,
      )
    }
  })
})

// RTO is three characters in a slot that is otherwise one letter, sitting
// directly in front of the company. The risk is that "R" + a two-letter
// company and "RTO" + a one-letter company read the same; these pin which
// wins, and that plain Repair is untouched.
describe('whatsapp RTO action', () => {
  test('RTO is taken whole, not as Repair plus a company', () => {
    const f = one('H43ARTOMT 1')
    assert.equal(f.actionCode, 'RTO')
    assert.equal(f.companyCode, 'MT')
  })

  test('a plain R still decodes as Repair', () => {
    const f = one('H43AR1MT 1')
    assert.equal(f.actionCode, 'R')
    assert.equal(f.companyCode, 'MT')
  })

  test('RTO carries a quantity like any other action', () => {
    const f = one('H43ARTO3MT 1')
    assert.equal(f.actionCode, 'RTO')
    assert.equal(f.quantity, 3)
  })

  test('RTO works with a one-letter company too', () => {
    const f = one('H43ARTOT 1')
    assert.equal(f.actionCode, 'RTO')
    assert.equal(f.companyCode, 'MT')
  })

  test('RTO works in the device-less shorthand', () => {
    const r = decodeBatch('H43AC1MT 43ARTOMT 1', MAP)
    assert.ok(r.ok, r.reason)
    const faults = r.batch.groups.flatMap((g) => g.faults)
    assert.deepEqual(
      faults.map((f) => f.actionCode),
      ['C', 'RTO'],
    )
  })
})
