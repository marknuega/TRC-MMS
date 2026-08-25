/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The Model+Parts pair code — the identity inventory is held by.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  claimedPartsCode,
  deviceLetterFor,
  makePairCode,
  normalizePairCode,
  pairCodeForFault,
  parsePairCode,
  stockedElsewhere,
} from '../../client/src/pairCode.js'
import { CODEMAP_SEED } from '../src/codemapSeed.js'

const EQUIP = CODEMAP_SEED.equipmentCodes
const ISSUES = [
  { name: 'SPEAKER LOW', parts: '45', variant: 'A' },
  { name: 'SPEAKER MID', parts: '46', variant: 'A' },
  'CUR3 DISPLAY FOR TMR880I - HT10280AA', // named, no code yet
]

describe('deviceLetterFor', () => {
  // The letter is the whole point: the same part number on two radios is two
  // shelves, and the letter is what tells them apart.
  test('finds the letter for the Manage-inputs spelling of a model', () => {
    assert.equal(deviceLetterFor('TH1N', EQUIP), 'H')
    assert.equal(deviceLetterFor('SRG3900 CARKIT', EQUIP), 'C')
    assert.equal(deviceLetterFor('SRG3900 DESKTOP', EQUIP), 'D')
    assert.equal(deviceLetterFor('TMR 880i', EQUIP), 'M')
  })

  // The WhatsApp decoder writes the code map's own wording onto the entry (see
  // saveGroup in whatsapp/routes.js), so both vocabularies must land on one
  // letter or the same fault would draw from two shelves depending on where it
  // was typed.
  test('finds the same letter for the code map spelling', () => {
    assert.equal(deviceLetterFor('SRG Carkit', EQUIP), 'C')
    assert.equal(deviceLetterFor('TMR880i', EQUIP), 'M')
    assert.equal(deviceLetterFor('TH1n', EQUIP), 'H')
  })

  test('answers nothing for a model the map does not name', () => {
    assert.equal(deviceLetterFor('For Record Purpose Only.', EQUIP), '')
    assert.equal(deviceLetterFor('', EQUIP), '')
    assert.equal(deviceLetterFor('TH1N', {}), '')
  })
})

describe('makePairCode / parsePairCode', () => {
  test('a parts code makes the four-character form', () => {
    assert.equal(makePairCode('C', '45A'), 'C45A')
    assert.equal(makePairCode('h', '45a'), 'H45A')
  })

  test('a name makes the provisional form', () => {
    assert.equal(makePairCode('M', 'CUR3 Display for TMR880i - HT10280AA'), 'M:CUR3 DISPLAY FOR TMR880I - HT10280AA')
    assert.equal(makePairCode('C', 'Loud Speaker'), 'C:LOUD SPEAKER')
  })

  test('runs of whitespace in a name collapse, so one shelf is one code', () => {
    assert.equal(makePairCode('M', 'CUR3   DISPLAY'), makePairCode('M', 'CUR3 DISPLAY'))
  })

  test('no letter, no code — a part with no model in front of it is the ambiguity itself', () => {
    assert.equal(makePairCode('', '45A'), '')
    assert.equal(makePairCode('CC', '45A'), '')
    assert.equal(makePairCode('C', ''), '')
  })

  test('the real form parses back into its halves', () => {
    assert.deepEqual(parsePairCode('C45A'), { letter: 'C', part: '45A', provisional: false })
  })

  // The name half owns every character after the FIRST colon. Real item names
  // carry hyphens and spaces — this one has both — so a greedy split, or a
  // split on a hyphen, would cut in the wrong place.
  test('the provisional form keeps a name that has separators of its own', () => {
    assert.deepEqual(parsePairCode('M:CUR3 DISPLAY FOR TMR880I - HT10280AA'), {
      letter: 'M',
      part: 'CUR3 DISPLAY FOR TMR880I - HT10280AA',
      provisional: true,
    })
  })

  test('refuses anything that is neither form', () => {
    assert.equal(parsePairCode('45A'), null) // no model in front
    assert.equal(parsePairCode('C4A'), null) // one digit short
    assert.equal(parsePairCode('CD:SPEAKER'), null) // two letters is not a device
    assert.equal(parsePairCode('C:'), null) // nothing named
    assert.equal(parsePairCode(''), null)
  })

  test('normalizePairCode round-trips both forms and rejects the rest', () => {
    assert.equal(normalizePairCode(' c45a '), 'C45A')
    assert.equal(normalizePairCode('m:cur3  display'), 'M:CUR3 DISPLAY')
    assert.equal(normalizePairCode('nonsense'), '')
  })
})

describe('claimedPartsCode', () => {
  test('reads the code an issue type claims', () => {
    assert.equal(claimedPartsCode('SPEAKER LOW', ISSUES), '45A')
    assert.equal(claimedPartsCode('speaker low', ISSUES), '45A')
  })

  // Deliberately exact, not the fuzzy matchOption used everywhere else: a loose
  // match would promote "SPEAKER" onto SPEAKER LOW's code and draw the wrong
  // item off the shelf for good. An unclaimed name gets a provisional code
  // instead, which is correct and reversible.
  test('does not guess a claim for a name nobody claimed', () => {
    assert.equal(claimedPartsCode('SPEAKER', ISSUES), '')
    assert.equal(claimedPartsCode('CUR3 DISPLAY FOR TMR880I - HT10280AA', ISSUES), '')
  })
})

