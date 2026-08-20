import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { parseEntry } from '../src/reportEntry.js'
import { prisma } from '../src/db.js'

// parseEntry is the one point every entry passes through — the POST and PUT
// routes and the WhatsApp webhook all call it — so what it settles is what the
// record holds, whichever way the entry arrived.
describe('parseEntry settles the Tel number that gets stored', () => {
  // A stand-in is admin-managed, so these tests configure one rather than
  // leaning on whatever this database happens to hold. The row is shared, so
  // whatever was there is put back afterwards.
  let saved = null
  let hadRow = false

  before(async () => {
    const row = await prisma.appOptions.findUnique({ where: { id: 1 } })
    hadRow = !!row
    saved = row?.data ?? null
    await prisma.appOptions.upsert({
      where: { id: 1 },
      create: { id: 1, data: { models: MODELS } },
      update: { data: { ...(saved ?? {}), models: MODELS } },
    })
  })

  after(async () => {
    if (hadRow) await prisma.appOptions.update({ where: { id: 1 }, data: { data: saved } })
    else await prisma.appOptions.delete({ where: { id: 1 } }).catch(() => {})
  })

  const body = (extra) => ({
    reportDate: '2026-08-18',
    type: 'SEPURA',
    faults: [{ issue: 'ANTENNA', quantity: 1, action: 'CHANGE', company: 'MOTECO' }],
    ...extra,
  })
  const stored = async (extra) => (await parseEntry(body(extra))).data.telNumber

  // 109 names the car kit, the desktop and the bike alike, so a model may take
  // a stand-in prefix to be selected by. The radio's real number begins 109,
  // and that is what the record must hold.
  test('the bike stand-in 107 is stored as 109', async () => {
    assert.equal(await stored({ model: 'SRG3900 BIKE', telNumber: '107332645500' }), '109332645500')
  })

  test('the desktop stand-in 108 is stored as 109', async () => {
    assert.equal(await stored({ model: 'SRG3900 DESKTOP', telNumber: '108400376200' }), '109400376200')
  })

  test('the same digits against another model are stored as typed', async () => {
    assert.equal(await stored({ model: 'SRG3900 CARKIT', telNumber: '107332645500' }), '107332645500')
    assert.equal(await stored({ model: 'SRG3900 BIKE', telNumber: '108400376200' }), '108400376200')
  })

  test('a real 109 number is unchanged', async () => {
    assert.equal(await stored({ model: 'SRG3900 BIKE', telNumber: '109332645500' }), '109332645500')
  })

  // A model the admin gave no stand-in is untouched, which is most of them.
  test('a model with no stand-in stores whatever was typed', async () => {
    assert.equal(await stored({ model: 'TH1N', type: 'AIRBUS', telNumber: '107332645500' }), '107332645500')
  })

  // The swap reads the Model that parseEntry itself settled, so an entry
  // without one falls through to the placeholder rather than throwing.
  test('an entry with no model keeps its number and its placeholder', async () => {
    assert.equal(await stored({ telNumber: '107332645500' }), '107332645500')
    assert.equal(await stored({ model: 'SRG3900 BIKE' }), '-')
    assert.equal(await stored({ model: 'SRG3900 BIKE', telNumber: '   ' }), '-')
  })

  // Nothing else about the entry moves.
  test('the rest of the entry is untouched by the swap', async () => {
    const { data } = await parseEntry(
      body({ model: 'SRG3900 BIKE', telNumber: '107332645500', issiNumber: '12346575' }),
    )
    assert.equal(data.model, 'SRG3900 BIKE')
    assert.equal(data.type, 'SEPURA')
    assert.equal(data.issiNumber, '12346575')
    assert.deepEqual(
      data.faults.create.map((f) => f.issue),
      ['ANTENNA'],
    )
  })

  // Validation still comes back without touching the database.
  test('a body that fails validation still reports its error', async () => {
    assert.match((await parseEntry({ type: 'SEPURA', faults: [] })).error, /reportDate/)
    assert.match((await parseEntry(body({ model: 'SRG3900 BIKE', faults: [] }))).error, /at least one fault/i)
  })
})

// What the admin configured for the tests above — the shipped shape, with the
// stand-in also claimed as a Tel prefix, which is how a real install sets it up.
const MODELS = [
  { name: 'TH1N', prefixes: ['355', '06'] },
  { name: 'SRG3900 CARKIT', prefixes: ['109'] },
  { name: 'SRG3900 DESKTOP', prefixes: ['109', '108'], standIn: '108', standInReal: '109' },
  { name: 'SRG3900 BIKE', prefixes: ['109', '107'], standIn: '107', standInReal: '109' },
]
