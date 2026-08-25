/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Which company owns a shelf. The prefix in a SKU used to be decoration; it is
 * now the thing that keeps MOT's stock out of X1's counts, so what it does and
 * does NOT read as is pinned here.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { companyFromSku, companyCodeMap, shelfCompanyForFault, companyNameForCode, shelfCompanyFor } from './company.js'

describe('the company in a SKU', () => {
  test('is the segment before the first hyphen', () => {
    assert.equal(companyFromSku('MOT-MAK-1114-2'), 'MOT')
    assert.equal(companyFromSku('X1-MAK-1116'), 'X1')
    assert.equal(companyFromSku('X2-MAK-1125'), 'X2')
  })

  test('is upper-cased, so a lower-case paste files with its own company', () => {
    assert.equal(companyFromSku('mot-mak-1114-2'), 'MOT')
  })

  // The whole point of the narrow rule in companyFromSku. A legacy SKU that was
  // never prefixed is SHARED stock; reading "1114" as a company of its own would
  // put those rows on a shelf no fault can ever reach.
  test('is blank for a SKU that carries no company', () => {
    assert.equal(companyFromSku('1114-2'), '')
    assert.equal(companyFromSku('NOPREFIX'), '')
    assert.equal(companyFromSku(''), '')
    assert.equal(companyFromSku(null), '')
  })

  test('is blank when the first segment is too long to be a tag', () => {
    assert.equal(companyFromSku('MOTECOLOCAL-MAK-1'), '')
  })
})

describe('a fault company to a shelf', () => {
  const companies = [{ name: 'MOTECO', code: 'MOT' }, { name: 'PROJECT X', code: 'X1' }, 'FREE']

  test('resolves through the Companies list, past case', () => {
    assert.equal(shelfCompanyForFault('MOTECO', companies), 'MOT')
    assert.equal(shelfCompanyForFault('moteco', companies), 'MOT')
    assert.equal(shelfCompanyForFault('PROJECT X', companies), 'X1')
  })

  // Not an error: it is the state every install starts in, and the caller
  // falls back to matching across companies rather than refusing.
  test('is blank for a company the list gives no code', () => {
    assert.equal(shelfCompanyForFault('FREE', companies), '')
    assert.equal(shelfCompanyForFault('NEVER HEARD OF IT', companies), '')
    assert.equal(shelfCompanyForFault('', companies), '')
  })

  test('skips uncoded entries rather than mapping them to blank', () => {
    assert.deepEqual(companyCodeMap(companies), { MOTECO: 'MOT', 'PROJECT X': 'X1' })
  })
})

// Picking a part off MOT's shelf has to set the company the REPORT prints,
// which is the word, not the code.
describe('a shelf code to a company name', () => {
  const companies = [{ name: 'MOTECO', code: 'MOT' }, { name: 'PROJECT X', code: 'X1' }, 'FREE']

  test('resolves the code back to the name', () => {
    assert.equal(companyNameForCode('MOT', companies), 'MOTECO')
    assert.equal(companyNameForCode('X1', companies), 'PROJECT X')
  })

  test('is case and punctuation insensitive on the code', () => {
    assert.equal(companyNameForCode('mot', companies), 'MOTECO')
  })

  // Selecting nothing beats writing a company the dropdown does not offer.
  test('is blank for a code nothing claims', () => {
    assert.equal(companyNameForCode('ZZ', companies), '')
    assert.equal(companyNameForCode('', companies), '')
  })

  test('round-trips with shelfCompanyForFault', () => {
    assert.equal(shelfCompanyForFault(companyNameForCode('X1', companies), companies), 'X1')
  })
})

// A list whose names ARE the codes needs no configuring. Both directions allow
// it, but not equally — see shelfCompanyFor.
describe('a company whose name is its own code', () => {
  const plain = ['MOT', 'X1', '2X']

  test('the name answers to the code for the UI', () => {
    assert.equal(companyNameForCode('MOT', plain), 'MOT')
    assert.equal(companyNameForCode('2X', plain), '2X')
  })

  // An explicit code is never second-guessed by a coincidence of spelling.
  test('an explicit code still wins over a name that looks like one', () => {
    const mixed = [{ name: 'MOTECO', code: 'X1' }, 'X1']
    assert.equal(companyNameForCode('X1', mixed), 'MOTECO')
  })

  describe('shelfCompanyFor', () => {
    const known = new Set(['MOT', 'X1'])

    test('narrows to a shelf the stock is actually filed under', () => {
      assert.equal(shelfCompanyFor('MOT', plain, known), 'MOT')
      assert.equal(shelfCompanyFor('X1', plain, known), 'X1')
    })

    // THE asymmetry. Narrowing to a company nothing stocks would fall through
    // to shared stock, find none, and deduct nothing — silently, mid-save.
    // Unnarrowed is a question somebody gets asked; a wrong narrowing is an
    // answer nobody gets told.
    test('does NOT narrow to a name no shelf is filed under', () => {
      assert.equal(shelfCompanyFor('MOTECO', ['MOTECO', 'MOI'], known), '')
      assert.equal(shelfCompanyFor('2X', plain, known), '')
    })

    test('an explicit code is honoured whether or not it is in known', () => {
      const coded = [{ name: 'MOTECO', code: 'MOT' }]
      assert.equal(shelfCompanyFor('MOTECO', coded, known), 'MOT')
    })

    test('a missing known set narrows nothing by name', () => {
      assert.equal(shelfCompanyFor('MOT', plain, undefined), '')
    })
  })
})
