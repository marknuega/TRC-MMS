import { useState } from 'react'
import {
  CATEGORIES,
  CHART_TOGGLES,
  PREFIX_RE,
  PARTS_RE,
  VARIANT_RE,
  TECH_ID_RE,
  TECH_INITIALS2_RE,
  TECH_INITIALS3_RE,
  issueCode,
  issueModels,
  issueModelsOverlap,
  issueNarrowed,
  modelKey,
  issueNameForModel,
  issueNameOverrides,
  withIssueName,
  issueName,
  issueParts,
  issueVariant,
  materialName,
  materialDesc,
  companyName,
  companyCode,
  normalizeCompany,
  optionName,
  optionNames,
  prefixIndex,
  optionPrefixes,
  optionIssiPrefixes,
  optionStandIns,
  optionStandInReal,
  optionFullForm,
  technicianName,
  technicianId,
  technicianInitials2,
  technicianInitials3,
} from './options'
import { FALLBACK, useCodeMap } from './codes'
import { deviceLetterFor, parsePairCode } from './pairCode.js'

// How many Model Codes fit on a card before the rest become a count.
const MAX_PAIR_BADGES = 4

// Which models a part appears on is stored on the part, and shown as a grid:
// parts down, devices across. An untouched part is ticked everywhere, because
// that is what it means — every device — and narrowing it is unticking the
// ones it was never on. Stored the other way round, as the list of devices it
// IS on, with the whole set stored as none: a part nobody has narrowed keeps
// the shape it has always had.
const withModels = (value, models) => {
  const base = typeof value === 'string' ? { name: value } : { ...value }
  // `null` is "every device", stored by leaving the key off — the state every
  // part starts in. An array is stored as it is, empty included: a row cleared
  // to none is on the way to being ticked back up, and must not read as the
  // untouched state it looks like.
  if (models === null) delete base.models
  else base.models = models
  // A plain string that gained nothing stays a plain string.
  return typeof value === 'string' && !base.models ? value : base
}
import SearchSelect from './SearchSelect'
import { advanceOnEnter } from './focusNav'

