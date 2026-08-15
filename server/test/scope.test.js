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

  test('director: writes an in-region branch, rejects out-of-region and ALL', () => {
    assert.equal(writeBranch(directorReq, 'Jeddah'), 'Jeddah')
    assert.equal(writeBranch(directorReq, 'Dammam'), '') // not in this director's region
    assert.equal(writeBranch(directorReq, ALL), '')
    assert.equal(writeBranch(directorReq, ''), '')
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
