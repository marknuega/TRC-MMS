/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Enter moves to the next field.
 *
 * Filling a report is a long run of short values, and reaching for Tab
 * between each one is the slowest part of it — on a phone keyboard Tab is not
 * even there. So Enter steps forward through the form, and only the LAST
 * field runs the form's action.
 *
 * Attached once per form container rather than once per input: React events
 * bubble, so a single handler on the wrapper sees Enter from every field
 * inside it, the order is whatever the DOM order already is, and adding a
 * field later needs no wiring at all.
 *
 * Three things keep their own Enter and are never stepped past:
 *   - a textarea, where Enter is a newline;
 *   - a SearchSelect with its menu open, which commits the highlighted option
 *     — it calls preventDefault() when it does, which is exactly what
 *     `defaultPrevented` below checks, so no coupling to that component;
 *   - anything inside an open menu, which is a popup, not a form field.
 */

// What Enter steps through. The multi-select's toggle is a <button>, but it
// IS the field for its label, so it is named explicitly. No other button is a
// field: Enter on the last field runs the form's action rather than moving
// focus onto a button the user then has to press again.
export const FIELD_SELECTOR = 'input, select, textarea, .multi-toggle'

// Rows inside an OPEN dropdown are not fields of the form behind it.
// The issue menu is listed too, and it is the case that shows why: its rows
// hold real <input>s for editing a code, which Enter would otherwise step into
// and back out of as though they were fields of the form behind the popup.
const MENU_SELECTOR = '.search-select-menu, .multi-menu, .issue-menu'

/**
 * Can focus actually land here? Skips hidden, disabled and out-of-flow
 * fields, and anything living inside an open dropdown.
 *
 * Duck-typed rather than instanceof-checked so the ordering logic can be
 * exercised without a DOM.
 */
export function isReachableField(el) {
  if (!el) return false
  if (el.disabled || el.readOnly) return false
  if (el.type === 'hidden' || el.hidden) return false
  if (typeof el.tabIndex === 'number' && el.tabIndex < 0) return false
  if (typeof el.closest === 'function' && el.closest(MENU_SELECTOR)) return false
  // display:none leaves no layout box. Outside a browser offsetParent is
  // undefined rather than null, so this only filters when it can actually tell.
  if (el.offsetParent === null) return false
  return true
}

/** Index of the field after `current`; -1 when it is the last one or absent. */
export function nextFieldIndex(fields, current) {
  const i = fields.indexOf(current)
  if (i < 0) return -1
  return i + 1 < fields.length ? i + 1 : -1
}

/**
 * Enter handler for a form container.
 *
 * `onLast` is the form's primary action (Add / Save). With no action given,
 * Enter on the last field wraps back to the first rather than doing nothing,
 * so the key never feels dead.
 */
export function advanceOnEnter(e, onLast) {
  if (e.key !== 'Enter' || e.defaultPrevented) return
  const el = e.target
  if (!el || el.tagName === 'TEXTAREA') return
  const scope = e.currentTarget
  if (!scope || typeof scope.querySelectorAll !== 'function') return

  const fields = Array.from(scope.querySelectorAll(FIELD_SELECTOR)).filter(isReachableField)
  // Enter came from something that is not a field of this form (a button, a
  // menu row) — leave it alone.
  if (!fields.includes(el)) return

  e.preventDefault()
  const next = nextFieldIndex(fields, el)
  if (next >= 0) fields[next].focus()
  else if (onLast) onLast()
  else fields[0]?.focus()
}

// Two single-key shortcuts for the fault-entry row, guarded the same way
// advanceOnEnter guards Enter: never inside the Comment textarea, where
// '+' and '*' are ordinary note text rather than a command.
const isShortcutKey = (e, key) => e.key === key && !e.defaultPrevented && e.target?.tagName !== 'TEXTAREA'

/** The '+' key stands in for the "+ Add fault" / "+ Add material" button. */
export function isAddFaultShortcut(e) {
  return isShortcutKey(e, '+')
}

/** The '*' key stands in for filing the entry under the Agency already showing. */
export function isSaveShortcut(e) {
  return isShortcutKey(e, '*')
}
