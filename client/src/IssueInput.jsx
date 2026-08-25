/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The ISSUE field: a free-text input with a suggestion menu that can also give
 * a suggestion its CDS code without leaving the entry form.
 *
 * Free text FIRST. Unlike SearchSelect, whatever is typed here stands on its
 * own — an issue nobody has listed yet is still a real fault, and a picker that
 * refused it would make the form unusable on the day it matters. The menu
 * offers; it never decides.
 *
 * Why not the <datalist> this replaces: a datalist's popup is drawn by the
 * operating system, so nothing can be put inside a row — and a row that has no
 * code needs something inside it, namely the way to give it one. The same
 * reasoning that produced SearchSelect (see its header), arrived at from the
 * other direction.
 *
 * Assigning a code here writes to the SHARED vocabulary — the same list Manage
 * Inputs edits and the WhatsApp decoder reads. That is the point: an issue
 * typed today with a code attached is decodable tomorrow, by everyone. It is
 * also why a clash is refused rather than resolved: two issues under one code
 * would make the code ambiguous for every reader of it, and the person adding
 * the second one is not the person who would discover that.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { parsePairCode } from './pairCode.js'

// A code is two digits and a letter — "72" + "A". Half a code is not a code
// (issueCode in options.js says the same), so both halves are required here.
const PARTS_RE = /^\d{2}$/
const VARIANT_RE = /^[A-Z]$/

