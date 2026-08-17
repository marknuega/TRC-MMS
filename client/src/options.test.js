import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeOptions,
  DEFAULT_OPTIONS,
  issueCodeIndex,
  optionNames,
  optionPrefixes,
  prefixOwners,
  telPick,
  isServiceAction,
} from './options.js'

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

  // Every install that has ever opened Manage inputs has a saved models list,
  // and a saved category fully replaces its default — so without the seeding
  // pass the shipped Tel prefixes would reach nobody.
  test('the shipped Tel prefixes are attached to a stored models list that predates them', () => {
    const out = mergeOptions({ models: ['TH1N', 'STP9000', 'PT590'] })
    assert.deepEqual(optionPrefixes(out.models[0]), ['355', '06'])
    assert.deepEqual(optionPrefixes(out.models[1]), ['190'])
    assert.deepEqual(optionPrefixes(out.models[2]), [], 'a model with no shipped prefix stays a plain string')
    assert.equal(out.models[2], 'PT590')
  })

  test('all three SRG3900 builds are seeded the 109 they share', () => {
    const out = mergeOptions({ models: ['SRG3900 CARKIT', 'SRG3900 DESKTOP', 'SRG3900 BIKE'] })
    assert.deepEqual(out.models.map(optionPrefixes), [['109'], ['109'], ['109']])
  })

  test("a model that already carries prefixes keeps exactly what the admin set", () => {
    const out = mergeOptions({ models: [{ name: 'TH1N', prefixes: ['77'] }] })
    assert.deepEqual(optionPrefixes(out.models[0]), ['77'])
  })

  test('a prefix another stored model already claims is not handed back', () => {
    // 190 was moved off STP9000 deliberately; seeding must not undo that.
    const out = mergeOptions({ models: [{ name: 'MT680', prefixes: ['190'] }, 'STP9000'] })
    assert.deepEqual(optionPrefixes(out.models[1]), [])
  })

  test('seeding never changes which models exist, or their order', () => {
    const stored = ['STP9000', 'TH1N', 'Something Custom']
    assert.deepEqual(optionNames(mergeOptions({ models: stored }).models), stored)
  })

  // Agencies get the same treatment from the same pass — the 48-entry stored
  // list every install has would otherwise carry no prefixes at all.
  test('the shipped Tel prefixes are attached to a stored agencies list too', () => {
    const out = mergeOptions({ agencies: ['PSD', 'CD', 'DOT'] })
    assert.deepEqual(optionPrefixes(out.agencies[0]), ['180'])
    assert.deepEqual(optionPrefixes(out.agencies[1]), ['191'])
    assert.deepEqual(optionPrefixes(out.agencies[2]), [])
  })

  test('an agency the admin already gave prefixes is left alone', () => {
    const out = mergeOptions({ agencies: [{ name: 'PSD', prefixes: ['77'] }, 'CD'] })
    assert.deepEqual(optionPrefixes(out.agencies[0]), ['77'])
  })

  test('seeding never changes which agencies exist, or their order', () => {
    const stored = ['DOT', 'PSD', 'CD']
    assert.deepEqual(optionNames(mergeOptions({ agencies: stored }).agencies), stored)
  })
})

describe('prefixOwners', () => {
  const MODELS = [
    { name: 'TH1N', prefixes: ['355', '06'] },
    { name: 'STP9000', prefixes: ['190'] },
    { name: 'SRG3900 CARKIT', prefixes: ['109'] },
    { name: 'SRG3900 DESKTOP', prefixes: ['109'] },
    'PT590',
  ]

  test('a number matches the model owning its leading digits', () => {
    assert.deepEqual(prefixOwners('1903324096', MODELS), { prefix: '190', names: ['STP9000'] })
  })

  test('prefixes are not one fixed length', () => {
    assert.deepEqual(prefixOwners('0612345678', MODELS), { prefix: '06', names: ['TH1N'] })
  })

  test('every model holding the winning prefix comes back', () => {
    assert.deepEqual(prefixOwners('1093324096', MODELS), {
      prefix: '109',
      names: ['SRG3900 CARKIT', 'SRG3900 DESKTOP'],
    })
  })

  test('the longest matching prefix wins, not the first', () => {
    const models = [{ name: 'Wide', prefixes: ['06'] }, { name: 'Narrow', prefixes: ['0612'] }]
    assert.deepEqual(prefixOwners('0612345678', models), { prefix: '0612', names: ['Narrow'] })
    assert.deepEqual(prefixOwners('0699999999', models), { prefix: '06', names: ['Wide'] })
  })

  test('the digits are what is compared, so typed spacing cannot defeat a match', () => {
    assert.deepEqual(prefixOwners('190-332 4096', MODELS), { prefix: '190', names: ['STP9000'] })
  })

  test('an unclaimed or empty number matches nothing', () => {
    assert.equal(prefixOwners('0501234567', MODELS), null)
    assert.equal(prefixOwners('', MODELS), null)
    assert.equal(prefixOwners('190', []), null)
  })

  // A one-digit prefix would claim a tenth of every number in existence.
  test('a prefix outside 2-6 digits is ignored rather than matched', () => {
    assert.equal(prefixOwners('1234567', [{ name: 'Greedy', prefixes: ['1'] }]), null)
    assert.equal(prefixOwners('1234567', [{ name: 'Greedy', prefixes: ['1234567'] }]), null)
  })
})

