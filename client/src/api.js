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
export const syncNow = () => flushQueue((op) => netRequest(op.path, { method: op.method, body: op.body != null ? JSON.stringify(op.body) : undefined }))

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

// Build ?mode=&branch= — branch lets admins target one branch (non-admins are
// scoped to their own branch server-side regardless).
const scopeQs = (mode, branch) => {
  const p = new URLSearchParams()
  if (mode) p.set('mode', mode)
  if (branch) p.set('branch', branch)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const listEntries = (mode, branch) => request(`/api/reports${scopeQs(mode, branch)}`)

export const createEntry = (entry) =>
  request('/api/reports', { method: 'POST', body: JSON.stringify(entry) })

export const updateEntry = (id, entry) =>
  request(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify(entry) })

export const deleteEntry = (id) =>
  request(`/api/reports/${id}`, { method: 'DELETE' })

export const clearEntries = (mode, branch) => request(`/api/reports${scopeQs(mode, branch)}`, { method: 'DELETE' })

export const getOptions = () => request('/api/options')

export const saveOptions = (data) =>
  request('/api/options', { method: 'PUT', body: JSON.stringify(data) })

export const getSavedReports = () => request('/api/saved-reports')

export const saveReport = (meta = {}) =>
  request('/api/saved-reports', { method: 'POST', body: JSON.stringify(meta) })

export const loadSavedReport = (id) =>
  request(`/api/saved-reports/${id}/load`, { method: 'POST' })

export const deleteSavedReport = (id) =>
  request(`/api/saved-reports/${id}`, { method: 'DELETE' })

const monthlyQs = (month, branch) =>
  `?month=${encodeURIComponent(month)}&branch=${encodeURIComponent(branch)}`

export const getMonthly = (month, branch) => request(`/api/monthly${monthlyQs(month, branch)}`)

export const saveMonthly = (month, branch, data) =>
  request('/api/monthly', { method: 'PUT', body: JSON.stringify({ month, branch, data }) })

export const clearMonthly = (month, branch) =>
  request(`/api/monthly${monthlyQs(month, branch)}`, { method: 'DELETE' })

const branchQs = (branch) => (branch ? `?branch=${encodeURIComponent(branch)}` : '')

export const getInventory = (branch) => request(`/api/inventory${branchQs(branch)}`)

export const createInventory = (item) =>
  request('/api/inventory', { method: 'POST', body: JSON.stringify(item) })

export const updateInventory = (id, item) =>
  request(`/api/inventory/${id}`, { method: 'PUT', body: JSON.stringify(item) })

export const deleteInventory = (id) => request(`/api/inventory/${id}`, { method: 'DELETE' })

export const getInventoryTxns = (id) => request(`/api/inventory/${id}/transactions`)

// ---- Auth ----
export const getMe = () => request('/api/auth/me')
export const login = (username, password) =>
  request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
export const logout = () => request('/api/auth/logout', { method: 'POST' })
export const requestCredentials = (data) =>
  request('/api/auth/request', { method: 'POST', body: JSON.stringify(data) })

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
