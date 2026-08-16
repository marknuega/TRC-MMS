/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * A drop-in replacement for a plain <select value={x} onChange={handler}>
 * — same value/onChange contract (onChange receives a { target: { value } }
 * event, exactly what a real <select> passes), so most call sites only need
 * the element swapped, not the handler.
 *
 * Built because neither native popup a single-choice picker can use is
 * actually stylable: a <select>'s open dropdown and a <datalist>'s
 * suggestion list are both OS-rendered — font size, row height and width
 * follow the platform, not the page's CSS, and on some displays balloon up
 * large enough to cover most of the screen (see codes.js's Quick Code Entry
 * history). This renders its own menu instead, capped at a fixed,
 * scrollable size, styled off the app's own tokens.
 *
 * `options` accepts plain strings (value === label, the common case) or
 * { value, label } objects for the few pickers where they differ (e.g.
 * Active/Disabled backed by "true"/"false").
 */

import { useEffect, useMemo, useRef, useState } from 'react'

export default function SearchSelect({
  value,
  options,
  onChange,
  placeholder = '— select —',
  disabled = false,
  className = '',
  ariaLabel,
}) {
  const normalized = useMemo(
    () => (options ?? []).map((o) => (o && typeof o === 'object' ? o : { value: o, label: String(o) })),
    [options],
  )
  const labelFor = (v) => normalized.find((o) => o.value === v)?.label ?? ''

  const [text, setText] = useState(labelFor(value))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Stay in sync when the caller changes the value out from under us (a
  // fresh form, a reset after submit, an edit-row opening, ...).
  useEffect(() => setText(labelFor(value)), [value, normalized]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = text.trim().toLowerCase()
  const filtered = q ? normalized.filter((o) => o.label.toLowerCase().includes(q)) : normalized

  function choose(opt) {
    setText(opt.label)
    setOpen(false)
    onChange({ target: { value: opt.value } })
  }

  function change(e) {
    const v = e.target.value
    setText(v)
    setOpen(true)
    // Typing the option's label out in full (not just picking from the
    // list) still commits it.
    const hit = normalized.find((o) => o.label.toLowerCase() === v.trim().toLowerCase())
    if (hit) choose(hit)
  }

  return (
    <div className={`search-select ${className}`} ref={ref}>
      <input
        value={text}
        onChange={change}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          else if (e.key === 'Enter' && filtered.length === 1) {
            e.preventDefault()
            choose(filtered[0])
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        autoComplete="off"
      />
      <button
        type="button"
        className="search-select-caret"
        tabIndex={-1}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Show all options"
      >
        ▾
      </button>
      {open && !disabled && (
        <div className="search-select-menu">
          {filtered.length === 0 ? (
            <div className="search-select-empty">No matches</div>
          ) : (
            filtered.map((opt) => (
              <button type="button" key={opt.value} className="search-select-opt" onClick={() => choose(opt)}>
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
