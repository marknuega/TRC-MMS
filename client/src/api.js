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

export const listReports = () => request('/api/reports')

export const createReport = (report) =>
  request('/api/reports', { method: 'POST', body: JSON.stringify(report) })

export const deleteReport = (id) =>
  request(`/api/reports/${id}`, { method: 'DELETE' })
