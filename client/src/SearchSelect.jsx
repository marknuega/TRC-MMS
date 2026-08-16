/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * A type-to-search, single-value picker. Same job as
 * <input list="..."><datalist>, but self-rendered rather than the browser's
 * native datalist popup — that popup ignores CSS entirely (font-size, row
 * height and width are OS-controlled, not page-controlled) and on some
 * displays balloons up large enough to cover most of the screen. This stays
 * a fixed, capped size regardless of how many options there are.
 */

import { useEffect, useRef, useState } from 'react'

export default function SearchSelect({
  value,
  options,
  onSelect, // called with the exact matched option string when one is chosen
  placeholder = 'Type to search, or pick —',
  disabled = false,
  className = '',
}) {
  const [text, setText] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Stay in sync when the caller resets the value after a successful pick.
  useEffect(() => setText(value ?? ''), [value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = text.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options

  function choose(opt) {
    setText(opt)
    setOpen(false)
    onSelect(opt)
  }

  function change(e) {
    const v = e.target.value
    setText(v)
    setOpen(true)
    // Typing the full option out (not just picking from the list) still
    // commits it — matches how the native datalist version behaved.
    const hit = options.find((o) => o.toLowerCase() === v.trim().toLowerCase())
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
              <button type="button" key={opt} className="search-select-opt" onClick={() => choose(opt)}>
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
