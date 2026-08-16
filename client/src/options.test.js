import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mergeOptions, DEFAULT_OPTIONS, issueCodeIndex } from './options.js'

describe('mergeOptions', () => {
  test('a stored category replaces its default', () => {
    const out = mergeOptions({ branches: ['Only One'] })
    assert.deepEqual(out.branches, ['Only One'])
  })

  test('an absent category falls back to the default', () => {
    const out = mergeOptions({})
    assert.deepEqual(out.companies, DEFAULT_OPTIONS.companies)
  })

  // An options set saved before RTO existed must not hide it — the
  // reference-only marking at save time depends on the action being pickable.
  test('RTO is re-added to a stored actions list that predates it', () => {
    const out = mergeOptions({ actions: ['CHANGE', 'REPAIR'] })
    assert.deepEqual(out.actions, ['CHANGE', 'REPAIR', 'RTO'])
  })

  test('RTO is not duplicated when the stored list already has it', () => {
    const out = mergeOptions({ actions: ['CHANGE', 'RTO'] })
    assert.deepEqual(out.actions, ['CHANGE', 'RTO'])
  })

  test('an existing RTO is matched regardless of case or padding', () => {
    const out = mergeOptions({ actions: ['CHANGE', ' rto '] })
    assert.equal(out.actions.filter((a) => a.trim().toUpperCase() === 'RTO').length, 1)
  })

  test('the defaults already carry RTO', () => {
    assert.ok(mergeOptions(undefined).actions.includes('RTO'))
  })

  // Same reasoning for the 50F fault code: an issueTypes list saved before it
  // existed must not make the documented shorthand undecodable.
  test('50F is re-added to a stored issueTypes list that predates it', () => {
    const out = mergeOptions({ issueTypes: ['ANTENNA'] })
    assert.equal(issueCodeIndex(out.issueTypes)['50F'], 'DEFECTIVE PCB')
  })

  test('an installation that already claims 50F keeps its own wording', () => {
    const out = mergeOptions({ issueTypes: [{ name: 'BAD MAINBOARD', parts: '50', variant: 'F' }] })
    assert.equal(issueCodeIndex(out.issueTypes)['50F'], 'BAD MAINBOARD')
    assert.equal(out.issueTypes.length, 1, 'must not append a second claim on the same code')
  })

  test('the defaults already claim 50F', () => {
    assert.equal(issueCodeIndex(mergeOptions(undefined).issueTypes)['50F'], 'DEFECTIVE PCB')
  })
})