describe('telPick', () => {
  const MODELS = mergeOptions(undefined).models

  test('a number selects the model owning its leading digits', () => {
    assert.equal(telPick('1903324096', MODELS), 'STP9000')
  })

  // The one the reported form actually got wrong: 06 is TH1N, and the field it
  // has to win against is a THR9 carried over from the previous entry.
  test('a two-digit prefix selects its model', () => {
    assert.equal(telPick('0625455', MODELS), 'TH1N')
  })

  // 109 is the car kit, the desktop AND the bike. A number cannot say which,
  // but a model that is one dropdown away from right beats an empty field.
  test('a shared prefix selects the first of its owners in the list', () => {
    assert.equal(telPick('1093324096', MODELS), 'SRG3900 CARKIT')
  })

  test('list order is what decides a shared prefix, so Manage inputs controls it', () => {
    const models = [
      { name: 'SRG3900 BIKE', prefixes: ['109'] },
      { name: 'SRG3900 CARKIT', prefixes: ['109'] },
    ]
    assert.equal(telPick('1093324096', models), 'SRG3900 BIKE')
  })

  test('a model with no Type mapping is still selected', () => {
    assert.equal(telPick('7712345', [{ name: 'Something Custom', prefixes: ['77'] }]), 'Something Custom')
  })

  test('a number nothing claims selects nothing', () => {
    assert.equal(telPick('0501234567', MODELS), '')
    assert.equal(telPick('', MODELS), '')
  })

  // The Agency reads the SAME number against its OWN list. The two are separate
  // questions about the same digits, which is what lets 190 name a model while
  // 191 names an agency without either list reserving the other's numbers.
  describe('agencies, from the same number', () => {
    const { models, agencies } = mergeOptions(undefined)

    test('the reported numbers select their agency', () => {
      assert.equal(telPick('1804133', agencies), 'PSD')
      assert.equal(telPick('1917670', agencies), 'CD')
    })

    test('a number that names an agency need not name a model', () => {
      assert.equal(telPick('1804133', models), '', '180 is no model')
      assert.equal(telPick('1917670', models), '', '191 is no model')
    })

    test('a number that names a model need not name an agency', () => {
      assert.equal(telPick('1903324096', models), 'STP9000')
      assert.equal(telPick('1903324096', agencies), '', '190 is no agency')
    })

    // 180/190/191 differ only in their third digit, so a two-digit read would
    // collapse all three together. The full prefix has to be what matches.
    test('neighbouring prefixes do not bleed into each other', () => {
      assert.equal(telPick('1804133', agencies), 'PSD')
      assert.equal(telPick('1814133', agencies), '', '181 belongs to nobody')
    })

    test('an agency with no prefix is never selected', () => {
      assert.equal(telPick('9999999', agencies), '')
    })
  })
})

describe('isServiceAction', () => {
  test('work with no part fitted is a service', () => {
    for (const a of ['REPAIR', 'PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE']) {
      assert.equal(isServiceAction(a), true, a)
    }
  })

  test('anything that fits a part is not', () => {
    for (const a of ['CHANGE', 'NEW', 'PCB']) assert.equal(isServiceAction(a), false, a)
  })

  // RTO consumes no part either, but it already carries its own meaning (the
  // report is marked reference-only) and was not among the actions asked for.
  test('RTO is left out', () => {
    assert.equal(isServiceAction('RTO'), false)
  })

  test('matching ignores case and padding, as the actions list is user-editable', () => {
    assert.equal(isServiceAction(' dismantle '), true)
    assert.equal(isServiceAction('Re-Program'), true)
  })

  test('a blank or unknown action is not a service', () => {
    assert.equal(isServiceAction(''), false)
    assert.equal(isServiceAction(undefined), false)
    assert.equal(isServiceAction('SOMETHING CUSTOM'), false)
  })

  test('every service action is one the app actually offers', () => {
    const offered = new Set(DEFAULT_OPTIONS.actions.map((a) => a.toUpperCase()))
    for (const a of ['REPAIR', 'PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE']) {
      assert.ok(offered.has(a), `${a} is not in the actions list`)
    }
  })
})
