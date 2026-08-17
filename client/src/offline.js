/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Offline engine: IndexedDB-backed read cache + write queue so the whole app
 * keeps working with no connection and syncs when the network returns.
 *  - Every successful GET is cached; when a GET fails offline it is served from
 *    that cache.
 *  - Mutations that fail because the network is down are applied optimistically
 *    to the cache and queued; on reconnect the queue is replayed to the server
 *    in order, then the app refetches fresh data.
 */

const DB_NAME = 'trc-offline'
const DB_VERSION = 1
const CACHE_STORE = 'cache' // key: request path -> last JSON response
const QUEUE_STORE = 'queue' // auto-increment pending mutation ops

let dbPromise
function db() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION)
    r.onupgradeneeded = () => {
      const d = r.result
      if (!d.objectStoreNames.contains(CACHE_STORE)) d.createObjectStore(CACHE_STORE)
      if (!d.objectStoreNames.contains(QUEUE_STORE)) d.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  return dbPromise
}

function idb(store, mode, run) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// ---- Read cache ----
export const getCache = (path) => idb(CACHE_STORE, 'readonly', (s) => s.get(path)).catch(() => undefined)
export const putCache = (path, data) => idb(CACHE_STORE, 'readwrite', (s) => s.put(data, path)).catch(() => {})

// ---- Write queue ----
const listQueue = () =>
  idb(QUEUE_STORE, 'readonly', (s) => s.getAll())
    .then((rows) => (rows ?? []).sort((a, b) => a.id - b.id))
    .catch(() => [])
const putQueue = (op) => idb(QUEUE_STORE, 'readwrite', (s) => s.put(op))
const delQueue = (id) => idb(QUEUE_STORE, 'readwrite', (s) => s.delete(id)).catch(() => {})

// ---- Status pub/sub (online + pending count + in-flight flush + auth state) ----
const listeners = new Set()
let flushing = false
let authExpired = false // session cookie expired mid-sync; queue is kept intact
export function onSyncChange(fn) {
  listeners.add(fn)
  notify()
  return () => listeners.delete(fn)
}
export async function notify() {
  const pending = (await listQueue()).length
  const state = { online: navigator.onLine, pending, syncing: flushing, authExpired }
  for (const fn of listeners) fn(state)
}

const tmpId = () => 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const isTempId = (id) => typeof id === 'string' && id.startsWith('tmp-')

// ---- Optimistic cache updates so the UI reflects a queued write immediately ----
async function patch(path, fn) {
  const cur = await getCache(path)
  const next = fn(cur)
  if (next !== undefined) await putCache(path, next)
}

const modeOf = (body) => (String(body?.mode ?? 'report').toLowerCase() === 'transmittal' ? 'transmittal' : 'report')
const reportsKey = (mode) => `/api/reports?mode=${mode}`

// Build an entry shaped like the server's GET /api/reports rows.
function optimisticEntry(body) {
  const mode = modeOf(body)
  return {
    id: tmpId(),
    reportDate: new Date(body.reportDate).toISOString(),
    mode,
    technician: String(body.technician ?? ''),
    agency: String(body.agency ?? '').trim() || '-',
    telNumber: String(body.telNumber ?? '').trim() || '-',
    issiNumber: String(body.issiNumber ?? '').trim() || '*',
    type: String(body.type ?? ''),
    model: String(body.model ?? '').trim() || '-',
    comment: String(body.comment ?? ''),
    faults: (Array.isArray(body.faults) ? body.faults : []).map((f, i) => ({
      id: tmpId(),
      position: i,
      issue: String(f.issue ?? ''),
      quantity: Math.max(1, Number(f.quantity) || 1),
      action: String(f.action ?? '').toUpperCase(),
      company: String(f.company ?? '').toUpperCase(),
      status: String(f.status ?? ''),
    })),
    reportId: null,
    _pending: true,
  }
}

