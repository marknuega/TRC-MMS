/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * scope.js is the single choke point every data route (reports, inventory,
 * monthly, savedReports) funnels through for branch-level access control.
 * These are pure-function unit tests against fabricated req objects — no
 * server/DB needed — covering the three-tier shape: admin (unrestricted),
 * director (whole-region or one in-region branch), plain user (own branch
 * only).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isAdmin, isDirector, writeBranch, branchWhere, canAccessBranch } from '../src/scope.js'

const ALL = 'All Branches'

const adminReq = { user: { role: 'admin' } }
const userReq = { user: { role: 'user', branch: 'Makkah' } }
const directorReq = { user: { role: 'director', region: 'Western Region' }, regionBranches: ['Makkah', 'Jeddah', 'Taif'] }

describe('isAdmin / isDirector', () => {
  test('identify the role correctly', () => {
    assert.equal(isAdmin(adminReq), true)
    assert.equal(isDirector(adminReq), false)
    assert.equal(isAdmin(directorReq), false)
    assert.equal(isDirector(directorReq), true)
    assert.equal(isAdmin(userReq), false)
    assert.equal(isDirector(userReq), false)
  })
})

describe('writeBranch', () => {
  test('admin: writes the requested branch, ALL collapses to unscoped', () => {
    assert.equal(writeBranch(adminReq, 'Jeddah'), 'Jeddah')
    assert.equal(writeBranch(adminReq, ALL), '')
  })

  test('director: writes an in-region branch; no branch / ALL collapse to unscoped', () => {
    assert.equal(writeBranch(directorReq, 'Jeddah'), 'Jeddah')
    assert.equal(writeBranch(directorReq, ALL), '')
    assert.equal(writeBranch(directorReq, ''), '')
  })

  test('director: an explicit out-of-region branch is `null` — a hard reject, not the same blank as "no branch"', () => {
    // Regression: these two cases used to collapse to the same '', which let an
    // out-of-region write through tagged branch: '' — silently orphaned, since
    // no non-admin's branchWhere() ever matches ''. Every writeBranch() call
    // site must check for null and reject with 400, never write it.
    assert.equal(writeBranch(directorReq, 'Dammam'), null)
    assert.notEqual(writeBranch(directorReq, 'Dammam'), writeBranch(directorReq, ''))
  })

  test('user: always writes their own branch, ignoring whatever was requested', () => {
    assert.equal(writeBranch(userReq, 'Jeddah'), 'Makkah')
    assert.equal(writeBranch(userReq, ALL), 'Makkah')
  })
})

describe('branchWhere', () => {
  test('admin: unscoped by default, narrows to one branch on request', () => {
    assert.deepEqual(branchWhere(adminReq), {})
    assert.deepEqual(branchWhere(adminReq, ALL), {})
    assert.deepEqual(branchWhere(adminReq, 'Jeddah'), { branch: 'Jeddah' })
  })

  test('director: whole region by default, narrows to one in-region branch on request', () => {
    assert.deepEqual(branchWhere(directorReq), { branch: { in: ['Makkah', 'Jeddah', 'Taif'] } })
    assert.deepEqual(branchWhere(directorReq, ALL), { branch: { in: ['Makkah', 'Jeddah', 'Taif'] } })
    assert.deepEqual(branchWhere(directorReq, 'Taif'), { branch: 'Taif' })
  })

  test('director: an out-of-region branch is denied, not silently widened to the whole region', () => {
    const where = branchWhere(directorReq, 'Dammam')
    assert.notDeepEqual(where, { branch: { in: ['Makkah', 'Jeddah', 'Taif'] } })
    assert.notEqual(where.branch, 'Dammam')
  })

  test('user: always scoped to their own branch, regardless of what was requested', () => {
    assert.deepEqual(branchWhere(userReq), { branch: 'Makkah' })
    assert.deepEqual(branchWhere(userReq, 'Jeddah'), { branch: 'Makkah' })
  })
})