describe('pairCodeForFault', () => {
  const vocab = { equipmentCodes: EQUIP, issueTypes: ISSUES }

  // The whole reason this exists: one part code, two models, two shelves.
  test('one claimed part gives a different code per model', () => {
    assert.equal(pairCodeForFault({ model: 'TH1N', issue: 'SPEAKER LOW' }, vocab), 'H45A')
    assert.equal(pairCodeForFault({ model: 'SRG3900 CARKIT', issue: 'SPEAKER LOW' }, vocab), 'C45A')
    assert.equal(pairCodeForFault({ model: 'SRG3900 DESKTOP', issue: 'SPEAKER LOW' }, vocab), 'D45A')
  })

  test('an unclaimed part falls to the provisional form under the same letter', () => {
    assert.equal(
      pairCodeForFault({ model: 'TMR 880i', issue: 'CUR3 Display for TMR880i - HT10280AA' }, vocab),
      'M:CUR3 DISPLAY FOR TMR880I - HT10280AA',
    )
  })

  test('a model the map does not name draws no model-specific code', () => {
    assert.equal(pairCodeForFault({ model: 'For Record Purpose Only.', issue: 'SPEAKER LOW' }, vocab), '')
  })
})

// A Model Code says which shelf an item comes off. Offering a Carkit part while
// a TH1n is on the bench offers a fault that draws from the wrong box.
describe('stockedElsewhere', () => {
  test('a part held only for another device is not offered here', () => {
    assert.equal(stockedElsewhere(['C:LOUDSPEAKER SEPURA - 300-00719'], 'H'), true)
    assert.equal(stockedElsewhere(['C45A'], 'H'), true)
  })

  test('a part held for this device is offered', () => {
    assert.equal(stockedElsewhere(['H45A'], 'H'), false)
    assert.equal(stockedElsewhere(['C45A', 'H45A'], 'H'), false)
  })

  // Most of the store is shared, and this must never hide any of it — only
  // something somebody deliberately bound to a device.
  test('a part on no Model Code at all is shared, and always offered', () => {
    assert.equal(stockedElsewhere([], 'H'), false)
    assert.equal(stockedElsewhere(undefined, 'H'), false)
  })

  // "For Record Purpose Only." is a real Model on a real entry and names no
  // device, so there is nothing to narrow against.
  test('a model the map names no letter for narrows nothing', () => {
    assert.equal(stockedElsewhere(['C45A'], ''), false)
    assert.equal(stockedElsewhere(['C45A'], undefined), false)
  })

  test('ignores anything that is not a Model Code', () => {
    assert.equal(stockedElsewhere(['nonsense'], 'H'), false)
    assert.equal(stockedElsewhere(['nonsense', 'C45A'], 'H'), true)
  })
})

// ---------------------------------------------------------------------------
// A fault written by a per-device name must reach that device's shelf.
//
// One code can be a different physical part per radio: 99A is the ACP-12 on a
// TH1N and the Charger818 on an STP9000. A fault stores the NAME it was
// written by, so if "Charger818" claimed nothing, every STP9000 charger fault
// would fall through to a provisional code and its own separate shelf — stock
// drawn off the wrong box, silently, inside the save transaction.
// ---------------------------------------------------------------------------
describe('per-device names resolve to the shared code', () => {
  const ISSUE_TYPES = [
    {
      name: 'ACP-12',
      parts: '99',
      variant: 'A',
      models: ['TH1N', 'THR9', 'STP9000'],
      names: { STP9000: 'Charger818' },
    },
  ]
  const VOCAB = { equipmentCodes: CODEMAP_SEED.equipmentCodes, issueTypes: ISSUE_TYPES }

  test('the row own name claims the code', () => {
    assert.equal(claimedPartsCode('ACP-12', ISSUE_TYPES), '99A')
  })

  test('an override name claims the same code', () => {
    assert.equal(claimedPartsCode('Charger818', ISSUE_TYPES), '99A')
  })

  test('each device draws its own pair code from its own name', () => {
    assert.equal(pairCodeForFault({ model: 'TH1N', issue: 'ACP-12' }, VOCAB), 'H99A')
    assert.equal(pairCodeForFault({ model: 'THR9', issue: 'ACP-12' }, VOCAB), 'R99A')
    assert.equal(pairCodeForFault({ model: 'STP9000', issue: 'Charger818' }, VOCAB), 'T99A')
  })

  // Nothing loosens: an unrelated name still claims nothing and still gets a
  // provisional code, which is the reversible answer.
  test('a name nothing claims is still unclaimed', () => {
    assert.equal(claimedPartsCode('SOME OTHER PART', ISSUE_TYPES), '')
  })
})
