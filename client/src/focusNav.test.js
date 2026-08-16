import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { advanceOnEnter, isReachableField, nextFieldIndex } from './focusNav.js'

// A field stub: only the properties focusNav actually reads.
const field = (props = {}) => ({ tagName: 'INPUT', focus() { this.focused = true }, ...props })

describe('isReachableField', () => {
  test('an ordinary field is reachable', () => {
    assert.equal(isReachableField(field()), true)
  })

  test('disabled, read-only, hidden and type=hidden are skipped', () => {
    assert.equal(isReachableField(field({ disabled: true })), false)
    assert.equal(isReachableField(field({ readOnly: true })), false)
    assert.equal(isReachableField(field({ hidden: true })), false)
    assert.equal(isReachableField(field({ type: 'hidden' })), false)
  })

  test('a negative tabIndex is skipped — it is out of the tab order by choice', () => {
    assert.equal(isReachableField(field({ tabIndex: -1 })), false)
    assert.equal(isReachableField(field({ tabIndex: 0 })), true)
  })

  test('a field with no layout box is skipped', () => {
    assert.equal(isReachableField(field({ offsetParent: null })), false)
  })

  test('a row inside an open dropdown is not a field of the form behind it', () => {
    assert.equal(isReachableField(field({ closest: (s) => s.includes('menu') })), false)
    assert.equal(isReachableField(field({ closest: () => null })), true)
  })

  test('nothing is not a field', () => {
    assert.equal(isReachableField(null), false)
    assert.equal(isReachableField(undefined), false)
  })
})

describe('nextFieldIndex', () => {
  const [a, b, c] = [field(), field(), field()]
  test('steps forward through the list', () => {
    assert.equal(nextFieldIndex([a, b, c], a), 1)
    assert.equal(nextFieldIndex([a, b, c], b), 2)
  })

  test('the last field reports no next', () => {
    assert.equal(nextFieldIndex([a, b, c], c), -1)
  })

  test('a field not in the list reports no next', () => {
    assert.equal(nextFieldIndex([a, b], c), -1)
    assert.equal(nextFieldIndex([], a), -1)
  })
})

// A container stub: querySelectorAll returns whatever fields it was built with.
const scopeOf = (fields) => ({ querySelectorAll: () => fields })
const enterOn = (target, fields, extra = {}) => {
  const e = {
    key: 'Enter',
    target,
    currentTarget: scopeOf(fields),
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true },
    ...extra,
  }
  return e
}

describe('advanceOnEnter', () => {
  test('Enter moves focus to the next field and suppresses submission', () => {
    const [a, b] = [field(), field()]
    const e = enterOn(a, [a, b])
    advanceOnEnter(e)
    assert.equal(b.focused, true)
    assert.equal(e.defaultPrevented, true, 'must not also submit the form')
  })

  test('Enter on the last field runs the form action instead of moving', () => {
    const [a, b] = [field(), field()]
    let ran = 0
    advanceOnEnter(enterOn(b, [a, b]), () => (ran += 1))
    assert.equal(ran, 1)
    assert.equal(a.focused, undefined, 'focus must not jump anywhere')
  })

  test('with no action, the last field wraps to the first rather than dying', () => {
    const [a, b] = [field(), field()]
    advanceOnEnter(enterOn(b, [a, b]))
    assert.equal(a.focused, true)
  })

  test('any other key is left alone', () => {
    const [a, b] = [field(), field()]
    const e = enterOn(a, [a, b], { key: 'a' })
    advanceOnEnter(e)
    assert.equal(b.focused, undefined)
    assert.equal(e.defaultPrevented, false)
  })

  // A SearchSelect commits its highlighted option on Enter and calls
  // preventDefault; focus must stay so the user can see what they picked.
  test('an Enter already handled by the control is not stepped past', () => {
    const [a, b] = [field(), field()]
    let ran = 0
    advanceOnEnter(enterOn(a, [a, b], { defaultPrevented: true }), () => (ran += 1))
    assert.equal(b.focused, undefined)
    assert.equal(ran, 0)
  })

  test('a textarea keeps Enter for newlines', () => {
    const ta = field({ tagName: 'TEXTAREA' })
    const b = field()
    const e = enterOn(ta, [ta, b])
    advanceOnEnter(e)
    assert.equal(b.focused, undefined)
    assert.equal(e.defaultPrevented, false, 'the newline must still be inserted')
  })

  test('unreachable fields are stepped over, not focused', () => {
    const a = field()
    const hidden = field({ disabled: true })
    const c = field()
    advanceOnEnter(enterOn(a, [a, hidden, c]))
    assert.equal(hidden.focused, undefined)
    assert.equal(c.focused, true)
  })

  test('Enter from something that is not a field of this form is ignored', () => {
    const [a, b] = [field(), field()]
    const stray = field()
    let ran = 0
    const e = enterOn(stray, [a, b], {})
    advanceOnEnter(e, () => (ran += 1))
    assert.equal(e.defaultPrevented, false)
    assert.equal(ran, 0)
  })
})