// Add / edit / delete the dropdown option lists. Changes are pushed up via
// onChange(categoryKey, newList); the parent persists them to the backend.
// onToggleChart(key, bool) flips a pie-chart's visibility.
export default function ManageInputs({
  options,
  onChange,
  onToggleChart,
  pairCodesByPart,
  onAssignPairCode, // async (name, letter) => string|'' — puts the item on that model's shelf
  deviceLetters = [], // [{ letter, label }] — the devices the code map names
  embedded = false,
}) {
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [cat, setCat] = useState(CATEGORIES[0].key)
  const [newValue, setNewValue] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newParts, setNewParts] = useState('')
  const [newVariant, setNewVariant] = useState('')
  const [newPrefixes, setNewPrefixes] = useState('')
  const [newIssiPrefixes, setNewIssiPrefixes] = useState('')
  const [newStandIn, setNewStandIn] = useState('')
  const [newStandInReal, setNewStandInReal] = useState('')
  const [newFullForm, setNewFullForm] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newId, setNewId] = useState('')
  const [newInitials2, setNewInitials2] = useState('')
  const [newInitials3, setNewInitials3] = useState('')
  const [editIndex, setEditIndex] = useState(-1)
  const [editValue, setEditValue] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editParts, setEditParts] = useState('')
  const [editVariant, setEditVariant] = useState('')
  // The device this part is stocked for. Not part of the option row being
  // edited — it belongs to the inventory item — so it is held apart from the
  // editFields the rest of this form is built from, and `Was` is what lets
  // Save tell a device that was CHOSEN from one that was merely shown.
  // Which models a part appears on, carried through an edit of the card so
  // renaming a part does not quietly re-open it to every device. `null` is
  // "not narrowed", an array is the devices it is on — see withModels.
  const [newModels, setNewModels] = useState(null)
  const [editModels, setEditModels] = useState(null)
  // Per-device name overrides for the open row: { <model>: <part name> }. One
  // code can be a different physical part per radio, and this is where that is
  // said. Only the exceptions live here — a device left blank is called what
  // the row itself is called.
  const [editNames, setEditNames] = useState({})
  const [editLetter, setEditLetter] = useState('')
  const [editLetterWas, setEditLetterWas] = useState('')
  const [editPrefixes, setEditPrefixes] = useState('')
  const [editIssiPrefixes, setEditIssiPrefixes] = useState('')
  const [editStandIn, setEditStandIn] = useState('')
  const [editStandInReal, setEditStandInReal] = useState('')
  const [editFullForm, setEditFullForm] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editId, setEditId] = useState('')
  const [editInitials2, setEditInitials2] = useState('')
  const [editInitials3, setEditInitials3] = useState('')
  const [notice, setNotice] = useState('')
  // Which field the current notice is about, so it can be outlined in red
  // rather than leaving the reader to match a message to a box themselves.
  const [noticeField, setNoticeField] = useState('')

  // Only to describe what a code already means in the shared vocabulary — the
  // issue type itself carries no device.
  const { map } = useCodeMap()

  // Materials carry a separate Description; Issue types carry a parts code +
  // variant, and their description IS their name; Models and Agencies carry the
  // Tel number prefixes that select them; every other list is a string.
  const isMaterials = cat === 'materials'
  // A company carries the SKU prefix its stock is shelved under (MOT, X1). It
  // is what routes a fault to the right company's shelf when a report is saved
  // — without it the companies are still listed, still printed and still
  // totalled apart, but stock comes off whichever shelf answers first.
  const isCompanies = cat === 'companies'
  const isIssues = cat === 'issueTypes'
  const isTechnicians = cat === 'technicians'
  const isModels = cat === 'models'
  const isAgencies = cat === 'agencies'
  // Each number selects from one list and one only: the Tel number names the
  // Model, the ISSI names the Agency. Agencies used to carry Tel prefixes as
  // well; the field is gone rather than left inert, because one that is still
  // shown and still saved but no longer selects anything looks like it works.
  const hasTelPrefixes = isModels
  const hasIssiPrefixes = isAgencies
  // A stand-in belongs to the number that selects a device, so it rides with
  // the Tel prefixes and only the Models list has one. An agency is picked by
  // its own ISSI and has nothing to stand in for.
  const hasStandIn = isModels
  // Carries prefixes of SOME kind — the two behave identically here (same
  // rules, same validation, same stored shape), so everything that does not
  // care which number it is asks this rather than naming either one.
  const hasPrefixes = hasTelPrefixes || hasIssiPrefixes
  const list = options[cat] ?? []
  // Issue types with a claimed CDS code display in ascending code order
  // (parts number, then variant letter) — reading order left to right,
  // top to bottom, not the order they happened to be added in. Uncoded
  // items sort after every coded one, keeping their original relative
  // order among themselves (stable sort). Every other category keeps its
  // stored order, unchanged. `i` stays the item's real index into `list`
  // — edit/save/delete are index-based — only the display order changes.
  const displayList = isIssues
    ? list
        .map((value, i) => ({ value, i }))
        .sort((a, b) => {
          const ca = issueCode(a.value)
          const cb = issueCode(b.value)
          if (ca && cb) {
            const partsDiff = Number(issueParts(a.value)) - Number(issueParts(b.value))
            return partsDiff !== 0 ? partsDiff : issueVariant(a.value).localeCompare(issueVariant(b.value))
          }
          if (ca) return -1
          if (cb) return 1
          return 0
        })
    : list.map((value, i) => ({ value, i }))
  const nameOf = (v) =>
    isCompanies
      ? companyName(v)
      : isMaterials
        ? materialName(v)
        : isIssues
          ? issueName(v)
          : isTechnicians
            ? technicianName(v)
            : hasPrefixes
              ? optionName(v)
              : String(v)
  const descOf = (v) => (isMaterials ? materialDesc(v) : '')

  // What an agency's acronym stands for. Two sources, in this order:
  //
  //   1. the option's own `fullForm`, typed in the field below
  //   2. the shared code map — the same list Code Reference prints under
  //      "Agencies (verification)"
  //
  // The map is a fallback rather than the source so the agencies it already
  // knows read properly without anyone re-typing them, while an installation
  // can still name an agency the map has never heard of. What is set here wins,
  // the same way an Issue type's own code outranks Code Map's lookup.
  //
  // Matched past case and punctuation, for the reason norm() does it in codes.js.
  const codeKey = (v) =>
    String(v ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
  const mappedFullForms = {}
  for (const [code, full] of Object.entries(map?.agencies ?? FALLBACK.agencies ?? {})) {
    mappedFullForms[codeKey(code)] = full
  }
  const mappedFullForm = (v) => (isAgencies ? (mappedFullForms[codeKey(nameOf(v))] ?? '') : '')
  const fullFormOf = (v) => (isAgencies ? optionFullForm(v) || mappedFullForm(v) : '')
  // Prefixes are typed as one free-text field ("355, 06") because a model may
  // hold several and nobody knows in advance how many. Any run of non-digits
  // separates them, so a comma, a space or both all work.
  const parsePrefixes = (s) => [
    ...new Set(
      String(s ?? '')
        .split(/\D+/)
        .filter(Boolean),
    ),
  ]
  const makeItem = (name, f) => {
    if (isIssues) {
      // The device list is not edited on the card — it is a grid of its own —
      // so it is carried through untouched. `null` means the part was never
      // narrowed and the key stays off; an array is stored as it is, EMPTY
      // included, or a part cleared to no devices would come back from a
      // rename offered on every one of them.
      // Overrides applied through withIssueName so the "same as the row's own
      // name" case is dropped rather than stored — the row already says it,
      // and a stored copy is a second thing to drift.
      let item = withModels({ name, parts: f.parts.trim(), variant: f.variant.trim().toUpperCase() }, f.models ?? null)
      for (const [model, partName] of Object.entries(f.names ?? {})) {
        item = withIssueName(item, model, partName)
      }
      return item
    }
    if (isMaterials) return { name, description: f.desc.trim() }
    // Stays a plain string when no code is given, exactly as every companies
    // list was before this field existed — nothing to store, so nothing stored.
    if (isCompanies) {
      const code = normalizeCompany(f.code)
      return code ? { name, code } : name
    }
    if (hasPrefixes) {
      // Built fresh from the fields on show, so an agency saved here also
      // sheds the inert `prefixes` a Tel number no longer reads.
      const prefixes = hasTelPrefixes ? parsePrefixes(f.prefixes) : []
      const issiPrefixes = hasIssiPrefixes ? parsePrefixes(f.issiPrefixes) : []
      const fullForm = isAgencies ? f.fullForm.trim() : ''
      // Both halves or neither — half a stand-in rewrites nothing, so storing
      // one on its own is a trap (the call codeProblem makes about a parts code
      // with no variant). validated by standInProblem before we get here.
      const standIn = hasStandIn ? parsePrefixes(f.standIn) : []
      const standInReal = hasStandIn ? f.standInReal.replace(/\D/g, '') : ''
      const pair = standIn.length && standInReal ? { standIn, standInReal } : {}
      // A model with no prefixes stays a plain string, exactly as it was
      // before this field existed — nothing to store, so nothing stored. An
      // agency given only some of its three optional fields stores only those,
      // for the same reason.
      if (!prefixes.length && !issiPrefixes.length && !fullForm && !pair.standIn?.length) return name
      return {
        name,
        ...(prefixes.length && { prefixes }),
        ...(issiPrefixes.length && { issiPrefixes }),
        ...pair,
        ...(fullForm && { fullForm }),
      }
    }
    if (isTechnicians) {
      const idT = f.id.trim()
      const i2 = f.initials2.trim().toUpperCase()
      const i3 = f.initials3.trim().toUpperCase()
      if (!idT && !i2 && !i3) return name
      return { name, ...(idT && { id: idT }), ...(i2 && { initials2: i2 }), ...(i3 && { initials3: i3 }) }
    }
    return name
  }
  const exists = (value, exceptIndex = -1) =>
    list.some((v, i) => i !== exceptIndex && nameOf(v).toLowerCase() === value.toLowerCase())

  // What is wrong with a technician ID, or '' when it is usable (or blank —
  // blank is allowed, for a technician who never files by WhatsApp).
  function techIdProblem(id, exceptIndex = -1) {
    if (!isTechnicians) return ''
    const v = id.trim()
    if (!v) return ''
    if (!TECH_ID_RE.test(v)) return `"${v}" is not a valid ID — digits only, e.g. 3.`
    const clash = list.findIndex((it, idx) => idx !== exceptIndex && technicianId(it) === v)
    if (clash >= 0) return `ID ${v} is already used by "${nameOf(list[clash])}".`
    return ''
  }

  // Same shape of check as techIdProblem, for the two initials fields.
  function initialsProblem(re, getter, label, example, value, exceptIndex = -1) {
    if (!isTechnicians) return ''
    const v = value.trim().toUpperCase()
    if (!v) return ''
    if (!re.test(v)) return `"${v}" is not a valid ${label} — exactly ${example.length} letters, e.g. ${example}.`
    const clash = list.findIndex((it, idx) => idx !== exceptIndex && getter(it) === v)
    if (clash >= 0) return `${label} ${v} is already used by "${nameOf(list[clash])}".`
    return ''
  }
  const initials2Problem = (v, exceptIndex = -1) =>
    initialsProblem(TECH_INITIALS2_RE, technicianInitials2, '2-letter initial', 'MA', v, exceptIndex)
  const initials3Problem = (v, exceptIndex = -1) =>
    initialsProblem(TECH_INITIALS3_RE, technicianInitials3, '3-letter initial', 'MRA', v, exceptIndex)

  // What is wrong with a prefix list, or '' when it is usable (or blank — blank
  // is allowed, for a model no number identifies). Both lists have the same
  // shape and the same rule, so `kind` only names the number in the message.
  function prefixProblem(value, kind = 'Tel') {
    if (!hasPrefixes) return ''
    const bad = parsePrefixes(value).find((p) => !PREFIX_RE.test(p))
    if (!bad) return ''
    return `"${bad}" is not ${kind === 'Tel' ? 'a Tel' : 'an ISSI'} prefix — 2 to 6 digits, e.g. 190. A single digit would claim a tenth of every number there is.`
  }

  // Which other models already answer to the prefixes being typed. Not an
  // error: 109 is genuinely all three SRG3900 builds. It is said out loud so
  // sharing is a decision rather than a surprise, and so it is clear which of
  // the sharers a number will actually land on.
  function prefixShareHint(value, get = optionPrefixes) {
    const others = prefixIndex(list, get)
    const shared = parsePrefixes(value).filter((p) => PREFIX_RE.test(p) && others[p]?.length)
    if (!shared.length) return ''
    const who = shared.map((p) => `${p} is also ${others[p].join(', ')}`).join('; ')
    return `${who} — whichever comes first in this list is the one a number selects.`
  }

  // What is wrong with a stand-in pair, or '' when it is usable (or blank —
  // most models need none). Both halves or neither, for the same reason a parts
  // code needs its variant: one on its own rewrites nothing.
  function standInProblem(standIn, real, exceptIndex = -1) {
    if (!hasStandIn) return ''
    // A list, like the Tel prefixes above: 103 and 03 are one rule written
    // twice, and both are typed to reach the same model.
    const standIns = parsePrefixes(standIn)
    const b = String(real ?? '').replace(/\D/g, '')
    if (!standIns.length && !b) return ''
    if (!standIns.length) return 'Add a Stand-in prefix, or clear "Stored as".'
    if (!b) return 'Add what the stand-ins are "Stored as", or clear them.'
    const bad = standIns.find((a) => !PREFIX_RE.test(a))
    if (bad) return `"${bad}" is not a prefix — 2 to 6 digits, e.g. 404.`
    if (!PREFIX_RE.test(b)) return `"${b}" is not a prefix — 2 to 6 digits, e.g. 500.`
    const itself = standIns.find((a) => a === b)
    if (itself)
      return `${itself} would be stored as itself — a stand-in has to differ from the number it stands in for.`
    // Another model's stand-in would rewrite the same digits to something else
    // as soon as that model were picked. Two rules for one prefix is not a
    // sharing decision like a Tel prefix is — it is two answers to one question.
    for (const a of standIns) {
      const clash = list.findIndex((it, idx) => idx !== exceptIndex && optionStandIns(it).includes(a))
      if (clash >= 0) return `${a} is already the stand-in for "${nameOf(list[clash])}".`
    }
    return ''
  }

  // Whether the stand-in will actually select this model. It only does if the
  // model also claims it as a Tel prefix — the swap happens on save, the
  // selection on typing, and they are two different lists. Said out loud rather
  // than enforced: rewriting without auto-selecting is a legitimate thing to
  // want, and silently adding the prefix would edit a field nobody typed in.
  function standInHint(standIn, prefixes) {
    const standIns = parsePrefixes(standIn).filter((a) => PREFIX_RE.test(a))
    if (!standIns.length) return ''
    const claimed = parsePrefixes(prefixes)
    const orphans = standIns.filter((a) => !claimed.includes(a))
    if (!orphans.length) return `Typing ${standIns.join(' or ')} selects this model, and saves as the real prefix.`
    const one = orphans.length === 1
    return `${orphans.join(' and ')} ${one ? 'is not one of' : 'are not'} this model's Tel prefixes, so typing ${
      one ? 'it' : 'them'
    } selects nothing — add ${one ? 'it' : 'them'} above to have ${one ? 'it' : 'them'} select this model too.`
  }

  // The devices a row covers, spelled out — its own list, or every device when
  // nobody has narrowed it, which is what un-narrowed means.
  const coveredModels = (v) => (issueNarrowed(v) ? issueModels(v) : deviceModels)

  // The devices two rows would both answer for. Named rather than counted,
  // because "already used on TH1N" is a message someone can act on and "these
  // overlap" is not.
  const overlapModels = (a, b) => {
    const keys = new Set(coveredModels(b).map(modelKey))
    return coveredModels(a).filter((m) => keys.has(modelKey(m)))
  }

  // What is wrong with a parts + variant pair, or '' when it is usable. Both
  // halves or neither: half a code decodes to nothing, so storing one is a trap.
  //
  // A code is NOT unique on its own any more — it is unique per device. 44A is
  // Battery 1590 on a TH1n and Battery 1880 on an STP9000: one parts code, two
  // real batteries, told apart by the letter the technician already writes
  // (H44A, T44A). So two rows may share a code as long as no device is claimed
  // twice; a device with two answers is the one thing no decode can resolve.
  function codeProblem(parts, variant, models, exceptIndex = -1) {
    if (!isIssues) return ''
    const p = parts.trim()
    const v = variant.trim().toUpperCase()
    if (!p && !v) return ''
    if (!p) return 'Add the Parts Code (2 digits, e.g. 19), or clear the Variant.'
    if (!v) return 'Add the Variant (1 letter, e.g. B), or clear the Parts Code.'
    if (!PARTS_RE.test(p)) return `"${p}" is not a parts code — it must be exactly 2 digits, e.g. 19.`
    if (!VARIANT_RE.test(v)) return `"${v}" is not a variant — it must be a single letter, e.g. B.`
    const code = p + v
    // The row as it would be SAVED — an absent list is "every device", which is
    // what overlaps everything, so the two states must not be flattened here.
    const mine = Array.isArray(models) ? { models } : {}
    const clash = list.findIndex(
      (i, idx) => idx !== exceptIndex && issueCode(i) === code && issueModelsOverlap(i, mine),
    )
    if (clash >= 0) {
      const other = list[clash]
      const shared = overlapModels(other, mine)
      const held = `${code} is already used by "${nameOf(other)}"`
      if (!issueNarrowed(other)) {
        return `${held}, which covers every device. Tick the devices it is really on and ${code} is free for the rest.`
      }
      if (!Array.isArray(models)) {
        return `${held} on ${shared.join(', ')}. Tick the devices THIS part is on — one that is on every device cannot share a code.`
      }
      return `${held} on ${shared.join(', ')}. Untick ${shared.length === 1 ? 'that device' : 'those devices'} on one row or the other — a device can only have one ${code}.`
    }
    return ''
  }

  // Whether the parts number being typed already means something, so defining
  // it as something else is a visible decision rather than a silent one — a
  // number in use decodes technicians' existing reports.
  function codeInUseHint(parts) {
    const p = parts.trim()
    if (!PARTS_RE.test(p)) return ''
    const part = partsName(p)
    if (!part) return `${p} is free — nothing uses it yet.`
    return `${p} is already in use for ${part} — defining it here replaces that.`
  }

  function flash(msg, field = '') {
    setNotice(msg)
    setNoticeField(field)
    setTimeout(() => {
      setNotice('')
      setNoticeField('')
    }, 4000)
  }

  // Which input a validation message belongs to. The checks return prose, so
  // the field is derived from which check produced it rather than parsed back
  // out of the sentence.
  const problemFor = (f, exceptIndex = -1) => {
    const code = codeProblem(f.parts, f.variant, f.models, exceptIndex)
    if (code) return [code, 'code']
    const prefix = hasTelPrefixes ? prefixProblem(f.prefixes) : ''
    if (prefix) return [prefix, 'prefixes']
    const issi = hasIssiPrefixes ? prefixProblem(f.issiPrefixes, 'ISSI') : ''
    if (issi) return [issi, 'issiPrefixes']
    const standIn = standInProblem(f.standIn, f.standInReal, exceptIndex)
    if (standIn) return [standIn, 'standIn']
    const tech = techIdProblem(f.id, exceptIndex)
    if (tech) return [tech, 'id']
    const a = initials2Problem(f.initials2, exceptIndex)
    if (a) return [a, 'initials2']
    const b = initials3Problem(f.initials3, exceptIndex)
    if (b) return [b, 'initials3']
    return ['', '']
  }

  // The extra fields of the two rows, gathered so makeItem/problemFor take one
  // argument each instead of a positional list nobody could read at a glance.
  const newFields = {
    desc: newDesc,
    parts: newParts,
    models: newModels,
    names: {},
    variant: newVariant,
    prefixes: newPrefixes,
    issiPrefixes: newIssiPrefixes,
    standIn: newStandIn,
    standInReal: newStandInReal,
    fullForm: newFullForm,
    code: newCode,
    id: newId,
    initials2: newInitials2,
    initials3: newInitials3,
  }
  const editFields = {
    desc: editDesc,
    parts: editParts,
    models: editModels,
    names: editNames,
    variant: editVariant,
    prefixes: editPrefixes,
    issiPrefixes: editIssiPrefixes,
    standIn: editStandIn,
    standInReal: editStandInReal,
    fullForm: editFullForm,
    code: editCode,
    id: editId,
    initials2: editInitials2,
    initials3: editInitials3,
  }

  // The devices a part can be ticked against: the models the code map names a
  // letter for. "For Record Purpose Only." is a real Model on a real entry and
  // is not a device, so it is not a column.
  const deviceModels = optionNames(options.models).filter((m) =>
    deviceLetterFor(m, map?.equipmentCodes ?? FALLBACK.equipmentCodes),
  )

  // The devices a row is currently ticked for. An untouched part is ticked
  // everywhere, because that is what it means.
  const modelsTickedOn = (value) => (issueNarrowed(value) ? issueModels(value) : deviceModels)

  // The device letter a model is written by, for showing the code a part gets
  // on it. Same lookup deviceModels filtered on, so every model listed there
  // has one.
  const letterOf = (model) => deviceLetterFor(model, map?.equipmentCodes ?? FALLBACK.equipmentCodes) || ''

  // What the parts list calls a number — "Fuses" over 10, "Knobs" over 41. The
  // card is headed by the number and its variants; this is the word for the
  // family they are variants OF, which is the one thing the head could not say.
  const partsName = (parts) => (map?.components ?? FALLBACK.components)[String(parts ?? '').trim()] ?? ''

  // The code one device gives this part+variant — H + 99 + A = H99A. Shown on
  // the device's own row, because a code read off the row beats one assembled
  // from three separate fields in somebody's head. '' while either half is
  // still half-typed: a partial code is not a code.
  /**
   * The per-device breakdown a card shows: [{ model, code, name }].
   *
   * Empty when there is nothing the single code chip does not already say —
   * an unnarrowed part called the same thing on every device. A part that is
   * narrowed, or that goes by a different name somewhere, has rows.
   */
  /**
   * One row of the list: the editor when this is the open row, the card
   * otherwise.
   *
   * Lifted out of the list so it can be rendered inside a GROUP as easily as
   * on its own. Every variant of a parts code now shares one card, and the
   * card is a real element rather than a run of siblings — .manage-list is a
   * multi-column grid, so siblings flow across columns and a card drawn by
   * joining their borders would come apart at every column break.
   *
   * `i` stays the row's index into `list`: edit, save and delete are keyed on
   * it, and grouping must not disturb that.
   */
  const rowBody = (value, i) => (
    <>
      {editIndex === i ? (
        <>
          {/* Enter walks this row's fields and saves from the last. */}
          <div className="edit-fields" onKeyDown={(e) => advanceOnEnter(e, saveEdit)}>
            {isIssues && (
              <div className="edit-code-row">
                {/* Which devices use this part, beside the code that
                                names it — the two halves of a Model Code in the
                                one place, so the codes it makes (T99C, C99C) can
                                be read off rather than assembled in somebody's
                                head. Writes the SAME field the grid below ticks;
                                they are two views of one answer, not two answers.

                                Everything starts ticked, which is what a part
                                nobody has narrowed means. */}
                {deviceModels.length > 0 && (
                  <fieldset className="field-models">
                    <legend>Models that use this part</legend>
                    <div className="model-rows">
                      {deviceModels.map((m) => {
                        const on = (editModels ?? deviceModels).includes(m)
                        return (
                          <div key={m} className={on ? 'model-row on' : 'model-row'}>
                            <label className="model-tick" title={m}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleEditModel(m)}
                                onKeyDown={cancelOnEscape}
                              />
                              <span className="model-tick-letter">{letterOf(m)}</span>
                              <span className="model-tick-name">{m}</span>
                            </label>
                            {/* The code this device gives the part. */}
                            <span className="model-row-code">{on ? codeFor(m, editParts, editVariant) : ''}</span>
                            {/* What the part is CALLED here. Blank is
                                            "same as the row's own name", which is
                                            most devices — so the placeholder
                                            shows that name rather than leaving
                                            the box looking unanswered. */}
                            {on && (
                              <input
                                className="edit-input model-row-name"
                                value={editNames[m] ?? ''}
                                onChange={(e) =>
                                  setEditNames((prev) => {
                                    const next = { ...prev }
                                    if (e.target.value.trim()) next[m] = e.target.value
                                    else delete next[m]
                                    return next
                                  })
                                }
                                onKeyDown={cancelOnEscape}
                                placeholder={editValue || 'same as above'}
                                aria-label={`What this part is called on ${m}`}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </fieldset>
                )}
                <label className="field-code">
                  Parts Code
                  <input
                    className="edit-input"
                    value={editParts}
                    onChange={(e) => setEditParts(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    onKeyDown={cancelOnEscape}
                    placeholder="19"
                    inputMode="numeric"
                  />
                </label>
                <label className="field-code">
                  Variant
                  <input
                    className="edit-input"
                    value={editVariant}
                    onChange={(e) =>
                      setEditVariant(
                        e.target.value
                          .replace(/[^A-Za-z]/g, '')
                          .slice(0, 1)
                          .toUpperCase(),
                      )
                    }
                    onKeyDown={cancelOnEscape}
                    placeholder="B"
                  />
                </label>
                {/* Where the STOCK sits, which is a different
                                question from which models use the part: a code
                                can be right on four devices while the box lives
                                on one shelf. Single on purpose — an item carries
                                one Model Code, so pointing it at two shelves is
                                not a thing that can be stored. */}
                {deviceLetters.length > 0 && (
                  <label className="field-code">
                    Stock shelf
                    <select
                      className="edit-input"
                      value={editLetter}
                      onChange={(e) => setEditLetter(e.target.value)}
                      onKeyDown={cancelOnEscape}
                      title="Move this part's stock onto one model's shelf. Leave as is to touch no inventory."
                    >
                      <option value="">— leave as is —</option>
                      {deviceLetters.map((d) => (
                        <option key={d.letter} value={d.letter}>
                          {d.letter} — {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {hasPrefixes && (
              <div className="edit-code-row">
                {hasTelPrefixes && (
                  <label className="field-code field-prefix">
                    Tel prefixes
                    <input
                      className="edit-input"
                      value={editPrefixes}
                      onChange={(e) => setEditPrefixes(e.target.value.replace(/[^\d,\s]/g, ''))}
                      onKeyDown={cancelOnEscape}
                      placeholder="355, 06"
                      inputMode="numeric"
                    />
                  </label>
                )}
                {hasStandIn && (
                  <>
                    <label className="field-code field-prefix">
                      Stand-in prefixes
                      <input
                        className="edit-input"
                        value={editStandIn}
                        onChange={(e) => setEditStandIn(e.target.value.replace(/[^\d,\s]/g, ''))}
                        onKeyDown={cancelOnEscape}
                        placeholder="103, 03"
                        inputMode="numeric"
                      />
                    </label>
                    <label className="field-code">
                      Stored as
                      <input
                        className="edit-input"
                        value={editStandInReal}
                        onChange={(e) => setEditStandInReal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        onKeyDown={cancelOnEscape}
                        placeholder="109"
                        inputMode="numeric"
                      />
                    </label>
                  </>
                )}
                {hasIssiPrefixes && (
                  <label className="field-code field-prefix">
                    ISSI prefixes
                    <input
                      className="edit-input"
                      value={editIssiPrefixes}
                      onChange={(e) => setEditIssiPrefixes(e.target.value.replace(/[^\d,\s]/g, ''))}
                      onKeyDown={cancelOnEscape}
                      placeholder="180, 214"
                      inputMode="numeric"
                    />
                  </label>
                )}
              </div>
            )}
            {isTechnicians && (
              <div className="edit-code-row">
                <label className="field-code">
                  Tech ID
                  <input
                    className="edit-input"
                    value={editId}
                    onChange={(e) => setEditId(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={cancelOnEscape}
                    placeholder="1"
                    inputMode="numeric"
                  />
                </label>
                <label className="field-code">
                  2-Letter Initial
                  <input
                    className="edit-input"
                    value={editInitials2}
                    onChange={(e) =>
                      setEditInitials2(
                        e.target.value
                          .replace(/[^A-Za-z]/g, '')
                          .slice(0, 2)
                          .toUpperCase(),
                      )
                    }
                    onKeyDown={cancelOnEscape}
                    placeholder="MA"
                  />
                </label>
                <label className="field-code">
                  3-Letter Initial
                  <input
                    className="edit-input"
                    value={editInitials3}
                    onChange={(e) =>
                      setEditInitials3(
                        e.target.value
                          .replace(/[^A-Za-z]/g, '')
                          .slice(0, 3)
                          .toUpperCase(),
                      )
                    }
                    onKeyDown={cancelOnEscape}
                    placeholder="MRA"
                  />
                </label>
              </div>
            )}
            <input
              className="edit-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={cancelOnEscape}
              placeholder={
                isMaterials ? 'Material name' : isIssues ? 'Description' : isTechnicians ? 'Technician name' : undefined
              }
              autoFocus
            />
            {isMaterials && (
              <input
                className="edit-input"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onKeyDown={cancelOnEscape}
                placeholder="Description (optional)"
              />
            )}
            {isAgencies && (
              <input
                className="edit-input"
                value={editFullForm}
                onChange={(e) => setEditFullForm(e.target.value)}
                onKeyDown={cancelOnEscape}
                placeholder="Full form (optional)"
                aria-label="Full form"
              />
            )}
            {isCompanies && (
              <input
                className="edit-input"
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                onKeyDown={cancelOnEscape}
                placeholder="Stock code (MOT)"
                aria-label="Stock code"
              />
            )}
          </div>
          <div className="manage-item-actions">
            <button type="button" onClick={saveEdit}>
              Save
            </button>
            <button type="button" className="ghost" onClick={() => setEditIndex(-1)}>
              Cancel
            </button>
            {/* Delete lives inside Edit so it can't be hit by accident. */}
            <button type="button" className="danger" onClick={() => remove(i)}>
              Delete
            </button>
          </div>
        </>
      ) : (
        <>
          <span className={`manage-item-label${isIssues && perDeviceRows(value).length > 0 ? ' with-devices' : ''}`}>
            {/* The VARIANT alone, because the card head above already says
                which parts code these are variants of. Repeating it on every
                row — 99A, 99B, 99C under a head reading 99 — spent the width
                that makes the letters line up, and buried the one character
                that actually differs between the rows. The full code stays in
                the title, and on every badge that leaves this card. */}
            {isIssues && issueCode(value) && (
              <span className="manage-item-code variant-code" title={issueCode(value)}>
                {issueVariant(value)}
              </span>
            )}
            {/* The Model Codes this part is STOCKED under — the
                            parts code beside it says what the part is, these say
                            whose shelves it sits on. Read from inventory, not
                            from this list: a code here is claimed without a
                            device on purpose (see the note above the Add row),
                            and that stays true. A part on no shelf shows none,
                            which is most of them until the Model Codes are set.
                            Capped, because a part stocked for every radio would
                            otherwise bury the name under ten badges.

                            Only while the part is UNNARROWED. Once somebody has
                            said which devices use it, that answer is the one the
                            card owes them, and these would sit above it
                            contradicting it — showing R for a THR9 that was
                            deliberately left unticked, because a shelf somewhere
                            still holds one. That is a real thing to know and the
                            wrong place to learn it: this row is where the
                            narrowing is decided, not where stock is audited. The
                            per-device rows below replace them, and say more —
                            each device's code AND what the part is called there. */}
            {isIssues &&
              perDeviceRows(value).length === 0 &&
              (pairCodesByPart?.get(nameOf(value).trim().toUpperCase()) ?? []).slice(0, MAX_PAIR_BADGES).map((code) => (
                <span key={code} className="issue-pair-code" title={`Model Code ${code}`}>
                  {parsePairCode(code)?.provisional ? parsePairCode(code).letter : code}
                </span>
              ))}
            {isIssues &&
              perDeviceRows(value).length === 0 &&
              (pairCodesByPart?.get(nameOf(value).trim().toUpperCase()) ?? []).length > MAX_PAIR_BADGES && (
                <span
                  className="issue-pair-code"
                  title={(pairCodesByPart?.get(nameOf(value).trim().toUpperCase()) ?? []).join(', ')}
                >
                  +{(pairCodesByPart?.get(nameOf(value).trim().toUpperCase()) ?? []).length - MAX_PAIR_BADGES}
                </span>
              )}
            {hasTelPrefixes && optionPrefixes(value).length > 0 && (
              <span className="manage-item-code" title="Tel prefixes">
                {optionPrefixes(value).join(' / ')}
              </span>
            )}
            {/* An arrow rather than a bare pair: the row has to say
                            which of the two digits is typed and which is stored,
                            and 107 → 109 says it without a legend. */}
            {hasStandIn && optionStandIns(value).length > 0 && optionStandInReal(value) && (
              <span className="manage-item-code" title="Stand-in prefixes, and what they are stored as">
                {optionStandIns(value).join(' / ')} → {optionStandInReal(value)}
              </span>
            )}
            {/* Labelled, so the digits say which number they answer
                            to rather than leaving it to be inferred from which
                            list is open. An agency's stale Tel prefixes are not
                            shown at all — they select nothing now. */}
            {hasIssiPrefixes && optionIssiPrefixes(value).length > 0 && (
              <span className="manage-item-code" title="ISSI prefixes">
                ISSI {optionIssiPrefixes(value).join(' / ')}
              </span>
            )}
            {isTechnicians &&
              [technicianId(value), technicianInitials2(value), technicianInitials3(value)].filter(Boolean).length >
                0 && (
                <span className="manage-item-code">
                  {[technicianId(value), technicianInitials2(value), technicianInitials3(value)]
                    .filter(Boolean)
                    .join(' / ')}
                </span>
              )}
            {/* The row's own name, but only while nothing more specific is
                on show. Once the per-device rows are there they carry a name
                each, and the row's own is merely the default they fall back
                to — printing it above them said "Charger" over a list that
                already read Charger12 and Charger818, and made the card twice
                as tall to say nothing. */}
            {perDeviceRows(value).length === 0 && nameOf(value)}
            {isMaterials && descOf(value) && <span className="manage-item-desc">{descOf(value)}</span>}
            {isCompanies && companyCode(value) && <span className="manage-item-desc">stock {companyCode(value)}</span>}
            {fullFormOf(value) && <span className="manage-item-desc">{fullFormOf(value)}</span>}
            {/* The devices this part is on, each with the code it
                            carries there and the name it goes by — the whole
                            answer readable off the card, without opening it.

                            Shown only once there is something a single code chip
                            cannot say: a part on every device under one name is
                            already fully described by "99A ACP-12" above, and
                            repeating it ten times would bury the rows that do
                            differ. */}
            {isIssues && issueCode(value) && perDeviceRows(value).length > 0 && (
              <span className="issue-devices issue-devices-stacked">
                {perDeviceRows(value).map((r) => (
                  <span key={r.model} className="issue-device" title={r.model}>
                    <span className="manage-item-code">{r.code}</span>
                    <span className="issue-device-name">{r.name}</span>
                  </span>
                ))}
              </span>
            )}
          </span>
          <div className="manage-item-actions">
            {/* One edit at a time: a second open row would quietly
                            discard the first one's unsaved changes. */}
            <button
              type="button"
              className="icon-edit"
              onClick={() => startEdit(i)}
              disabled={editIndex !== -1}
              aria-label={`Edit ${nameOf(value)}`}
              title={editIndex === -1 ? `Edit ${nameOf(value)}` : 'Finish the open edit first'}
            >
              ✎
            </button>
          </div>
        </>
      )}
    </>
  )

  /**
   * The list as cards: every variant of one parts base code in a single group.
   *
   * displayList already orders coded issue rows by parts then variant, so a
   * group is a contiguous run and this is one pass. Each item keeps its own
   * index into `list` — edit, save and delete are keyed on it, and grouping
   * must not disturb that.
   *
   * An UNCODED row is a group of one with no base code, so it renders exactly
   * as it always did: it is not a variant of anything, and a head reading ''
   * would invent a group. Every non-issue category is the same — one group per
   * row, no heads — so this one shape serves the whole list.
   */
  const issueGroups = (() => {
    const out = []
    for (const entry of displayList) {
      const parts = isIssues ? issueParts(entry.value) : ''
      const last = out[out.length - 1]
      if (parts && last && last.parts === parts) last.items.push(entry)
      else out.push({ key: `${parts || 'x'}-${entry.i}`, parts, items: [entry] })
    }
    return out
  })()

  const perDeviceRows = (value) => {
    if (!isIssues) return []
    const overrides = issueNameOverrides(value)
    if (!issueNarrowed(value) && Object.keys(overrides).length === 0) return []
    return modelsTickedOn(value)
      .map((m) => ({
        model: m,
        code: codeFor(m, issueParts(value), issueVariant(value)),
        name: issueNameForModel(value, m),
      }))
      .filter((r) => r.code)
  }

  const codeFor = (model, parts, variant) => {
    const p = String(parts ?? '').trim()
    const v = String(variant ?? '')
      .trim()
      .toUpperCase()
    if (!PARTS_RE.test(p) || !VARIANT_RE.test(v)) return ''
    const letter = letterOf(model)
    return letter ? `${letter}${p}${v}` : ''
  }

  // Ticking inside the open edit row. Untouched means every device, so that is
  // the set the first untick works from — the same rule toggleIssueModel
  // follows in the grid, because they are the one field.
  const toggleEditModel = (model) => {
    const set = new Set(editModels ?? deviceModels)
    if (set.has(model)) set.delete(model)
    else set.add(model)
    // Back to every device is stored as "never narrowed", not as a list that
    // happens to be complete — so a device added to the code map later is
    // offered for this part too, instead of being silently excluded by a list
    // written before it existed.
    setEditModels(set.size === deviceModels.length ? null : deviceModels.filter((m) => set.has(m)))
  }

  function setIssueModels(index, models) {
    onChange(
      cat,
      list.map((v, i) => (i === index ? withModels(v, models) : v)),
    )
  }

  function toggleIssueModel(index, model) {
    // Untouched means every device, so that is the set the first untick works
    // from — otherwise the first click would narrow the part to the ONE device
    // just clicked, which is the opposite of what unticking one means.
    const set = new Set(modelsTickedOn(list[index]))
    if (set.has(model)) set.delete(model)
    else set.add(model)
    // Ticked everywhere is stored as "not narrowed", so a row ticked back up
    // returns to the shape it started in rather than carrying a list that
    // happens to name everything.
    const models = set.size === deviceModels.length ? null : deviceModels.filter((m) => set.has(m))
    setIssueModels(index, models)
  }

  // All or nothing for one part. Clearing a row is how narrowing to one or two
  // devices is actually done — untick ten to reach two, or clear and tick the
  // two — so an empty row is a state to pass through, not one to refuse. A row
  // left empty is offered nowhere, and says so.
  const toggleIssueAllModels = (index) =>
    setIssueModels(index, modelsTickedOn(list[index]).length === deviceModels.length ? [] : null)

  function clearNew() {
    setNewValue('')
    setNewDesc('')
    setNewParts('')
    setNewVariant('')
    setNewModels(null)
    setNewPrefixes('')
    setNewIssiPrefixes('')
    setNewStandIn('')
    setNewStandInReal('')
    setNewFullForm('')
    setNewCode('')
    setNewId('')
    setNewInitials2('')
    setNewInitials3('')
  }

  function add() {
    const value = newValue.trim()
    if (!value) return

    const [problem, field] = problemFor(newFields)
    if (problem) {
      flash(problem, field)
      return
    }

    // A name already in the list is usually a mistake — but not when it has no
    // code and one is being given. That is the SAME issue type gaining its
    // code, so it is attached rather than refused: otherwise an entry like
    // "PCB" that predates the codes could never be given one from here, and
    // adding a second row named "PCB" is not what anyone wants either. A model
    // gaining its first Tel prefixes is the same move, for the same reason —
    // every models list predates the field.
    const clash = list.findIndex((v) => nameOf(v).toLowerCase() === value.toLowerCase())
    if (clash >= 0) {
      const givingCode =
        (isIssues && newParts.trim() && newVariant.trim()) ||
        (hasPrefixes &&
          (parsePrefixes(hasTelPrefixes ? newPrefixes : newIssiPrefixes).length > 0 ||
            newFullForm.trim() !== '' ||
            // A model gaining only its first stand-in is the same move.
            (hasStandIn && newStandIn.trim() !== '' && newStandInReal.trim() !== '')))
      // Whichever list this category actually answers to.
      const held = isIssues
        ? issueCode(list[clash])
        : hasPrefixes
          ? (hasTelPrefixes ? optionPrefixes(list[clash]) : optionIssiPrefixes(list[clash])).join(', ')
          : ''
      if (!givingCode || held) {
        flash(
          `"${value}" is already in the list${held ? `, holding ${hasPrefixes ? 'prefix' : 'code'} ${held}` : ''}.`,
          'name',
        )
        return
      }
      onChange(
        cat,
        list.map((v, i) => (i === clash ? makeItem(value, newFields) : v)),
      )
      clearNew()
      return
    }

    onChange(cat, [...list, makeItem(value, newFields)])
    clearNew()
  }

  function startEdit(i) {
    setEditIndex(i)
    setEditValue(nameOf(list[i]))
    setEditDesc(descOf(list[i]))
    setEditParts(isIssues ? issueParts(list[i]) : '')
    setEditVariant(isIssues ? issueVariant(list[i]) : '')
    setEditPrefixes(hasTelPrefixes ? optionPrefixes(list[i]).join(', ') : '')
    setEditIssiPrefixes(hasIssiPrefixes ? optionIssiPrefixes(list[i]).join(', ') : '')
    setEditStandIn(hasStandIn ? optionStandIns(list[i]).join(', ') : '')
    setEditStandInReal(hasStandIn ? optionStandInReal(list[i]) : '')
    // Seeded from the code map when the option carries none of its own, so
    // opening an agency to edit it offers the full form rather than a blank box
    // that would silently drop what the card was showing a moment ago.
    setEditFullForm(isAgencies ? optionFullForm(list[i]) || mappedFullForm(list[i]) : '')
    setEditCode(isCompanies ? companyCode(list[i]) : '')
    // Only when the part sits on exactly one shelf. On two there is no single
    // answer to show, and a picker opening on one of them would look like an
    // offer to move the other.
    setEditModels(isIssues && issueNarrowed(list[i]) ? issueModels(list[i]) : null)
    setEditNames(isIssues ? issueNameOverrides(list[i]) : {})
    const stocked = isIssues ? (pairCodesByPart?.get(nameOf(list[i]).trim().toUpperCase()) ?? []) : []
    const letter = stocked.length === 1 ? (parsePairCode(stocked[0])?.letter ?? '') : ''
    setEditLetter(letter)
    setEditLetterWas(letter)
    setEditId(isTechnicians ? technicianId(list[i]) : '')
    setEditInitials2(isTechnicians ? technicianInitials2(list[i]) : '')
    setEditInitials3(isTechnicians ? technicianInitials3(list[i]) : '')
  }

  async function saveEdit() {
    const value = editValue.trim()
    if (!value) return
    if (exists(value, editIndex)) {
      flash(`"${value}" is already in the list.`, 'name')
      return
    }
    const [problem, field] = problemFor(editFields, editIndex)
    if (problem) {
      flash(problem, field)
      return
    }
    // The device goes to INVENTORY, where a Model Code lives — a code claimed
    // here is claimed without a device on purpose, and that stays true. Done
    // before the list is written and the row closed, so a refusal leaves the
    // edit open with its reason on screen instead of half-applied.
    //
    // Looked up by the name inventory HOLDS, which is the name this row had
    // when it was opened: renaming an issue does not rename the stock.
    //
    // And by the name it holds ON THE DEVICE BEING SHELVED. One code can be a
    // different physical part per radio — 99A is the ACP-12 on a TH1N and the
    // Charger818 on an STP9000 — so shelving 99A onto the STP9000 has to find
    // the Charger818's rows. Reading the row's own name here instead would
    // stamp T99A onto the ACP-12's box: the Airbus part relabelled as the
    // STP9000's shelf, and every STP9000 charger fault drawing from it.
    if (editLetter && editLetter !== editLetterWas) {
      const shelfModel = deviceModels.find((m) => letterOf(m) === editLetter)
      const shelfName = shelfModel ? issueNameForModel(list[editIndex], shelfModel) : nameOf(list[editIndex])
      const error = await onAssignPairCode?.(shelfName, editLetter)
      if (error) return flash(error, 'name')
    }
    onChange(
      cat,
      list.map((v, i) => (i === editIndex ? makeItem(value, editFields) : v)),
    )
    setEditIndex(-1)
    setEditValue('')
    setEditDesc('')
    setEditParts('')
    setEditVariant('')
    setEditModels(null)
    setEditNames({})
    setEditLetter('')
    setEditLetterWas('')
    setEditPrefixes('')
    setEditIssiPrefixes('')
    setEditStandIn('')
    setEditStandInReal('')
    setEditFullForm('')
    setEditCode('')
    setEditId('')
    setEditInitials2('')
    setEditInitials3('')
  }

  // Escape abandons the open edit. Enter is NOT handled per input any more —
  // the row container steps focus forward and saves from the last field.
  const cancelOnEscape = (e) => {
    if (e.key === 'Escape') setEditIndex(-1)
  }

  function remove(i) {
    onChange(
      cat,
      list.filter((_, idx) => idx !== i),
    )
    if (editIndex === i) setEditIndex(-1)
  }

  return (
    // manage-inputs scopes this page's own layout. .manage-controls,
    // .manage-list and .field-code are shared with Code Reference and Admin
    // users, so nothing below may restyle them unscoped.
    <section className="manage manage-inputs">
      {embedded ? (
        <h2 className="page-title">⚙️ Manage inputs</h2>
      ) : (
        <button type="button" className="manage-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>⚙️ Manage inputs</span>
          <span className="chev">{open ? '▲' : '▼'}</span>
        </button>
      )}

      {open && (
        <div className="manage-body">
          <p className="manage-hint">
            Add, rename, or remove the choices that appear in the dropdowns. Changes save automatically and apply
            everywhere. Existing entries keep whatever value they were saved with.
          </p>

          {/* The category modifier tells the stylesheet how many extra fields
              are on the row, which is what decides how they reflow on a
              tablet — two code fields stack, three initials pair up. */}
          <div
            className={`manage-controls${isIssues ? ' cat-issues' : ''}${isTechnicians ? ' cat-tech' : ''}${
              isMaterials ? ' cat-materials' : ''
            }${hasPrefixes ? ' cat-prefixed' : ''}`}
            /* Enter walks Category -> the code fields -> Name -> Description,
               and adds from the last one. */
            onKeyDown={(e) => advanceOnEnter(e, add)}
          >
            <label className="field-category">
              Category
              <SearchSelect
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value)
                  setEditIndex(-1)
                  // The extra fields belong to the category that showed them.
                  setNewDesc('')
                  setNewParts('')
                  setNewVariant('')
                  setNewPrefixes('')
                  setNewId('')
                  setNewInitials2('')
                  setNewInitials3('')
                }}
                options={CATEGORIES.map((c) => ({
                  value: c.key,
                  label: `${c.label} (${(options[c.key] ?? []).length})`,
                }))}
              />
            </label>
            {/* Each field is its own label — one "Add new" over a row of boxes
                left you guessing which box was which. */}
            {isIssues && (
              <>
                <label className="field-code">
                  Parts Code
                  <input
                    value={newParts}
                    onChange={(e) => setNewParts(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="19"
                    aria-invalid={noticeField === 'code' || undefined}
                    className={noticeField === 'code' ? 'invalid' : undefined}
                    inputMode="numeric"
                    title="The component number — exactly 2 digits, e.g. 19"
                  />
                </label>
                <label className="field-code">
                  Variant
                  <input
                    value={newVariant}
                    onChange={(e) =>
                      setNewVariant(
                        e.target.value
                          .replace(/[^A-Za-z]/g, '')
                          .slice(0, 1)
                          .toUpperCase(),
                      )
                    }
                    placeholder="B"
                    aria-invalid={noticeField === 'code' || undefined}
                    className={noticeField === 'code' ? 'invalid' : undefined}
                    title="Which build or version of that part — 1 letter, e.g. B"
                  />
                </label>
              </>
            )}
            {hasTelPrefixes && (
              <label className="field-code field-prefix">
                Tel prefixes
                <input
                  value={newPrefixes}
                  onChange={(e) => setNewPrefixes(e.target.value.replace(/[^\d,\s]/g, ''))}
                  placeholder="355, 06"
                  aria-invalid={noticeField === 'prefixes' || undefined}
                  className={noticeField === 'prefixes' ? 'invalid' : undefined}
                  inputMode="numeric"
                  title="The leading digits of a Tel number that mean this model — 2 to 6 digits, several separated by commas, e.g. 355, 06. Optional."
                />
              </label>
            )}
            {hasStandIn && (
              <>
                <label className="field-code field-prefix">
                  Stand-in prefixes
                  <input
                    value={newStandIn}
                    onChange={(e) => setNewStandIn(e.target.value.replace(/[^\d,\s]/g, ''))}
                    placeholder="103, 03"
                    aria-invalid={noticeField === 'standIn' || undefined}
                    className={noticeField === 'standIn' ? 'invalid' : undefined}
                    inputMode="numeric"
                    title="Prefixes typed to select this model but never stored — for a device whose real prefix is shared with another model and so cannot name it. Several separated by commas, e.g. 103, 03. Optional."
                  />
                </label>
                <label className="field-code">
                  Stored as
                  <input
                    value={newStandInReal}
                    onChange={(e) => setNewStandInReal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="109"
                    aria-invalid={noticeField === 'standIn' || undefined}
                    className={noticeField === 'standIn' ? 'invalid' : undefined}
                    inputMode="numeric"
                    title="The prefix really on the radio — the one every stand-in above is swapped for when the entry is saved."
                  />
                </label>
              </>
            )}
            {hasIssiPrefixes && (
              <label className="field-code field-prefix">
                ISSI prefixes
                <input
                  value={newIssiPrefixes}
                  onChange={(e) => setNewIssiPrefixes(e.target.value.replace(/[^\d,\s]/g, ''))}
                  placeholder="180, 214"
                  aria-invalid={noticeField === 'issiPrefixes' || undefined}
                  className={noticeField === 'issiPrefixes' ? 'invalid' : undefined}
                  inputMode="numeric"
                  title="The leading digits of an ISSI that mean this agency — 2 to 6 digits, several separated by commas, e.g. 180, 214. Its own list, separate from the Tel prefixes. Optional."
                />
              </label>
            )}
            {isTechnicians && (
              <>
                <label className="field-code">
                  Tech ID
                  <input
                    value={newId}
                    onChange={(e) => setNewId(e.target.value.replace(/\D/g, ''))}
                    placeholder="1"
                    aria-invalid={noticeField === 'id' || undefined}
                    className={noticeField === 'id' ? 'invalid' : undefined}
                    inputMode="numeric"
                    title="The number this technician texts as the last part of a WhatsApp report, e.g. 1. Optional."
                  />
                </label>
                <label className="field-code">
                  2-Letter Initial
                  <input
                    value={newInitials2}
                    onChange={(e) =>
                      setNewInitials2(
                        e.target.value
                          .replace(/[^A-Za-z]/g, '')
                          .slice(0, 2)
                          .toUpperCase(),
                      )
                    }
                    placeholder="MA"
                    aria-invalid={noticeField === 'initials2' || undefined}
                    className={noticeField === 'initials2' ? 'invalid' : undefined}
                    title="An alternative to the ID above — exactly 2 letters, e.g. MA for Muhammad Amir. Optional."
                  />
                </label>
                <label className="field-code">
                  3-Letter Initial
                  <input
                    value={newInitials3}
                    onChange={(e) =>
                      setNewInitials3(
                        e.target.value
                          .replace(/[^A-Za-z]/g, '')
                          .slice(0, 3)
                          .toUpperCase(),
                      )
                    }
                    placeholder="MRA"
                    aria-invalid={noticeField === 'initials3' || undefined}
                    className={noticeField === 'initials3' ? 'invalid' : undefined}
                    title="A second alternative to the ID above — exactly 3 letters, e.g. MRA. Optional."
                  />
                </label>
              </>
            )}
            {/* Name, Description and Add are siblings of Category rather than
                nested under it, so each breakpoint can place them independently
                — on a tablet the description drops to its own full-width line
                while Category and Name stay paired above it. */}
            <label className="field-name">
              {isIssues
                ? 'Description'
                : isMaterials
                  ? 'Material name'
                  : isTechnicians
                    ? 'Technician name'
                    : isModels
                      ? 'Model name'
                      : isAgencies
                        ? 'Agency name'
                        : 'Add new'}
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                aria-invalid={noticeField === 'name' || undefined}
                className={noticeField === 'name' ? 'invalid' : undefined}
                placeholder={
                  isIssues
                    ? 'Belt Clip'
                    : isMaterials
                      ? 'Material name'
                      : isTechnicians
                        ? 'Muhammad Amir'
                        : isModels
                          ? 'STP9000'
                          : isAgencies
                            ? 'PSD'
                            : 'Type a value and press Add'
                }
              />
            </label>
            {isMaterials && (
              <label className="field-desc">
                Description (optional)
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                />
              </label>
            )}
            {isCompanies && (
              <label className="field-desc">
                Stock code (optional)
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="MOT"
                  title="The SKU prefix this company's stock is shelved under — MOT for MOT-MAK-1114-2. It is what draws a part off this company's shelf instead of another's when a report is saved. Leave blank and the company is simply not narrowed."
                />
              </label>
            )}
            {/* Beside the name rather than among the prefix boxes: it is prose
                about the name, not a third thing a number is matched against. */}
            {isAgencies && (
              <label className="field-desc">
                Full form (optional)
                <input
                  value={newFullForm}
                  onChange={(e) => setNewFullForm(e.target.value)}
                  placeholder="PUBLIC SECURITY DEPARTMENT"
                  title="What the acronym stands for. Shown on the card below; the acronym stays the name reports are filed under. Leave blank to use the shared code map's wording."
                />
              </label>
            )}
            <div className="add-action">
              <button type="button" onClick={add} disabled={!newValue.trim()}>
                Add
              </button>
            </div>
          </div>

          {isIssues && (
            <p className="manage-hint">
              The <strong>Description</strong> is the issue type — it is what gets written on the entry. Give it a{' '}
              <strong>Parts Code</strong> (2 digits) and a <strong>Variant</strong> (1 letter) and the decoder resolves
              that fault straight to it: <code>19</code> + <code>B</code> = <code>19B</code>. The technician's code
              supplies the device letter, so <code>H19B</code> and <code>T19B</code> both land on this one entry — a
              part is normally the same part on every radio. The variant is part of the part's identity, not just a
              build, so two variants of one parts number can be two genuinely different items rather than two builds of
              one. Leave both blank for an issue with no code.
            </p>
          )}
          {isIssues && (
            <p className="manage-hint">
              A code can be given to a <strong>second</strong> part as long as the two are on different devices. Tick{' '}
              <em>Models that use this part</em> on each of them and <code>44A</code> can be Battery 1590 on the TH1N
              and Battery 1880 on the STP9000 — the letter tells them apart, as <code>H44A</code> and <code>T44A</code>,
              and each keeps its own stock. What is refused is one device with two answers: a row that is on every
              device (nothing ticked) already answers for all of them, so narrow it first.
            </p>
          )}
          {hasTelPrefixes && (
            <p className="manage-hint">
              <strong>Tel prefixes</strong> are the leading digits of a Tel number that select this model on an entry. A
              number starting <code>190</code> makes the Model an STP9000; <code>355</code> or <code>06</code> makes it
              a TH1N. The Type then follows from the Model as it always has. Give one as many prefixes as it needs,
              separated by commas; 2 to 6 digits each, and the longest one that matches wins, so a narrower range can
              sit inside a wider one. Two models may share a prefix — the one higher up this list is the one selected,
              and the other is a dropdown away. Leave it blank for a model no number identifies. A Tel number names the{' '}
              <strong>device and nothing else</strong>: whose radio it is comes off the ISSI, on the Agencies list. This
              is where a new device is taught to the auto-select — nothing else needs changing.
              {newPrefixes.trim() && <span className="manage-code-hint"> {prefixShareHint(newPrefixes)}</span>}
            </p>
          )}
          {hasStandIn && (
            <p className="manage-hint">
              A <strong>Stand-in prefix</strong> is for a device the real prefix cannot name on its own. Where two
              models share a prefix, a Tel number cannot say which is on the bench and the auto-select lands on
              whichever is higher in this list. Give each of them stand-ins — say <code>103, 03</code>{' '}
              <strong>Stored as</strong> <code>109</code> — add those to its Tel prefixes, and typing <code>103…</code>{' '}
              selects that model while the entry saves with the <code>109…</code> really on the radio. Several stand-ins
              are one rule written more than once: separate them with commas, and each is swapped for the same stored
              prefix. The swap happens once, at save, and only for the model that declares it: the same digits typed
              against another model are somebody's real number and are stored untouched. Both boxes or neither; leave
              them blank for a device that needs no stand-in. The three SRG3900 builds are the case this exists for —{' '}
              <code>109</code> is really on all of them, so each takes shorthand of its own to be picked by.
              {newStandIn.trim() && <span className="manage-code-hint"> {standInHint(newStandIn, newPrefixes)}</span>}
            </p>
          )}
          {hasIssiPrefixes && (
            <p className="manage-hint">
              <strong>ISSI prefixes</strong> are the leading digits of an <strong>ISSI</strong> that select this agency
              on an entry: an ISSI starting <code>180</code> is the PSD, <code>191</code> the CD and <code>214</code>{' '}
              the SRCA. Give one as many as it needs, separated by commas; 2 to 6 digits each, longest match wins, and a
              shared prefix goes to whichever agency is higher in this list. Leave it blank for an agency no number
              identifies. The ISSI names <strong>whose radio it is and nothing else</strong> — the device comes off the
              Tel number, on the Models list — so the two lists are read against their own number and the same digits
              may mean different things on each. <code>00</code> is the one ISSI that is not an agency at all: it fills
              the whole entry in as <strong>no activity today</strong>.
              {newIssiPrefixes.trim() && (
                <span className="manage-code-hint"> {prefixShareHint(newIssiPrefixes, optionIssiPrefixes)}</span>
              )}
            </p>
          )}
          {isTechnicians && (
            <p className="manage-hint">
              A technician identifies themselves by ending a WhatsApp fault report in one of up to three things set
              here: the numeric <strong>Tech ID</strong> (e.g. <code>1</code>), a <strong>2-Letter Initial</strong>{' '}
              (e.g. <code>MA</code> for Muhammad Amir), or a <strong>3-Letter Initial</strong> (e.g. <code>MRA</code>{' '}
              for a middle initial too) — any combination, or none. Leave all three blank for a technician who only
              appears in the app's own dropdowns. This is where a technician's IDs are defined; what is set here is what
              a report resolves to.
            </p>
          )}
          {isIssues && (
            <p className="manage-hint">
              This is the primary code reference for the app: a code defined here is the authoritative meaning of that
              code, and nothing else is consulted for it. Everything defined here appears on the{' '}
              <strong>Code Reference</strong> under <em>Claimed Codes</em>, which is what technicians read.
              {newParts.trim() && <span className="manage-code-hint"> {codeInUseHint(newParts)}</span>}
            </p>
          )}

          {notice && <p className="manage-notice">{notice}</p>}

          <ul className="manage-list">
            {list.length === 0 && <li className="manage-empty">No values yet — add one above.</li>}
            {/* An item being edited takes the whole grid row: the description is
                the longest field and the one that must stay readable. */}
            {issueGroups.map((g) => (
              <li
                key={g.key}
                className={
                  [g.parts ? 'manage-group' : '', g.items.some((x) => x.i === editIndex) ? 'editing' : '']
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              >
                {/* One card per PARTS BASE CODE. 99A, 99B and 99C are the same
                    component in different builds — the charger that ships with
                    the radio, the spare desk charger, the 12W — and they were
                    separate cards that had to be hunted down a list to be
                    compared. Under one head they read as what they are: the
                    variants of 99.

                    A row with no code is its own group of one and gets no
                    head. It is not a variant of anything, and a head reading
                    '' would invent a group. */}
                {g.parts && (
                  <div className="manage-group-head">
                    <span className="manage-group-code">{g.parts}</span>
                    <span className="manage-group-count">
                      {g.items.length} {g.items.length === 1 ? 'variant' : 'variants'}
                    </span>
                    {/* The family name, from the parts list. Silent when the
                        number has none rather than printing a placeholder: an
                        unnamed number is a real state (see the Code Reference
                        card, which shows the same gap), and a head reading
                        "— unnamed —" would be louder than the name itself. */}
                    {partsName(g.parts) && <span className="manage-group-base">{partsName(g.parts)}</span>}
                  </div>
                )}
                {g.items.map(({ value, i }) => (
                  <div key={`${nameOf(value)}-${i}`} className={`manage-row${editIndex === i ? ' editing' : ''}`}>
                    {rowBody(value, i)}
                  </div>
                ))}
              </li>
            ))}
          </ul>

          {isIssues && deviceModels.length > 0 && displayList.length > 0 && (
            <div className="manage-matrix">
              <h3 className="manage-charts-h">Which devices use each part</h3>
              <p className="manage-hint">
                A part is offered in the ISSUE field only for the devices ticked here. Everything starts ticked
                everywhere, which is what an unnarrowed part means — untick the devices a part was never on, and it
                stops being offered for them. A Charger-DEY is a real part with a real code, and a TH1n has never had
                one. Changes save as you tick.
              </p>
              <div className="matrix-scroll">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th className="matrix-part">Part</th>
                      <th className="matrix-all">All</th>
                      {deviceModels.map((m) => (
                        <th key={m} className="matrix-device" title={m}>
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayList.map(({ value, i }) => {
                      const ticked = modelsTickedOn(value)
                      const every = ticked.length === deviceModels.length
                      const none = ticked.length === 0
                      return (
                        <tr key={`${nameOf(value)}-${i}`} className={every ? undefined : 'narrowed'}>
                          <th className="matrix-part" scope="row">
                            {issueCode(value) && <span className="manage-item-code">{issueCode(value)}</span>}
                            <span className="matrix-part-name">{nameOf(value)}</span>
                            {/* Said out loud, because a row of empty boxes is
                                also what a row nobody has reached looks like,
                                and these two mean opposite things. */}
                            {none && <span className="matrix-none">offered nowhere</span>}
                          </th>
                          <td className="matrix-cell matrix-all">
                            {/* One button, and its label is what the click
                                does — not what the row currently is. */}
                            <button
                              type="button"
                              className="matrix-all-btn"
                              onClick={() => toggleIssueAllModels(i)}
                              title={
                                every
                                  ? `Clear every device for "${nameOf(value)}"`
                                  : `Tick every device for "${nameOf(value)}"`
                              }
                            >
                              {every ? 'None' : 'All'}
                            </button>
                          </td>
                          {deviceModels.map((m) => {
                            const on = ticked.includes(m)
                            return (
                              <td key={m} className="matrix-cell">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleIssueModel(i, m)}
                                  aria-label={`${nameOf(value)} on ${m}`}
                                  title={`${nameOf(value)} on ${m}`}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {onToggleChart && (
            <div className="manage-charts">
              <h3 className="manage-charts-h">Charts</h3>
              <p className="manage-hint">Show or hide the pie charts on the Dashboard and Spare Parts pages.</p>
              <ul className="chart-toggle-list">
                {CHART_TOGGLES.map(({ key, label }) => {
                  const on = (options.charts ?? {})[key] !== false
                  return (
                    <li key={key}>
                      <label className="chart-toggle">
                        <input type="checkbox" checked={on} onChange={(e) => onToggleChart(key, e.target.checked)} />
                        <span>{label}</span>
                      </label>
                      <span className={`chart-toggle-state ${on ? 'on' : 'off'}`}>{on ? 'Shown' : 'Hidden'}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
