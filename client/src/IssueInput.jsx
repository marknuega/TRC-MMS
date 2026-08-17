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

// A code is two digits and a letter — "72" + "A". Half a code is not a code
// (issueCode in options.js says the same), so both halves are required here.
const PARTS_RE = /^\d{2}$/
const VARIANT_RE = /^[A-Z]$/

export default function IssueInput({
  value,
  onChange,
  suggestions = [], // [{ name, code, source, removable }] — code '' when it has none
  onAssignCode, // (name, parts, variant) => string|void — a string is an error
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

  const q = String(value ?? '').trim().toLowerCase()
  // Filtered on what is typed, not on a separate query: this input's text IS
  // the value, so there is no selected label for a stale filter to hide behind.
  // Uncapped on purpose. A cap counts from the top of a list that is ordered
  // coded-issues, uncoded-issues, actions, then inventory — so the only rows it
  // could ever cut are the inventory ones, which is precisely the half someone
  // is searching for when they type a part name. The menu scrolls; the typing
  // narrows it. Neither needs a number in the way.
  const filtered = useMemo(() => {
    const all = suggestions.filter((s) => s.name)
    return q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all
  }, [suggestions, q])

  useEffect(() => setActiveIndex(filtered.length ? 0 : -1), [q, open]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setCoding({ name: s.name, parts: code.slice(0, 2), variant: code.slice(2, 3), error: '', row: s })
  }

  function saveCode(e) {
    e.preventDefault()
    e.stopPropagation()
    const parts = String(coding.parts ?? '').trim()
    const variant = String(coding.variant ?? '').trim().toUpperCase()
    if (!PARTS_RE.test(parts)) return setCoding((c) => ({ ...c, error: 'Parts is two digits, e.g. 72' }))
    if (!VARIANT_RE.test(variant)) return setCoding((c) => ({ ...c, error: 'Variant is one letter, e.g. A' }))
    // The parent owns the list, so it owns the clash check too — it is the only
    // side that can see every code already claimed.
    const error = onAssignCode?.(coding.name, parts, variant)
    if (error) return setCoding((c) => ({ ...c, error }))
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
        {...rest}
      />
      {open && filtered.length > 0 && (
        <div className="issue-menu" role="listbox" id={listId}>
          {filtered.map((s, i) => (
            <div
              key={`${s.name}-${i}`}
              role="option"
              aria-selected={s.name === value}
              className={`issue-opt${i === activeIndex ? ' active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => e.preventDefault()} // keep focus; the click below decides
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
                  <input
                    value={coding.parts}
                    onChange={(e) => setCoding((c) => ({ ...c, parts: e.target.value, error: '' }))}
                    placeholder="72"
                    maxLength={2}
                    inputMode="numeric"
                    aria-label={`Parts code for ${s.name}`}
                    autoFocus
                  />
                  <input
                    value={coding.variant}
                    onChange={(e) => setCoding((c) => ({ ...c, variant: e.target.value.toUpperCase(), error: '' }))}
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
                  {s.code && <span className="issue-code">{s.code}</span>}
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
