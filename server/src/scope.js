/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Branch-scoping for non-admin users. Plain users get a separate workspace:
 * they only see and touch data for their own branch. A director runs one
 * whole region as an independent workspace: sees/writes every branch in
 * req.regionBranches (resolved once per request by auth.js's loadUser()),
 * optionally narrowed to one in-region branch. Admins see everything
 * (optionally narrowed to one branch via an explicit param).
 */

const ALL = 'All Branches'

export const isAdmin = (req) => req.user?.role === 'admin'
export const isDirector = (req) => req.user?.role === 'director'

// The branch a WRITE (create/save) should be tagged with. Returns `null` —
// never a string — when the caller must reject the request outright rather
// than write/query anything: a director naming a branch outside their
// region is a real deny, not the same as "no branch specified" (which
// legitimately resolves to '', mirroring how admin's ALL_BRANCHES already
// works). Collapsing those two into one blank string let an out-of-region
// write through silently, tagged with branch: '' — invisible to the
// director who made it and to every other non-admin, a write that looks
// like it succeeded but effectively vanishes. Every call site must check
// for `null` and reject with 400 before touching the database.
export function writeBranch(req, requested) {
  if (isAdmin(req)) {
    const b = String(requested ?? '').trim()
    return b === ALL ? '' : b
  }
  if (isDirector(req)) {
    const b = String(requested ?? '').trim()
    const region = req.regionBranches || []
    if (b === ALL || !b) return ''
    return region.includes(b) ? b : null
  }
  return req.user?.branch || ''
}

// A Prisma where-fragment limiting reads to what this user may see.
// Plain user: only their branch. Director: their region, or one in-region
// branch if asked. Admin: all, or one branch if asked.
export function branchWhere(req, requested) {
  if (isAdmin(req)) {
    const b = String(requested ?? '').trim()
    return b && b !== ALL ? { branch: b } : {}
  }
  if (isDirector(req)) {
    const region = req.regionBranches || []
    const b = String(requested ?? '').trim()
    if (b && b !== ALL) return region.includes(b) ? { branch: b } : { branch: '__none__' }
    return { branch: { in: region } }
  }
  return { branch: req.user?.branch || '' }
}

// May this user read/modify a row belonging to `rowBranch`?
export function canAccessBranch(req, rowBranch) {
  if (isAdmin(req)) return true
  if (isDirector(req)) return (req.regionBranches || []).includes(rowBranch || '')
  return (rowBranch || '') === (req.user?.branch || '')
}