/*
 * An admin may narrow their VIEW to one region. The rule it has to keep is
 * absolute: with a region named, only that region's branches are ever returned
 * — no total, no list and no export may contain a branch from outside it.
 *
 * Membership comes from req.regions, resolved in auth.js from AppOptions, so
 * the request names the region but never says what is in it.
 */
describe('branchWhere with an admin region', () => {
  const regions = {
    'Western Region': ['Makkah', 'Jeddah', 'Taif'],
    'Eastern Region': ['Dammam', 'Al Khobar'],
    'Empty Region': [],
  }
  const adminInRegion = { user: { role: 'admin' }, regions }

  test("narrows to exactly that region's branches", () => {
    assert.deepEqual(branchWhere(adminInRegion, '', 'Western Region'), { branch: { in: ['Makkah', 'Jeddah', 'Taif'] } })
    assert.deepEqual(branchWhere(adminInRegion, ALL, 'Eastern Region'), { branch: { in: ['Dammam', 'Al Khobar'] } })
  })

  test('one branch inside the region still narrows to that branch', () => {
    assert.deepEqual(branchWhere(adminInRegion, 'Taif', 'Western Region'), { branch: 'Taif' })
  })

  // The failure this scope exists to prevent: a region view showing another
  // region's data. Serving the branch anyway, or widening to the whole region,
  // would both be wrong — the request is answered with nothing.
  test('a branch OUTSIDE the region matches nothing — never the branch, never the region', () => {
    const where = branchWhere(adminInRegion, 'Dammam', 'Western Region')
    assert.notEqual(where.branch, 'Dammam')
    assert.notDeepEqual(where, { branch: { in: regions['Western Region'] } })
    assert.notDeepEqual(where, {})
  })

  // {} means EVERY branch in the company. An empty or unknown region must never
  // collapse to it — that is the one answer that turns a scope into its opposite.
  test('an empty or unknown region matches nothing, never everything', () => {
    for (const r of ['Empty Region', 'Region That Was Deleted']) {
      const where = branchWhere(adminInRegion, '', r)
      assert.notDeepEqual(where, {}, `${r} must not be unscoped`)
      assert.notDeepEqual(where, { branch: { in: [] } }, `${r} must not be an in-nothing that reads as a list`)
    }
  })

  test('no region named leaves the admin unscoped, exactly as before', () => {
    assert.deepEqual(branchWhere(adminInRegion, '', ''), {})
    assert.deepEqual(branchWhere(adminInRegion, ALL, undefined), {})
    assert.deepEqual(branchWhere(adminInRegion, 'Jeddah', ''), { branch: 'Jeddah' })
  })

  // A director's region is theirs by account, not by request — the parameter is
  // not an opportunity to name someone else's.
  test('a director cannot reach another region by naming one', () => {
    assert.deepEqual(branchWhere(directorReq, '', 'Eastern Region'), { branch: { in: ['Makkah', 'Jeddah', 'Taif'] } })
    assert.notEqual(branchWhere(directorReq, 'Dammam', 'Eastern Region').branch, 'Dammam')
  })

  test('a plain user is untouched by it', () => {
    assert.deepEqual(branchWhere(userReq, '', 'Eastern Region'), { branch: 'Makkah' })
  })
})

describe('canAccessBranch', () => {
  test('admin: can access any branch', () => {
    assert.equal(canAccessBranch(adminReq, 'Jeddah'), true)
    assert.equal(canAccessBranch(adminReq, 'Dammam'), true)
  })

  test('director: can access only their region\'s branches', () => {
    assert.equal(canAccessBranch(directorReq, 'Makkah'), true)
    assert.equal(canAccessBranch(directorReq, 'Taif'), true)
    assert.equal(canAccessBranch(directorReq, 'Dammam'), false)
  })

  test('user: can access only their own branch', () => {
    assert.equal(canAccessBranch(userReq, 'Makkah'), true)
    assert.equal(canAccessBranch(userReq, 'Jeddah'), false)
  })
})
