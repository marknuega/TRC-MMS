// Empty in dev (Vite proxies /api to localhost:3000).
// Set to the deployed API origin on Railway.
const BASE = import.meta.env.VITE_API_URL ?? ''

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}

export const listEntries = () => request('/api/reports')

export const createEntry = (entry) =>
  request('/api/reports', { method: 'POST', body: JSON.stringify(entry) })

export const deleteEntry = (id) =>
  request(`/api/reports/${id}`, { method: 'DELETE' })

export const clearEntries = () => request('/api/reports', { method: 'DELETE' })

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

export const getInventory = () => request('/api/inventory')

export const createInventory = (item) =>
  request('/api/inventory', { method: 'POST', body: JSON.stringify(item) })

export const updateInventory = (id, item) =>
  request(`/api/inventory/${id}`, { method: 'PUT', body: JSON.stringify(item) })

export const deleteInventory = (id) => request(`/api/inventory/${id}`, { method: 'DELETE' })

export const importInventory = (items) =>
  request('/api/inventory/import', { method: 'POST', body: JSON.stringify({ items }) })
