// Empty in dev (Vite proxies /api to localhost:3000).
// Set to the deployed API origin on Railway.
const BASE = import.meta.env.VITE_API_URL ?? ''

import { getCache, putCache, queueMutation, flushQueue, notify } from './offline.js'

// Raw network call. Throws a tagged { offline:true } error when the network is
// unreachable, and a normal Error for an HTTP failure the server returned.
async function netRequest(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      cache: 'no-store',
      // Always send the session cookie. fetch's default is 'same-origin', which
      // is enough while the server serves the client, but silently drops the
      // cookie the moment VITE_API_URL points at a separate origin (as
      // .env.example directs on Railway) — every call would 401 and the sync
      // queue would stall on authExpired. Matches the service worker's
      // background sync, which posts with credentials too.
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    const e = new Error('offline')
    e.offline = true
    throw e
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const e = new Error(body.error || `Request failed: ${res.status}`)
    e.status = res.status
    throw e
  }
  return res.status === 204 ? null : res.json()
}

// Replay any queued writes to the server (used on reconnect / after a call).
export const syncNow = () =>
  flushQueue((op) =>
    netRequest(op.path, { method: op.method, body: op.body != null ? JSON.stringify(op.body) : undefined }),
  )

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const body = options.body ? JSON.parse(options.body) : undefined

  if (method === 'GET') {
    try {
      const data = await netRequest(path, options)
      putCache(path, data) // keep a fresh copy for offline reads
      return data
    } catch (err) {
      // Offline OR briefly rate-limited (429): serve the last-known data instead
      // of a hard error so the UI keeps working.
      if (err.offline || err.status === 429) {
        const cached = await getCache(path)
        if (cached !== undefined) return cached
      }
      throw err
    }
  }

  // Mutation: try the network; if it's a real HTTP error, surface it. If the
  // network is down, apply the change optimistically and queue it for sync.
  try {
    const data = await netRequest(path, options)
    syncNow()
    return data
  } catch (err) {
    if (err.offline) return queueMutation(method, path, body)
    throw err
  }
}

// Sync whenever the connection returns.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notify()
    syncNow()
  })
  window.addEventListener('offline', () => notify())
}

// Build ?mode=&branch=&region= — branch lets admins target one branch and
// region lets them narrow to one region's branches (non-admins are scoped
// server-side regardless, and a director's own region always wins). Absent
// means unnarrowed, so nothing has to agree on a sentinel value.
const scopeQs = (mode, branch, region) => {
  const p = new URLSearchParams()
  if (mode) p.set('mode', mode)
  if (branch) p.set('branch', branch)
  if (region) p.set('region', region)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const listEntries = (mode, branch, region) => request(`/api/reports${scopeQs(mode, branch, region)}`)

export const createEntry = (entry) => request('/api/reports', { method: 'POST', body: JSON.stringify(entry) })

export const updateEntry = (id, entry) => request(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify(entry) })

export const deleteEntry = (id) => request(`/api/reports/${id}`, { method: 'DELETE' })

export const clearEntries = (mode, branch) => request(`/api/reports${scopeQs(mode, branch)}`, { method: 'DELETE' })

export const getOptions = () => request('/api/options')

export const saveOptions = (data) => request('/api/options', { method: 'PUT', body: JSON.stringify(data) })

// The CDS code map — the vocabulary shared with the WhatsApp bot. Reading needs
// a session; the PUT is admin-gated server-side, since every technician's
// decode resolves through it.
export const getCodeMap = () => request('/api/codemap')

export const saveCodeMap = (data) => request('/api/codemap', { method: 'PUT', body: JSON.stringify(data) })

export const getSavedReports = () => request('/api/saved-reports')

export const saveReport = (meta = {}) => request('/api/saved-reports', { method: 'POST', body: JSON.stringify(meta) })

export const loadSavedReport = (id) => request(`/api/saved-reports/${id}/load`, { method: 'POST' })

