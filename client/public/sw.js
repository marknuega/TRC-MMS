/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * PWA service worker: makes the app installable and offline-capable without
 * letting stale content linger.
 *  - Navigations: network-first (a new deploy always wins), cached shell when
 *    offline, and the offline page only when even that was never cached.
 *  - Hashed /assets: cache-first (immutable, fast, offline).
 *  - /api & /health: never touched — the app's own offline engine (src/offline.js)
 *    owns API caching and the write queue. A synthetic response from here would
 *    be indistinguishable from a real one to api.js, which would cache it as
 *    data and skip queueing the write.
 *
 * Background Sync drains that same queue after the tab is gone. The queue has
 * exactly one owner at a time: if any window is open it does the flushing (it
 * has the optimistic-cache reconciliation and the 401 handling), and only when
 * no window is open does this worker replay the rows itself.
 */
const CACHE = 'trc-shell-v2'
const SYNC_TAG = 'trc-sync-queue'

// Must match src/offline.js — this worker replays rows the app enqueued.
const DB_NAME = 'trc-offline'
const DB_VERSION = 1
const QUEUE_STORE = 'queue'

self.addEventListener('install', (event) => {
  // Best-effort: the offline page is the only thing worth pre-caching, since
  // the shell is cached from the first real navigation.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add('/offline.html'))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/health')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() =>
          caches
            .match('/')
            .then((r) => r || caches.match(req))
            // Nothing cached at all — first visit was offline. Show the offline
            // page rather than the browser's error screen.
            .then((r) => r || caches.match('/offline.html'))
            .then((r) => r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })),
        ),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          }),
      ),
    )
    return
  }

  event.respondWith(fetch(req).catch(() => caches.match(req)))
})

// ── Background Sync ──────────────────────────────────────────────
// Fires when the browser decides the network is back, tab open or not.
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(drainQueue())
})

self.addEventListener('message', (event) => {
  // The app asks for a sync registration when it queues a write, so a phone
  // that is locked or backgrounded still syncs.
  if (event.data?.type === 'REQUEST_SYNC') {
    self.registration.sync?.register(SYNC_TAG).catch(() => {})
  }
})

async function drainQueue() {
  // Hand off to an open window when there is one: it owns the optimistic cache
  // and knows how to stop on a 401. Replaying here as well would double-post.
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  if (clients.length) {
    clients.forEach((c) => c.postMessage({ type: 'FLUSH_QUEUE' }))
    return
  }

  // No window open — replay the rows here, in the same order and with the same
  // stop conditions src/offline.js uses.
  const rows = await queueRows()
  for (const op of rows) {
    let res
    try {
      res = await fetch(op.path, {
        method: op.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // session cookie
        cache: 'no-store',
        body: op.body != null ? JSON.stringify(op.body) : undefined,
      })
    } catch {
      return // still offline — keep the rest queued, retry on the next sync
    }
    // Session expired while the app was closed. Keep the queue intact; the
    // banner prompts a re-login and the next flush resumes here.
    if (res.status === 401) return
    // 2xx, or a rejection the server will keep rejecting: drop it either way so
    // one bad row cannot block everything behind it.
    await deleteRow(op.id)
  }
}

// ── IndexedDB (read-only view of the app's queue) ────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    // Never upgrades: the app creates the schema. Opening at the same version
    // just attaches, and if the app has never run there is nothing to drain.
    const r = indexedDB.open(DB_NAME, DB_VERSION)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function queueRows() {
  return openDB()
    .then(
      (d) =>
        new Promise((resolve, reject) => {
          if (!d.objectStoreNames.contains(QUEUE_STORE)) return resolve([])
          const req = d.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll()
          req.onsuccess = () => resolve((req.result ?? []).sort((a, b) => a.id - b.id))
          req.onerror = () => reject(req.error)
        }),
    )
    .catch(() => [])
}

function deleteRow(id) {
  return openDB()
    .then(
      (d) =>
        new Promise((resolve) => {
          if (!d.objectStoreNames.contains(QUEUE_STORE)) return resolve()
          const t = d.transaction(QUEUE_STORE, 'readwrite')
          t.objectStore(QUEUE_STORE).delete(id)
          t.oncomplete = () => resolve()
          t.onerror = () => resolve()
        }),
    )
    .catch(() => {})
}
