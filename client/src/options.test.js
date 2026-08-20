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
  optionName,
  telForModel,
  optionStandIns,
  optionStandInReal,
  optionStandInRules,
  replaceTelPrefix,
  issiWireOffer,
  withIssiPrefix,
  optionIssiPrefixes as issiPrefixesOf,
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
    // The shorthand 01 comes back with the range it stands for — it is one of
    // this model's prefixes, not a separate thing bolted on afterwards.
    assert.deepEqual(optionPrefixes(out.models[0]), ['355', '06', '01'])
    assert.deepEqual(optionPrefixes(out.models[1]), ['190'])
    assert.deepEqual(optionPrefixes(out.models[2]), [], 'a model with no shipped prefix stays a plain string')
    assert.equal(out.models[2], 'PT590')
  })

  // 109 is really on all three, so each is seeded that plus the shorthand it
  // is picked by — and the stand-in rule that swaps one back for the other.
  test('each SRG3900 build is seeded the shared 109 and shorthand of its own', () => {
    const out = mergeOptions({ models: ['SRG3900 CARKIT', 'SRG3900 DESKTOP', 'SRG3900 BIKE'] })
    assert.deepEqual(out.models.map(optionPrefixes), [
      ['109', '103', '03'],
      ['109', '104', '04'],
      ['109', '102', '02'],
    ])
    // The prefixes alone would be the wrong rule: 103 would select the car kit
    // and then save as 103, a number no radio carries. The swap comes back too.
    assert.deepEqual(out.models.map(optionStandIns), [
      ['103', '03'],
      ['104', '04'],
      ['102', '02'],
    ])
    for (const m of out.models) assert.equal(optionStandInReal(m), '109')
    assert.equal(telForModel('103332645500', 'SRG3900 CARKIT', out.models), '109332645500')
    assert.equal(telForModel('03332645500', 'SRG3900 CARKIT', out.models), '109332645500')
    assert.equal(telForModel('04400376200', 'SRG3900 DESKTOP', out.models), '109400376200')
    assert.equal(telForModel('02332645500', 'SRG3900 BIKE', out.models), '109332645500')
  })

  // The shorthand models that are not an SRG3900 get their rule back by the
  // same pass — 01 is five digits of 35506 typed as two.
  test('the other shorthand models are seeded their swap as well', () => {
    const out = mergeOptions({ models: ['TH1N', 'THR9', 'TMR 880i'] })
    assert.deepEqual(out.models.map(optionStandIns), [['01'], ['09'], ['08']])
    assert.deepEqual(out.models.map(optionStandInReal), ['35506', '20106', '7506'])
    assert.equal(telForModel('01332645500', 'TH1N', out.models), '35506332645500')
  })

  test('a model that already declares a stand-in keeps exactly what the admin set', () => {
    const out = mergeOptions({
      models: [{ name: 'SRG3900 CARKIT', prefixes: ['109', '777'], standIn: ['777'], standInReal: '109' }],
    })
    assert.deepEqual(optionStandIns(out.models[0]), ['777'])
  })

  // Moving a shorthand onto another model is a decision an upgrade must not
  // undo — the same rule the prefixes are seeded under.
  test('a shorthand another stored model claims is not handed back', () => {
    const out = mergeOptions({
      models: [{ name: 'OTHER RADIO', prefixes: ['103'], standIn: ['103'], standInReal: '500' }, 'SRG3900 CARKIT'],
    })
    assert.deepEqual(optionStandIns(out.models[0]), ['103'], "the admin's own rule stands")
    assert.deepEqual(optionStandIns(out.models[1]), ['03'], 'the car kit keeps only the shorthand still free')
  })

  // A shorthand the model does not claim as a Tel prefix selects nothing, so
  // seeding it would leave a rule rewriting a number nobody routed here.
  test('only a shorthand the model actually claims is seeded', () => {
    const partial = mergeOptions({ models: [{ name: 'SRG3900 CARKIT', prefixes: ['109', '103'] }] })
    assert.deepEqual(optionStandIns(partial.models[0]), ['103'])
    assert.equal(optionStandInReal(partial.models[0]), '109')

    const renumbered = mergeOptions({ models: [{ name: 'SRG3900 BIKE', prefixes: ['777'] }] })
    assert.deepEqual(optionStandIns(renumbered.models[0]), [], 'nothing is invented for a renumbered model')
    assert.equal(optionStandInReal(renumbered.models[0]), '')
  })

  // The shipped defaults carry the swap rule that makes the shorthand mean
  // anything: 103 selects the car kit, and 109 is what the entry stores.
  test('the shipped builds carry the stand-in rule, not just the prefixes', () => {
    const shipped = DEFAULT_OPTIONS.models.filter((m) => optionName(m).startsWith('SRG3900'))
    assert.deepEqual(shipped.map(optionStandIns), [
      ['103', '03'],
      ['104', '04'],
      ['102', '02'],
    ])
    for (const m of shipped) assert.equal(optionStandInReal(m), '109')
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

  // A Tel number selects the Model and nothing else, so an agency is never
  // given Tel prefixes — not by the defaults, and not by the seeding pass.
  test('agencies are seeded no Tel prefixes at all', () => {
    const out = mergeOptions({ agencies: ['PSD', 'CD', 'DOT'] })
    assert.deepEqual(out.agencies.map(optionPrefixes), [[], [], []])
    assert.deepEqual(mergeOptions(undefined).agencies.map(optionPrefixes).flat(), [])
  })

  // The ones every install saved while the Tel number still selected an agency.
  // Inert, not harmful, and not worth rewriting saved data over — but they must
  // not select anything, which is what telPick on the agencies list would do.
  test('a stale Tel prefix left on a stored agency is carried through untouched', () => {
    const out = mergeOptions({ agencies: [{ name: 'PSD', prefixes: ['180'] }] })
    assert.deepEqual(optionPrefixes(out.agencies[0]), ['180'], 'stored data is left as it was')
    assert.deepEqual(optionIssiPrefixes(out.agencies[0]), ['180'], 'and it still gets its ISSI ones')
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

  // 191 is shipped to CD and to PRI both, and the seeding pass hands it to each.
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

  // Sharing is still legitimate — a number cannot say which of the sharers is
  // on the bench, and a model one dropdown away from right beats an empty
  // field. No SHIPPED prefix is shared any more (the three SRG3900 builds hold
  // one each), so the rule is tested on a list of its own.
  test('a shared prefix selects the first of its owners in the list', () => {
    const shared = [
      { name: 'FIRST', prefixes: ['109'] },
      { name: 'SECOND', prefixes: ['109'] },
    ]
    assert.equal(telPick('1093324096', shared), 'FIRST')
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

  // 190/355/06 differ from their neighbours in the third digit, so a shorter
  // read would collapse ranges together. The full prefix has to be what matches.
  test('neighbouring prefixes do not bleed into each other', () => {
    assert.equal(telPick('1903324096', MODELS), 'STP9000')
    assert.equal(telPick('1913324096', MODELS), '', '191 is no model')
  })

  // A Tel number names the DEVICE. Whose radio it is comes off the ISSI, and
  // the Type off the Model — one number, one field, one source.
  describe('and nothing but the model', () => {
    const { agencies } = mergeOptions(undefined)

    test('the agencies list has nothing for a Tel number to match', () => {
      assert.equal(telPick('1804133', agencies), '', '180 no longer selects the PSD')
      assert.equal(telPick('1917670', agencies), '', '191 no longer selects the CD')
      assert.equal(telPick('2145566', agencies), '')
    })

    // The guard that matters: an install still carrying the Tel prefixes it
    // saved while this worked must not go on selecting from them.
    test('a stale Tel prefix on a stored agency is not read by the ISSI matcher', () => {
      const stale = mergeOptions({ agencies: [{ name: 'PSD', prefixes: ['180'] }] }).agencies
      assert.equal(issiPick('1804133', stale), 'PSD', 'its ISSI prefixes were seeded, and they work')
      assert.deepEqual(optionPrefixes(stale[0]), ['180'], 'the stale list is still on the record')
    })
  })
})

// The ISSI answers "whose radio is it", and it is the only number that does.
// Read against the agencies' own list, so the same digits may mean one thing
// here and something else among the models.
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
    assert.deepEqual(optionIssiPrefixes(out.agencies[0]), ['180'])
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



// 109 is really on the SRG3900 car kit, desktop and bike alike, so no number
// starting with it can say which device is on the bench. Each build takes
// shorthand of its own to be picked by, swapped back for the 109 on save.
describe('shorthand picks the SRG3900 build, 109 is what gets stored', () => {
  const models = mergeOptions({}).models

  test('each build has shorthand of its own, and each selects only itself', () => {
    assert.equal(telPick('102332645500', models), 'SRG3900 BIKE')
    assert.equal(telPick('103332645500', models), 'SRG3900 CARKIT')
    assert.equal(telPick('104400376200', models), 'SRG3900 DESKTOP')
    // The two-digit form of each reaches the same build.
    assert.equal(telPick('02332645500', models), 'SRG3900 BIKE')
    assert.equal(telPick('03332645500', models), 'SRG3900 CARKIT')
    assert.equal(telPick('04400376200', models), 'SRG3900 DESKTOP')
  })

  // Whichever shorthand was typed, the record holds the number really on the
  // radio — that is the whole point of the swap.
  test('every shorthand is stored as the 109 really on the radio', () => {
    assert.equal(telForModel('103332645500', 'SRG3900 CARKIT', models), '109332645500')
    assert.equal(telForModel('03332645500', 'SRG3900 CARKIT', models), '109332645500')
    assert.equal(telForModel('102332645500', 'SRG3900 BIKE', models), '109332645500')
    assert.equal(telForModel('04400376200', 'SRG3900 DESKTOP', models), '109400376200')
  })

  // 109 is the one prefix three models share, and that is deliberate: it is
  // what is on all three. Every other prefix still names exactly one model.
  test('109 is the only shared prefix, and it names all three builds', () => {
    const claimed = models.flatMap(optionPrefixes)
    const shared = [...new Set(claimed.filter((p, i) => claimed.indexOf(p) !== i))]
    assert.deepEqual(shared, ['109'])
    assert.deepEqual(prefixOwners('109332645500', models), {
      prefix: '109',
      names: ['SRG3900 CARKIT', 'SRG3900 DESKTOP', 'SRG3900 BIKE'],
    })
  })

  // Typing the 109 itself cannot say which build it is, so the auto-select
  // leads with the car kit — first in the list, and list order is where that
  // is decided. Said out loud here so a reordering does not pass unnoticed.
  test('a bare 109 falls to whichever build is first in the list', () => {
    assert.equal(telPick('109332645500', models), 'SRG3900 CARKIT')
  })

  test('every shipped stand-in is a Tel prefix too, or it would select nothing', () => {
    for (const m of models) {
      const claimed = optionPrefixes(m)
      for (const { standIn } of optionStandInRules(m)) {
        assert.ok(claimed.includes(standIn), `${optionName(m)} does not claim its stand-in ${standIn}`)
      }
    }
  })
})

// The swap the stand-in rules are built on: it keeps every digit that
// identifies the radio, and changes only the leading run that named the device.
describe('replaceTelPrefix', () => {
  test('swaps the leading run and nothing else', () => {
    assert.equal(replaceTelPrefix('109332645500', '109', '102'), '102332645500')
    assert.equal(replaceTelPrefix('109109109', '109', '104'), '104109109')
  })

  test('whatever spacing was typed survives', () => {
    assert.equal(replaceTelPrefix('109 332 645500', '109', '103'), '103 332 645500')
  })

  test('a number that does not start with the prefix is untouched', () => {
    assert.equal(replaceTelPrefix('102332645500', '109', '103'), '102332645500')
    assert.equal(replaceTelPrefix('', '109', '102'), '')
    assert.equal(replaceTelPrefix('-', '109', '102'), '-')
    assert.equal(replaceTelPrefix('109332', '', '102'), '109332')
  })
})

// The stand-in machinery is admin-managed: any device whose real prefix cannot
// name it can take one in Manage inputs, and a lone string is still read as a
// list of one so a stand-in saved before the field took several still works.
describe('stand-in Tel prefixes remain available to any model', () => {
  const custom = [
    { name: 'WIDGET ONE', prefixes: ['500', '404'], standIn: '404', standInReal: '500' },
    { name: 'WIDGET TWO', prefixes: ['500'] },
    'PLAIN STRING MODEL',
  ]

  test('a model that declares one has its typed prefix swapped for the real one', () => {
    assert.equal(telForModel('404123', 'WIDGET ONE', custom), '500123')
  })

  test('the same digits against another model are stored as typed', () => {
    assert.equal(telForModel('404123', 'WIDGET TWO', custom), '404123')
    assert.equal(telForModel('404123', 'PLAIN STRING MODEL', custom), '404123')
    assert.equal(telForModel('404123', 'NEVER HEARD OF IT', custom), '404123')
  })

  test('the stand-in also selects the model, once it is a Tel prefix too', () => {
    assert.equal(telPick('404123', custom), 'WIDGET ONE')
  })

  // Half a rule rewrites nothing, so half a rule is no rule.
  test('a model missing either half of the pair swaps nothing', () => {
    const half = [
      { name: 'A', prefixes: ['107'], standIn: '107' },
      { name: 'B', prefixes: ['107'], standInReal: '109' },
      { name: 'C', prefixes: ['107'], standIn: '107', standInReal: '107' },
    ]
    for (const name of ['A', 'B', 'C']) assert.equal(telForModel('107332', name, half), '107332', name)
    for (const name of ['A', 'B', 'C']) assert.deepEqual(optionStandInRules(half.find((m) => m.name === name)), [])
  })

  test('several stand-ins can share one stored prefix, longest first', () => {
    const many = [{ name: 'WIDGET', prefixes: ['500', '404', '04'], standIn: ['404', '04'], standInReal: '500' }]
    assert.deepEqual(optionStandIns(many[0]), ['404', '04'])
    // Longest first, so 404 is still reached on a model that also holds 04.
    assert.deepEqual(optionStandInRules(many[0]), [
      { standIn: '404', real: '500' },
      { standIn: '04', real: '500' },
    ])
    assert.equal(telForModel('404123', 'WIDGET', many), '500123')
    assert.equal(telForModel('04123', 'WIDGET', many), '500123')
  })

  // Written as one string rather than a list — the shape a stand-in saved
  // before the field took several is still stored in.
  test('a lone string is read as a list of one', () => {
    assert.deepEqual(optionStandIns({ name: 'X', standIn: '404', standInReal: '500' }), ['404'])
    assert.deepEqual(optionStandIns('PLAIN STRING MODEL'), [])
    assert.deepEqual(optionStandIns({ name: 'X' }), [])
  })

  test('a blank number and its stored placeholder come back as they went in', () => {
    for (const v of ['', '-', null, undefined]) {
      assert.equal(telForModel(v, 'WIDGET ONE', custom), v == null ? '' : v)
    }
  })

  test('the model is matched past case and padding, and no list is no swap', () => {
    assert.equal(telForModel('404123', ' widget one ', custom), '500123')
    assert.equal(telForModel('404123', 'WIDGET ONE', []), '404123')
    assert.equal(telForModel('404123', 'WIDGET ONE'), '404123')
  })
})

// An ISSI whose leading digits no agency claims selects nothing, so whoever
// typed it picked the agency by hand — and would have to again next time. The
// pair they entered is the mapping, so the form offers to keep it.
describe('offering to wire a new ISSI range to its agency', () => {
  const agencies = mergeOptions({}).agencies

  test('an unclaimed range and a real agency is an offer', () => {
    assert.deepEqual(issiWireOffer('77712345', 'DOT', agencies), { prefix: '777', agency: 'DOT' })
  })

  // A range something already answers to is not new. An ISSI that selects the
  // WRONG agency is a different question — moving a prefix is an admin's call.
  test('a range an agency already claims is not offered', () => {
    assert.equal(issiWireOffer('18012345', 'PSD', agencies), null)
    assert.equal(issiWireOffer('18012345', 'DOT', agencies), null)
    assert.equal(issiWireOffer('19112345', 'BG', agencies), null)
  })

  test('nothing is offered without both halves of the pair', () => {
    assert.equal(issiWireOffer('', 'DOT', agencies), null)
    assert.equal(issiWireOffer('77712345', '', agencies), null)
    assert.equal(issiWireOffer('77712345', null, agencies), null)
    assert.equal(issiWireOffer(null, 'DOT', agencies), null)
  })

  // Fewer digits than a prefix takes cannot name a range.
  test('a number too short to hold a prefix is not offered', () => {
    assert.equal(issiWireOffer('77', 'DOT', agencies), null)
    assert.deepEqual(issiWireOffer('777', 'DOT', agencies), { prefix: '777', agency: 'DOT' })
  })

  // 00 is not an agency range — it is the whole of "nothing happened today".
  test('the no-activity ISSI and agency are never offered', () => {
    assert.equal(issiWireOffer('00', 'DOT', agencies), null)
    assert.equal(issiWireOffer('77712345', 'No Activity', agencies), null)
  })

  // An agency the list has never heard of has no row to write the prefix onto.
  test('an agency the list does not hold is not offered', () => {
    assert.equal(issiWireOffer('77712345', 'NOT AN AGENCY', agencies), null)
  })

  test('the agency is matched past case and padding', () => {
    assert.deepEqual(issiWireOffer('77712345', ' dot ', agencies), { prefix: '777', agency: 'dot' })
  })

  describe('taking the offer up', () => {
    test('the prefix joins that agency, and only that agency', () => {
      const out = withIssiPrefix(agencies, 'DOT', '777')
      const dot = out.find((a) => optionName(a) === 'DOT')
      assert.deepEqual(issiPrefixesOf(dot), ['777'])
      // Everything else is exactly as it was — same names, same order.
      assert.deepEqual(optionNames(out), optionNames(agencies))
      assert.deepEqual(issiPrefixesOf(out.find((a) => optionName(a) === 'PSD')), ['180'])
    })

    test('an agency that already holds prefixes keeps them and gains this one', () => {
      const out = withIssiPrefix(agencies, 'PSD', '777')
      assert.deepEqual(issiPrefixesOf(out.find((a) => optionName(a) === 'PSD')), ['180', '777'])
    })

    test('adding a prefix an agency already holds changes nothing', () => {
      const out = withIssiPrefix(agencies, 'PSD', '180')
      assert.deepEqual(issiPrefixesOf(out.find((a) => optionName(a) === 'PSD')), ['180'])
    })

    test('a name or prefix that cannot be used leaves the list alone', () => {
      assert.deepEqual(withIssiPrefix(agencies, '', '777'), agencies)
      assert.deepEqual(withIssiPrefix(agencies, 'DOT', '7'), agencies, 'one digit is not a prefix')
      assert.deepEqual(withIssiPrefix(agencies, 'NOT AN AGENCY', '777'), agencies)
      assert.deepEqual(withIssiPrefix(undefined, 'DOT', '777'), [])
    })

    // The whole point: the next number of that range selects the agency itself.
    test('the range selects the agency afterwards, and did not before', () => {
      assert.equal(issiPick('77712345', agencies), '')
      assert.equal(issiPick('77712345', withIssiPrefix(agencies, 'DOT', '777')), 'DOT')
    })
  })
})