export default function IssueInput({
  value,
  onChange,
  suggestions = [], // [{ name, code, pairCode, companies, source, removable }] — either code '' when it has none
  onAssignCode, // (name, parts, variant) => string|void — a string is an error
  onAssignPairCode, // async (name, letter) => string|'' — puts the item on that model's shelf
  deviceLetters = [], // [{ letter, label }] — the devices the code map names
  onRemove, // (suggestion) => void — drops it from the list it came from
  placeholder,
  ariaLabel = 'Issue',
  list, // fallback datalist id, for modes that keep the native list
  ...rest
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [coding, setCoding] = useState(null) // { name, parts, variant, error } while a code is being typed
  const ref = useRef(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setCoding(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = String(value ?? '')
    .trim()
    .toLowerCase()
  // Filtered on what is typed, not on a separate query: this input's text IS
  // the value, so there is no selected label for a stale filter to hide behind.
  // Uncapped on purpose. A cap counts from the top of a list that is ordered
  // coded-issues, uncoded-issues, actions, then inventory — so the only rows it
  // could ever cut are the inventory ones, which is precisely the half someone
  // is searching for when they type a part name. The menu scrolls; the typing
  // narrows it. Neither needs a number in the way.
  // The code is searchable too, because it is how the codes are read back off a
  // WhatsApp message: someone holding "19A" is looking for the issue it names,
  // and knows the code before they know the spelling. Matched from the START of
  // the code, not anywhere inside it — "19" should find 19A and 19B, while a
  // bare "a" must not drag in every variant-A row whose name nobody typed.
  const filtered = useMemo(() => {
    const all = suggestions.filter((s) => s.name)
    if (!q) return all
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        String(s.code ?? '')
          .toLowerCase()
          .startsWith(q) ||
        // The Model Code too, from the start for the same reason the parts code
        // is: "C99" should find C99T, and a lone "C" should bring up every part
        // that lives on the Carkit's shelf.
        String(s.pairCode ?? '')
          .toLowerCase()
          .startsWith(q),
    )
  }, [suggestions, q])

  useEffect(() => setActiveIndex(filtered.length ? 0 : -1), [q, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // The Model Code of the issue now IN the field, so the code stays on screen
  // after the menu closes. Read back off the suggestions rather than stored on
  // the fault: the field's value is the issue NAME and must stay exactly that
  // — it is what a save resolves through, what a report prints, and what the
  // WhatsApp decoder reads. This is a label beside it, not part of it.
  const selectedPairCode = useMemo(() => {
    const want = String(value ?? '')
      .trim()
      .toUpperCase()
    if (!want) return ''
    return suggestions.find((s) => s.name.trim().toUpperCase() === want)?.pairCode ?? ''
  }, [value, suggestions])

  const commit = (name) => {
    onChange({ target: { value: name } })
    setOpen(false)
    setCoding(null)
  }

  function onKeyDown(e) {
    if (coding) return // the code fields own the keyboard while they are open
    if (e.key === 'Escape') return setOpen(false)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (filtered.length ? (i + step + filtered.length) % filtered.length : -1))
      return
    }
    // Enter picks the highlighted row, but only while the menu is showing one.
    // Otherwise it belongs to the form, which is what submits the entry.
    if (e.key === 'Enter' && open && activeIndex >= 0 && filtered[activeIndex]) {
      e.preventDefault()
      commit(filtered[activeIndex].name)
    }
  }

  // The pencil opens the row for editing, prefilled with the code it already
  // has — so the same control adds a missing code and corrects a wrong one.
  function startEditing(e, s) {
    e.stopPropagation() // the row underneath would otherwise select and close
    const code = String(s.code ?? '')
    setCoding({
      name: s.name,
      parts: code.slice(0, 2),
      variant: code.slice(2, 3),
      // Prefilled from the code the row is showing, so the picker opens on the
      // device it already says rather than on nothing.
      letter: parsePairCode(s.pairCode)?.letter ?? '',
      // Remembered so Save can tell a device that was CHOSEN from one that was
      // merely displayed — only a change writes to inventory.
      letterWas: parsePairCode(s.pairCode)?.letter ?? '',
      error: '',
      row: s,
    })
  }

  // Enter saves the code and Escape abandons it, so the editor can be finished
  // from the keyboard it is typed with. Both keys are handled here rather than
  // left to bubble: Enter would otherwise reach the form's Enter-advances-a-
  // field handler and step focus out to QTY, silently dropping the code, and
  // Escape would close the whole menu out from under the row being edited.
  function onCodeKeyDown(e) {
    if (e.key === 'Enter') return saveCode(e)
    if (e.key === 'Escape') {
      e.stopPropagation()
      setCoding(null)
    }
  }

  async function saveCode(e) {
    e.preventDefault()
    e.stopPropagation()
    const parts = String(coding.parts ?? '').trim()
    const variant = String(coding.variant ?? '')
      .trim()
      .toUpperCase()
    const letter = String(coding.letter ?? '').trim()
    const movingShelf = letter && letter !== coding.letterWas

    // Both halves of the code, or neither. Neither is a real save when the
    // device changed: a part with no code of its own is held by its name, and
    // moving it to another shelf is exactly what this row is for.
    const coded = parts || variant
    if (coded && !PARTS_RE.test(parts)) return setCoding((c) => ({ ...c, error: 'Parts is two digits, e.g. 72' }))
    if (coded && !VARIANT_RE.test(variant)) return setCoding((c) => ({ ...c, error: 'Variant is one letter, e.g. A' }))
    if (!coded && !movingShelf) return setCoding((c) => ({ ...c, error: 'Give it a code, or pick a device.' }))

    if (coded) {
      // The parent owns the list, so it owns the clash check too — it is the
      // only side that can see every code already claimed.
      const error = onAssignCode?.(coding.name, parts, variant)
      if (error) return setCoding((c) => ({ ...c, error }))
    }
    // Second, and only on a change: the device is a fact about the ITEM, not
    // about the issue, so it is written to inventory. After the code, because
    // the Model Code is built from the code that was just claimed.
    if (movingShelf) {
      const error = await onAssignPairCode?.(coding.name, letter)
      if (error) return setCoding((c) => ({ ...c, error }))
    }
    commit(coding.name) // coded and chosen in one move — "update the code to proceed"
  }

  return (
    <div className="issue-input" ref={ref}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        list={list}
        style={selectedPairCode ? { paddingRight: '3.9rem' } : undefined}
        {...rest}
      />
      {/* Pinned inside the right edge of the field rather than after it: it
          belongs to this value, and a badge sitting outside would be read as
          belonging to the QTY box next door. The input reserves room for it,
          so a long issue name ellipsises before it reaches the badge instead
          of sliding underneath. */}
      {selectedPairCode && (
        <span className="issue-pair-code issue-pair-code-inline" title={`Model Code ${selectedPairCode}`}>
          {parsePairCode(selectedPairCode)?.provisional ? parsePairCode(selectedPairCode).letter : selectedPairCode}
        </span>
      )}
      {open && filtered.length > 0 && (
        <div className="issue-menu" role="listbox" id={listId}>
          {filtered.map((s, i) => (
            <div
              key={`${s.name}-${i}`}
              role="option"
              aria-selected={s.name === value}
              className={`issue-opt${i === activeIndex ? ' active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              // Cancelling mousedown keeps focus in the text input while a row
              // is picked — but it also cancels the focus a click would give
              // anything INSIDE the row, and the code editor is made of inputs.
              // With the editor open the click must land, or the variant is
              // reachable only by Tab from the parts field that autofocused.
              onMouseDown={(e) => {
                if (!e.target.closest?.('.issue-code-form')) e.preventDefault()
              }}
              onClick={() => commit(s.name)}
            >
              <span className="issue-opt-name" title={s.name}>
                {s.name}
              </span>
              {coding?.name === s.name ? (
                // The row opened for editing: its code, and the way to drop it
                // from the list, in the row they belong to. The name is already
                // decided by which row this is, so the only questions left are
                // the two halves of the code — both on screen with it.
                <span className="issue-code-form" onClick={(e) => e.stopPropagation()}>
                  {/* The device first, because it reads in the order the code
                      does: C then 99 then T. Labelled by the map's own device
                      name in the list — a bare letter is not something to
                      expect anyone to know by heart — and shown as the letter
                      alone once chosen, so it stays the width of the code. */}
                  {deviceLetters.length > 0 && (
                    <select
                      className="issue-code-device"
                      value={coding.letter}
                      onChange={(e) => setCoding((c) => ({ ...c, letter: e.target.value, error: '' }))}
                      onKeyDown={onCodeKeyDown}
                      aria-label={`Device this part is stocked for, for ${s.name}`}
                      title="Which model's shelf this part comes off"
                    >
                      <option value="">–</option>
                      {deviceLetters.map((d) => (
                        <option key={d.letter} value={d.letter}>
                          {d.letter} — {d.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    value={coding.parts}
                    onChange={(e) => setCoding((c) => ({ ...c, parts: e.target.value, error: '' }))}
                    onKeyDown={onCodeKeyDown}
                    placeholder="72"
                    maxLength={2}
                    inputMode="numeric"
                    aria-label={`Parts code for ${s.name}`}
                    autoFocus
                  />
                  <input
                    value={coding.variant}
                    onChange={(e) => setCoding((c) => ({ ...c, variant: e.target.value.toUpperCase(), error: '' }))}
                    onKeyDown={onCodeKeyDown}
                    placeholder="A"
                    maxLength={1}
                    aria-label={`Variant for ${s.name}`}
                  />
                  <button type="button" className="issue-code-save" onClick={saveCode}>
                    Save
                  </button>
                  {/* Delete lives in here rather than on the row: it is one
                      click away instead of one click, which is the right
                      distance for the only control that destroys something. */}
                  {s.removable && (
                    <button
                      type="button"
                      className="issue-code-del"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCoding(null)
                        onRemove?.(s)
                      }}
                      title={`Remove "${s.name}" from the list`}
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCoding(null)
                    }}
                    aria-label="Cancel"
                  >
                    ✕
                  </button>
                  {coding.error && <em className="issue-code-error">{coding.error}</em>}
                </span>
              ) : (
                <>
                  {/* Spacer first, so the codes line up in a column at the end
                      of the rows instead of trailing each name at whatever
                      width that name happens to be — a ragged edge you have to
                      read across rather than a list you can scan down. */}
                  <span className="issue-opt-spacer" />
                  {/* The Model Code, beside the parts code it is built from —
                      the parts code says WHAT the item is, this says which
                      radio's shelf it comes off. A real code (C99A) is shown
                      whole; a provisional one is shown as its device letter
                      alone, because the rest of it is the item's own name and
                      that is already the text on the left of this row. */}
                  {s.pairCode && (
                    <span className="issue-pair-code" title={`Model Code ${s.pairCode}`}>
                      {parsePairCode(s.pairCode)?.provisional ? parsePairCode(s.pairCode).letter : s.pairCode}
                    </span>
                  )}
                  {s.code && <span className="issue-code">{s.code}</span>}
                  {/* Whose shelf the stock is on. MOT, X1 and X2 hold the same
                      parts in one branch and a fault draws from the shelf of
                      the company paying for it, so which companies stock this
                      is worth seeing while choosing rather than discovering in
                      the ledger afterwards.

                      Both are listed when both stock it — that is the ordinary
                      case here, not an ambiguity. Nothing is shown for shared
                      stock, which belongs to whoever needs it. */}
                  {s.companies?.length > 0 && (
                    <span
                      className="issue-company"
                      title={
                        s.companies.length > 1 ? `Stocked by ${s.companies.join(' and ')}` : `${s.companies[0]}'s stock`
                      }
                    >
                      {s.companies.join(' ')}
                    </span>
                  )}
                  {/* One control per row, and it is the mild one. Setting a
                      code, changing it and deleting the entry are all edits to
                      the same shared list, so they open together rather than
                      crowding the row with a chip and an ✕ apiece. */}
                  <button
                    type="button"
                    className="issue-opt-edit"
                    onClick={(e) => startEditing(e, s)}
                    aria-label={`Edit ${s.name}`}
                    title={s.code ? `Edit "${s.name}" (code ${s.code})` : `Give "${s.name}" a code`}
                  >
                    ✎
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
