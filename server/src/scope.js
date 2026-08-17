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

// Nothing at all. A region with no branches must read as "no rows", never as
// "no filter" — the empty `where` an admin gets means EVERY branch in the
// company, which is the one answer a region scope must never collapse to.
const NOTHING = { branch: '__none__' }

/**
 * A Prisma where-fragment limiting reads to what this user may see.
 *
 * Plain user: only their branch. Director: their region, or one in-region
 * branch if asked. Admin: all, or one region, or one branch.
 *
 * `region` is an admin's VIEW scope — the region selected in the toolbar. It
 * only ever narrows: an admin already sees everything, so naming a region can
 * remove branches from the answer and can never add one. Its membership is read
 * from req.regions (resolved in auth.js from AppOptions), never from the
 * request, so the caller names the region but the server decides what is in it.
 */
export function branchWhere(req, requested, region) {
  if (isAdmin(req)) {
    const b = String(requested ?? '').trim()
    const r = String(region ?? '').trim()
    // No region named: every branch, or the one asked for — unchanged.
    if (!r) return b && b !== ALL ? { branch: b } : {}

    const inRegion = req.regions?.[r] ?? []
    // A branch outside the named region matches nothing rather than being
    // served anyway. The toolbar cannot offer such a pairing, so a request
    // carrying one is stale or hand-made; either way the region wins, because
    // a region view showing another region's branch is the exact failure this
    // scope exists to prevent.
    if (b && b !== ALL) return inRegion.includes(b) ? { branch: b } : NOTHING
    return inRegion.length ? { branch: { in: inRegion } } : NOTHING
  }
  if (isDirector(req)) {
    // A director's region is fixed, so the requested one is ignored rather than
    // intersected: there is nothing for it to narrow that is not already theirs.
    const own = req.regionBranches || []
    const b = String(requested ?? '').trim()
    if (b && b !== ALL) return own.includes(b) ? { branch: b } : NOTHING
    return { branch: { in: own } }
  }
  return { branch: req.user?.branch || '' }
}

// May this user read/modify a row belonging to `rowBranch`?
export function canAccessBranch(req, rowBranch) {
  if (isAdmin(req)) return true
  if (isDirector(req)) return (req.regionBranches || []).includes(rowBranch || '')
  return (rowBranch || '') === (req.user?.branch || '')
}