// Returns the optimistic response to hand back to the caller (or undefined).
async function applyOptimistic(op) {
  const { method, path, body } = op
  const base = path.split('?')[0]

  // ---- Working report entries ----
  if (base === '/api/reports' && method === 'POST') {
    const entry = optimisticEntry(body)
    await patch(reportsKey(entry.mode), (list) => [entry, ...(Array.isArray(list) ? list : [])])
    op.tmpId = entry.id // so a later delete of this temp entry can cancel the create
    return entry
  }
  if (base === '/api/reports' && method === 'PUT' && /\/api\/reports\/[^/]+$/.test(path)) {
    const id = decodeURIComponent(path.split('/').pop())
    const updated = { ...optimisticEntry(body), id }
    for (const mode of ['report', 'transmittal']) {
      await patch(reportsKey(mode), (list) =>
        Array.isArray(list) ? list.map((e) => (String(e.id) === String(id) ? { ...updated, mode: e.mode } : e)) : list,
      )
    }
    if (isTempId(id)) {
      // Not yet on the server — fold the edit into the queued create instead.
      const q = await listQueue()
      const create = q.find((o) => o.tmpId === id)
      if (create) {
        create.body = { ...body, mode: modeOf(create.body) }
        await putQueue(create)
        op._skip = true
      }
    }
    return { ...updated, _pending: true }
  }
  if (base === '/api/reports' && method === 'DELETE' && /\/api\/reports\/[^/]+$/.test(path)) {
    const id = decodeURIComponent(path.split('/').pop())
    for (const mode of ['report', 'transmittal']) {
      await patch(reportsKey(mode), (list) => (Array.isArray(list) ? list.filter((e) => String(e.id) !== String(id)) : list))
    }
    if (isTempId(id)) {
      // The entry never reached the server: cancel its queued create instead of
      // sending a delete for an id the server won't recognise.
      const q = await listQueue()
      const create = q.find((o) => o.tmpId === id)
      if (create) await delQueue(create.id)
      op._skip = true
    }
    return null
  }
  if (base === '/api/reports' && method === 'DELETE') {
    const mode = String(new URLSearchParams(path.split('?')[1] || '').get('mode') || '').toLowerCase()
    const modes = mode === 'report' || mode === 'transmittal' ? [mode] : ['report', 'transmittal']
    for (const m of modes) {
      await patch(reportsKey(m), () => [])
      const q = await listQueue()
      for (const o of q.filter((x) => x.tmpId && x.path === '/api/reports' && modeOf(x.body) === m)) await delQueue(o.id)
    }
    return { cleared: 0 }
  }

  // ---- Options ----
  if (base === '/api/options' && method === 'PUT') {
    await putCache('/api/options', body)
    return body
  }

  // ---- Save report (snapshot working entries under the next doc id) ----
  if (base === '/api/saved-reports' && method === 'POST') {
    const mode = modeOf(body)
    const entries = (await getCache(reportsKey(mode))) || []
    const cache = (await getCache('/api/saved-reports')) || {
      nextReportId: 'REP-0001', nextReferenceId: 'REF-0001', nextTransmittalId: 'TRANS-0001', reports: [],
    }
    // Same three decisions the server makes on a real save, so an offline save
    // lands in the same list under the same series and does not jump between
    // them when the queue drains. Mirrors hasRtoAction()/seriesFor() in
    // routes/savedReports.js and isCountable() in report.js.
    const isReferenceOnly =
      body?.isReferenceOnly == null
        ? entries.some((e) => (e.faults ?? []).some((f) => String(f.action ?? '').trim().toUpperCase() === 'RTO'))
        : Boolean(body.isReferenceOnly)
    const series = mode === 'transmittal' ? 'TRANS' : isReferenceOnly ? 'REF' : 'REP'
    const reportId =
      series === 'TRANS' ? cache.nextTransmittalId : series === 'REF' ? cache.nextReferenceId ?? 'REF-0001' : cache.nextReportId
    const dates = [...new Set(entries.map((e) => String(e.reportDate).slice(0, 10)))].sort()
    const optimistic = {
      id: tmpId(),
      seq: Date.now(),
      docNumber: 0,
      reportId,
      branch: String(body.branch ?? ''),
      mode,
      series,
      isReferenceOnly,
      transmittedBy: String(body.transmittedBy ?? ''),
      receivedBy: String(body.receivedBy ?? ''),
      savedAt: new Date().toISOString(),
      dateLabel: dates[0] ?? '',
      entryCount: entries.length,
      entries,
      _pending: true,
    }
    const bump = (id) => id.replace(/(\d+)$/, (n) => String(Number(n) + 1).padStart(n.length, '0'))
    await putCache('/api/saved-reports', {
      ...cache,
      reports: [optimistic, ...(cache.reports ?? [])],
      // Only the series just used advances — the other two are untouched, the
      // same way the server numbers them independently.
      nextReportId: series === 'REP' ? bump(cache.nextReportId) : cache.nextReportId,
      nextReferenceId: series === 'REF' ? bump(cache.nextReferenceId ?? 'REF-0001') : cache.nextReferenceId ?? 'REF-0001',
      nextTransmittalId: series === 'TRANS' ? bump(cache.nextTransmittalId) : cache.nextTransmittalId,
    })
    return optimistic
  }

  // ---- Inventory ----
  if (base === '/api/inventory' && method === 'POST') {
    const item = { id: tmpId(), avail: Math.max(0, (Number(body.begin) || 0) - (Number(body.out) || 0)), ...body, _pending: true }
    await patch('/api/inventory', (list) => [...(Array.isArray(list) ? list : []), item])
    op.tmpId = item.id
    return item
  }
  if (/^\/api\/inventory\/[^/]+$/.test(base) && method === 'PUT') {
    const id = base.split('/').pop()
    await patch('/api/inventory', (list) =>
      (Array.isArray(list) ? list : []).map((it) =>
        String(it.id) === String(id) ? { ...it, ...body, avail: Math.max(0, (Number(body.begin) || 0) - (Number(body.out) || 0)) } : it,
      ),
    )
    if (isTempId(id)) {
      const q = await listQueue()
      const create = q.find((o) => o.tmpId === id)
      if (create) {
        create.body = { ...create.body, ...body }
        await putQueue(create)
        op._skip = true
      }
    }
    return { id, ...body }
  }
  if (/^\/api\/inventory\/[^/]+$/.test(base) && method === 'DELETE') {
    const id = base.split('/').pop()
    await patch('/api/inventory', (list) => (Array.isArray(list) ? list.filter((it) => String(it.id) !== String(id)) : list))
    if (isTempId(id)) {
      const q = await listQueue()
      const create = q.find((o) => o.tmpId === id)
      if (create) await delQueue(create.id)
      op._skip = true
    }
    return null
  }

  // ---- Monthly ----
  if (base === '/api/monthly' && method === 'PUT') {
    await putCache(`/api/monthly?month=${encodeURIComponent(body.month)}&branch=${encodeURIComponent(body.branch ?? '')}`, body.data)
    return body
  }

  return undefined // no optimistic handler — nothing to show until sync
}

