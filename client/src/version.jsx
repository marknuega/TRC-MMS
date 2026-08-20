/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Which build is actually running, and whether it has fallen behind the server.
 *
 * This exists because of a specific recurring bug: the report calculation rules
 * live in client/src/report.js, so a stale bundle does not look broken — it
 * quietly produces different numbers from the same data, and the only symptom is
 * someone noticing a total is wrong. Two defences:
 *
 *   BUILD_ID    compiled in by Vite, shown in the footer, so "which code is this
 *               tab running" is readable rather than guessable.
 *   UpdateBanner polls the server's build id and says so when they diverge —
 *               the case of a tab left open across a deploy, which no amount of
 *               cache-header correctness can fix on its own.
 */

import { useEffect, useState } from 'react'

// Defined by vite.config.js. The fallback keeps `npm test` and any non-Vite
// consumer working, since neither goes through the bundler's define.
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

const POLL_MS = 5 * 60 * 1000

export function UpdateBanner() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    // A build that does not know its own id has nothing to compare against —
    // that is a dev server, where the bundler already hot-reloads.
    if (BUILD_ID === 'dev') return
    let cancelled = false

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) return
        const { buildId } = await res.json()
        // A null id means the server cannot tell (no dist/), which is not the
        // same as a mismatch — saying "update available" there would be a lie
        // the user could never clear.
        if (!cancelled && buildId && buildId !== BUILD_ID) setStale(true)
      } catch {
        // Offline, or the server is mid-deploy. Neither is news; try again later.
      }
    }

    check()
    const timer = setInterval(check, POLL_MS)
    // Coming back to a tab left open overnight is exactly when this matters, and
    // is sooner than the next poll would be.
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (!stale) return null

  return (
    <div className="update-banner no-print" role="status" aria-live="polite">
      <span className="update-ico" aria-hidden="true">
        ⟳
      </span>
      <span>
        A newer version of TRC-MMS is available.
        <small>This tab is running older code — totals may not match the current rules.</small>
      </span>
      <button type="button" onClick={() => reloadToLatest()}>
        Reload now
      </button>
    </div>
  )
}

// index.html is served no-cache, so a plain reload already picks up the new
// hashed bundles. The service worker is asked to update first because it is the
// one thing that could still answer from its own cache.
async function reloadToLatest() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  } catch {
    /* no worker, or it refused — the reload below is what actually matters */
  }
  window.location.reload()
}