export const deleteSavedReport = (id) => request(`/api/saved-reports/${id}`, { method: 'DELETE' })

// Mark/unmark a saved report as reference-only (record kept, no parts used).
export const setSavedReportReference = (id, isReferenceOnly) =>
  request(`/api/saved-reports/${id}`, { method: 'PATCH', body: JSON.stringify({ isReferenceOnly }) })

const monthlyQs = (month, branch) => `?month=${encodeURIComponent(month)}&branch=${encodeURIComponent(branch)}`

export const getMonthly = (month, branch) => request(`/api/monthly${monthlyQs(month, branch)}`)

export const saveMonthly = (month, branch, data) =>
  request('/api/monthly', { method: 'PUT', body: JSON.stringify({ month, branch, data }) })

export const clearMonthly = (month, branch) => request(`/api/monthly${monthlyQs(month, branch)}`, { method: 'DELETE' })

const branchQs = (branch, region) => {
  const p = new URLSearchParams()
  if (branch) p.set('branch', branch)
  if (region) p.set('region', region)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const getInventory = (branch, region) => request(`/api/inventory${branchQs(branch, region)}`)

export const createInventory = (item) => request('/api/inventory', { method: 'POST', body: JSON.stringify(item) })

export const updateInventory = (id, item) =>
  request(`/api/inventory/${id}`, { method: 'PUT', body: JSON.stringify(item) })

export const deleteInventory = (id) => request(`/api/inventory/${id}`, { method: 'DELETE' })

export const getInventoryTxns = (id) => request(`/api/inventory/${id}/transactions`)

// ---- Auth ----
export const getMe = () => request('/api/auth/me')
// Never queued for offline replay: a failed login attempt isn't a durable
// write to retry later (stale credentials would just retry forever and, on a
// 401, stall the entire sync queue — see flushQueue's authExpired handling).
export const login = (username, password) =>
  netRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
export const logout = () => request('/api/auth/logout', { method: 'POST' })
export const requestCredentials = (data) => request('/api/auth/request', { method: 'POST', body: JSON.stringify(data) })

// ---- Admin ----
export const getUsers = () => request('/api/admin/users')
export const createUser = (data) => request('/api/admin/users', { method: 'POST', body: JSON.stringify(data) })
export const updateUser = (id, data) => request(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteUser = (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' })
export const getCredentialRequests = () => request('/api/admin/requests')
export const updateCredentialRequest = (id, data) =>
  request(`/api/admin/requests/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteCredentialRequest = (id) => request(`/api/admin/requests/${id}`, { method: 'DELETE' })

export const importInventory = (items, branch) =>
  request('/api/inventory/import', { method: 'POST', body: JSON.stringify({ items, branch }) })

// ---- Whole-database backup (admin only) ----
//
// These deliberately bypass `request`: it caches GETs and queues failed writes
// for replay, both of which are wrong here. A stale cached export would restore
// yesterday's database believing it was today's, and a whole-database replace
// replayed later from an offline queue — against whatever the server holds by
// then — is the single most destructive thing this app could do unattended.
//
// The export arrives as a file rather than JSON, because the point of taking one
// is keeping it: a blob rendered into a tab is a backup nobody saved.
export async function downloadBackup() {
  const res = await fetch(`${BASE}/api/backup/export`, { cache: 'no-store', credentials: 'include' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Export failed: ${res.status}`)
  }
  const blob = await res.blob()
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'trc-mms-backup.json'
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return name
}

/** What each table currently holds, so a screen can say what is about to be replaced. */
export const getBackupCounts = () => netRequest('/api/backup/counts')

/** Replace every table in the document. `skip` names tables to leave alone. */
export async function restoreBackup(doc, skip = []) {
  const qs = new URLSearchParams({ confirm: 'replace' })
  if (skip.length) qs.set('skip', skip.join(','))
  const res = await fetch(`${BASE}/api/backup/import?${qs}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Restore failed: ${res.status}`)
  return body
}