// Enqueue a failed mutation (after applying its optimistic effect).
export async function queueMutation(method, path, body) {
  const op = { method, path, body }
  const optimistic = await applyOptimistic(op)
  if (!op._skip) await putQueue({ method: op.method, path: op.path, body: op.body, tmpId: op.tmpId, ts: Date.now() })
  await notify()
  return optimistic
}

// Replay the queue in order. `send(op)` performs the raw network request and
// resolves on any HTTP response, rejecting only on a network failure.
export async function flushQueue(send) {
  if (flushing || !navigator.onLine) return
  flushing = true
  authExpired = false // give a fresh attempt the benefit of the doubt each run
  await notify()
  let drained = false
  try {
    const q = await listQueue()
    for (const op of q) {
      try {
        await send(op)
        await delQueue(op.id)
      } catch (err) {
        if (err && err.offline) break // still offline — stop, keep the rest queued
        if (err && err.status === 401) {
          // Session expired while offline (e.g. laptop closed overnight). Keep
          // the queue intact — nothing is lost — and let the UI prompt a
          // re-login. The next flush (on reconnect/focus/poll) resumes here.
          authExpired = true
          break
        }
        await delQueue(op.id) // server rejected it; drop so it can't block the queue
      }
      await notify()
    }
    drained = (await listQueue()).length === 0
  } finally {
    flushing = false
    await notify()
    if (drained) window.dispatchEvent(new Event('offline-synced'))
  }
}
