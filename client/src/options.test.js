import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeOptions,
  DEFAULT_OPTIONS,
  issueCodeIndex,
  optionNames,
  optionPrefixes,
  optionIssiPrefixes,
  prefixOwners,
  telPick,
  issiPick,
  isNoActivityIssi,
  isNoActivityModel,
  isNoActivityIssue,
  noActivityFill,
  optionFullForm,
  NO_ACTIVITY_ISSUE,
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

  // The ISSI list is seeded by the same pass, under the same two rules, and
  // independently of the Tel one — every stored agencies list predates it.
  test('the shipped ISSI prefixes are attached to a stored agencies list', () => {
    const out = mergeOptions({ agencies: ['PSD', 'CD', 'PRI', 'SRCA', 'DOT'] })
    assert.deepEqual(out.agencies.map(optionIssiPrefixes), [['180'], ['191'], ['191'], ['214'], []])
  })

  // 191 is shipped to CD and to PRI both, and the seeding pass hands it to each
  // — the same way all three SRG3900 builds are seeded the 109 they share.
  // Which of the two an ISSI actually lands on is list order (see issiPick), so
  // it stays the admin's to change by moving one above the other.
  test('an ISSI prefix two agencies share is seeded to both of them', () => {
    const out = mergeOptions({ agencies: ['CD', 'PRI'] })
    assert.deepEqual(out.agencies.map(optionIssiPrefixes), [['191'], ['191']])
    assert.equal(issiPick('1917670', out.agencies), 'CD', 'CD is first, so CD is what a number selects')
    assert.equal(issiPick('1917670', [...out.agencies].reverse()), 'PRI')
  })

  // The guard is against undoing a MOVE: a prefix the stored list already
  // carries elsewhere is never handed back by an upgrade.
  test('an ISSI prefix another stored agency already claims is not handed back', () => {
    const out = mergeOptions({ agencies: [{ name: 'DOT', issiPrefixes: ['214'] }, 'SRCA'] })
    assert.deepEqual(optionIssiPrefixes(out.agencies[1]), [], '214 was moved to DOT deliberately')
  })

  test('an agency the admin already gave ISSI prefixes is left alone', () => {
    const out = mergeOptions({ agencies: [{ name: 'PSD', issiPrefixes: ['77'] }] })
    assert.deepEqual(optionIssiPrefixes(out.agencies[0]), ['77'])
  })

  // The two lists are filled by separate passes, so carrying one is no reason
  // to be denied the other.
  test('an agency carrying Tel prefixes still gets its shipped ISSI ones', () => {
    const out = mergeOptions({ agencies: [{ name: 'PSD', prefixes: ['77'] }] })
    assert.deepEqual(optionPrefixes(out.agencies[0]), ['77'], 'the admin mapping stands')
    assert.deepEqual(optionIssiPrefixes(out.agencies[0]), ['180'])
  })

  test('seeding ISSI prefixes never changes which agencies exist, or their order', () => {
    const stored = ['SRCA', 'PSD', 'DOT']
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

// The ISSI answers the same "whose is it" question the Tel number does, off its
// own list. Two numbering systems, matched independently — which is what lets
// an agency hold different digits on each, or only one of the two.
describe('issiPick', () => {
  const { agencies, models } = mergeOptions(undefined)

  test('the shipped ISSI prefixes select their agency', () => {
    assert.equal(issiPick('1804133', agencies), 'PSD')
    assert.equal(issiPick('1917670', agencies), 'CD')
    assert.equal(issiPick('2145566', agencies), 'SRCA')
  })

  test('an ISSI nothing claims selects nothing', () => {
    assert.equal(issiPick('9999999', agencies), '')
    assert.equal(issiPick('', agencies), '')
  })

  // 191 is CD's and PRI's both. CD is higher in the list, so CD is what a
  // number lands on — and moving PRI above it is how that is changed.
  test('a shared ISSI prefix goes to whichever agency is higher in the list', () => {
    const list = [{ name: 'PRI', issiPrefixes: ['191'] }, { name: 'CD', issiPrefixes: ['191'] }]
    assert.equal(issiPick('1917670', list), 'PRI')
    assert.equal(issiPick('1917670', [...list].reverse()), 'CD')
  })

  // The two lists never have to be reconciled: reading an ISSI against the Tel
  // prefixes (or the reverse) would be silently wrong rather than empty, which
  // is why they are separate functions rather than a flag on one.
  test('the ISSI list and the Tel list are read separately', () => {
    const list = [{ name: 'Alpha', prefixes: ['77'], issiPrefixes: ['88'] }]
    assert.equal(issiPick('8812345', list), 'Alpha')
    assert.equal(issiPick('7712345', list), '', '77 is a Tel prefix, not an ISSI one')
    assert.equal(telPick('7712345', list), 'Alpha')
    assert.equal(telPick('8812345', list), '', '88 is an ISSI prefix, not a Tel one')
  })

  test('an ISSI says nothing about the model', () => {
    assert.equal(issiPick('1903324096', models), '', 'models carry no ISSI prefixes')
  })

  // Same rules as the Tel matcher, because it is the same matcher.
  test('longest match wins, and spacing cannot defeat one', () => {
    const list = [{ name: 'Wide', issiPrefixes: ['18'] }, { name: 'Narrow', issiPrefixes: ['1804'] }]
    assert.equal(issiPick('1804133', list), 'Narrow')
    assert.equal(issiPick('180 41-33', list), 'Narrow')
    assert.equal(issiPick('1899999', list), 'Wide')
  })
})

// An ISSI of exactly 00 is not a radio: it is the whole of "nothing happened
// today", and fills the entry in rather than selecting an agency.
describe('the no-activity ISSI', () => {
  const OPTS = mergeOptions(undefined)

  test('00 is the marker, and only 00', () => {
    assert.equal(isNoActivityIssi('00'), true)
    assert.equal(isNoActivityIssi(' 00 '), true, 'typed padding is not a different number')
    assert.equal(isNoActivityIssi('0'), false)
    assert.equal(isNoActivityIssi('000'), false)
    assert.equal(isNoActivityIssi(''), false)
  })

  // Matched exactly rather than as a prefix — a real ISSI that happens to start
  // 00 is a radio, and must not empty the form.
  test('a real number starting 00 is not the marker', () => {
    assert.equal(isNoActivityIssi('0012345'), false)
  })

  test('it fills the entry from the shipped lists', () => {
    assert.deepEqual(noActivityFill(OPTS), {
      model: 'For Record Purpose Only.',
      type: 'OTHER',
      agency: 'No Activity',
      issue: 'No Activity',
      action: '',
      company: '',
      quantity: 0,
    })
  })

  // Alone among every row the app writes. Nothing was done, so there is no unit
  // of anything to count, and a 1 would report a device maintained on a day
  // nobody touched one.
  test('the quantity is 0', () => {
    assert.equal(noActivityFill(OPTS).quantity, 0)
    assert.equal(noActivityFill({}).quantity, 0, 'whatever the lists do or do not offer')
  })

  // The four are ordinary admin-managed options, and an install may spell any
  // of them its own way. Matching ignores case and punctuation so it does.
  test("an install's own spelling of each is what gets selected", () => {
    const fill = noActivityFill({
      models: ['TH1N', 'for record purpose only.'],
      types: ['SEPURA', 'Other/s:'],
      agencies: ['PSD', 'no activity'],
      issueTypes: ['ANTENNA', { name: 'No-Activity', parts: '00', variant: 'A' }],
    })
    assert.deepEqual(fill, {
      model: 'for record purpose only.',
      type: 'Other/s:',
      agency: 'no activity',
      issue: 'No-Activity',
      action: '',
      company: '',
      quantity: 0,
    })
  })

  // The screenshot's own spelling — the agency reads "No Activity Today", which
  // must still be the one the marker selects.
  test('a longer agency name starting the same way still matches', () => {
    assert.equal(noActivityFill({ agencies: ['PSD', 'No Activity Today'] }).agency, 'No Activity Today')
  })

  // Better an empty dropdown the technician can see than a value stored behind
  // a box that renders blank — SearchSelect shows nothing for an off-list value.
  test('a list offering nothing for a field fills nothing', () => {
    const fill = noActivityFill({ models: ['TH1N'], types: ['SEPURA'], agencies: ['PSD'], issueTypes: [] })
    assert.equal(fill.model, '')
    assert.equal(fill.type, '')
    assert.equal(fill.agency, '')
  })

  // The Issue is free text on the entry form, so it always has a value to give.
  test('the issue text is written even when no issue type claims it', () => {
    assert.equal(noActivityFill({}).issue, NO_ACTIVITY_ISSUE)
  })

  test('Action and Company are always "— none —"', () => {
    assert.equal(noActivityFill(OPTS).action, '')
    assert.equal(noActivityFill(OPTS).company, '')
  })

  test('00 is not also an agency prefix, so it can only ever mean this', () => {
    assert.equal(issiPick('00', OPTS.agencies), '')
  })

  // The ISSI is one way to reach that row and typing the issue is another, so
  // what makes a row mean "nothing was done" is the row itself — everything
  // that follows (no action, quantity 0) hangs off this.
  test('the no-activity issue is recognised however it was typed', () => {
    assert.equal(isNoActivityIssue('No Activity'), true)
    assert.equal(isNoActivityIssue('no activity'), true)
    assert.equal(isNoActivityIssue('No-Activity'), true)
    assert.equal(isNoActivityIssue(' NO ACTIVITY '), true)
    assert.equal(isNoActivityIssue('No Activity Today'), true)
  })

  test('an ordinary part is not it', () => {
    assert.equal(isNoActivityIssue('ANTENNA'), false)
    assert.equal(isNoActivityIssue('NO TRANSMIT MODE'), false)
    assert.equal(isNoActivityIssue('NOT AVAILABLE'), false)
    assert.equal(isNoActivityIssue(''), false)
  })

  // The report reads the stored MODEL, not the ISSI that set the entry up — a
  // report is rendered long after anyone typed into a field.
  test('the record-purpose model is recognised on the entry', () => {
    assert.equal(isNoActivityModel('For Record Purpose Only.'), true)
    assert.equal(isNoActivityModel('for record purpose only'), true)
    assert.equal(isNoActivityModel('FOR RECORD PURPOSE'), true)
    assert.equal(isNoActivityModel('TH1N'), false)
    assert.equal(isNoActivityModel(''), false)
  })
})

// The acronym stays the agency's name — it is the identity, and what every
// saved report stores. The full form is only what that acronym expands to.
describe('optionFullForm', () => {
  test('it reads the stored expansion', () => {
    assert.equal(optionFullForm({ name: 'PSD', fullForm: 'PUBLIC SECURITY DEPARTMENT' }), 'PUBLIC SECURITY DEPARTMENT')
  })

  test('an agency without one, or a plain-string one, has none', () => {
    assert.equal(optionFullForm({ name: 'PSD', prefixes: ['180'] }), '')
    assert.equal(optionFullForm('PSD'), '')
  })

  test('it is trimmed, so a stray space is not a full form', () => {
    assert.equal(optionFullForm({ name: 'PSD', fullForm: '  PUBLIC SECURITY  ' }), 'PUBLIC SECURITY')
    assert.equal(optionFullForm({ name: 'PSD', fullForm: '   ' }), '')
  })

  // It is prose about the name, never part of the identity: mergeOptions must
  // carry it through untouched and the agency must still match its prefixes.
  test('it survives the merge and does not disturb the prefix seeding', () => {
    const out = mergeOptions({ agencies: [{ name: 'PSD', fullForm: 'PUBLIC SECURITY DEPARTMENT' }] })
    assert.equal(optionFullForm(out.agencies[0]), 'PUBLIC SECURITY DEPARTMENT')
    assert.deepEqual(optionPrefixes(out.agencies[0]), ['180'])
    assert.deepEqual(optionIssiPrefixes(out.agencies[0]), ['180'])
    assert.equal(telPick('1804133', out.agencies), 'PSD')
    assert.equal(issiPick('1804133', out.agencies), 'PSD')
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
