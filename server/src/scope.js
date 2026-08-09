/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Branch-scoping for non-admin users. Non-admins get a separate workspace:
 * they only see and touch data for their own branch. Admins see everything
 * (optionally narrowed to one branch via an explicit param).
 */

const ALL = 'All Branches'

export const isAdmin = (req) => req.user?.role === 'admin'

// The branch a WRITE (create/save) should be tagged with.
export function writeBranch(req, requested) {
  if (isAdmin(req)) {
    const b = String(requested ?? '').trim()
    return b === ALL ? '' : b
  }
  return req.user?.branch || ''
}

// A Prisma where-fragment limiting reads to what this user may see.
// Non-admin: only their branch. Admin: all, or one branch if asked.
export function branchWhere(req, requested) {
  if (!isAdmin(req)) return { branch: req.user?.branch || '' }
  const b = String(requested ?? '').trim()
  return b && b !== ALL ? { branch: b } : {}
}

// May this user read/modify a row belonging to `rowBranch`?
export function canAccessBranch(req, rowBranch) {
  if (isAdmin(req)) return true
  return (rowBranch || '') === (req.user?.branch || '')
}
