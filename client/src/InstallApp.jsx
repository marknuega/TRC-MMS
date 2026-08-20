/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The sidebar's "Install app" affordance. The app has always been installable —
 * manifest + service worker + HTTPS are all in place — but the only way in was
 * the browser's own menu, which nobody finds. This surfaces it.
 *
 * Two entirely separate paths, because only one browser family gives us an API:
 *  - Chrome/Edge/Samsung fire `beforeinstallprompt`. We keep the event and
 *    replay it on click, which opens the real native install dialog.
 *  - Safari (every iPhone/iPad, since iOS has no other engine) fires nothing
 *    and exposes no API. The only route is Share -> Add to Home Screen, so all
 *    we can do is show the steps and let the user drive.
 *
 * Both stay hidden once the app is already installed — a launcher icon that
 * offers to install itself again is just confusing.
 */

import { useEffect, useState } from 'react'

// The app is already running from the home screen / launcher, not a browser tab.
// `display-mode: standalone` covers Chromium and modern Safari; the legacy
// `navigator.standalone` flag is what older iOS reports.
function isInstalled() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    navigator.standalone === true
  )
}

// iPadOS 13+ deliberately reports a desktop Mac UA, so the touch count is what
// separates a real Mac (0) from an iPad pretending to be one.
function isIos() {
  const ua = navigator.userAgent || ''
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

// Every iOS browser is Safari underneath, but only Safari itself gets the
// "Add to Home Screen" item — Chrome/Firefox/Edge on iOS ship a Share sheet
// without it. Those users have to switch browsers, so we tell them so.
function isIosSafari() {
  const ua = navigator.userAgent || ''
  return isIos() && !/crios|fxios|edgios|opios/i.test(ua)
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState(null) // the saved beforeinstallprompt event
  const [installed, setInstalled] = useState(isInstalled)
  const [sheet, setSheet] = useState(false) // iOS instructions open?

  useEffect(() => {
    // Chromium fires this instead of showing its own mini-infobar once the
    // install criteria are met. Preventing the default keeps the decision ours.
    function onPrompt(e) {
      e.preventDefault()
      setPrompt(e)
    }
    function onInstalled() {
      setPrompt(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // Installing from the browser's own menu fires `appinstalled` in some
    // builds and nothing at all in others — watching the display mode catches
    // the rest, and also flips the UI when a standalone window is opened.
    const mq = window.matchMedia?.('(display-mode: standalone)')
    const onMode = (e) => e.matches && setInstalled(true)
    mq?.addEventListener?.('change', onMode)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      mq?.removeEventListener?.('change', onMode)
    }
  }, [])

  async function install() {
    if (!prompt) return
    prompt.prompt()
    try {
      await prompt.userChoice
    } catch {
      /* dialog dismissed by the browser — nothing to do */
    }
    // The event is single-use whichever way the user answered. Chromium fires a
    // fresh one on a later visit if they declined, so dropping it is safe.
    setPrompt(null)
  }

  if (installed) return null

  if (prompt) {
    return (
      <button
        type="button"
        className="sync-pill install"
        onClick={install}
        title="Install TRC-MMS on this device — opens in its own window and works offline"
      >
        <span className="side-ico">⬇️</span>
        <span className="side-label">
          Install app
          <small>Own window · works offline</small>
        </span>
      </button>
    )
  }

  if (isIos()) {
    return (
      <>
        <button
          type="button"
          className="sync-pill install"
          onClick={() => setSheet(true)}
          title="How to add TRC-MMS to your home screen"
        >
          <span className="side-ico">⬇️</span>
          <span className="side-label">
            Install app
            <small>Add to Home Screen</small>
          </span>
        </button>
        {sheet && <IosSheet safari={isIosSafari()} onClose={() => setSheet(false)} />}
      </>
    )
  }

  // Desktop Firefox, Safari on macOS, or Chromium that has not met the install
  // criteria yet. Nothing honest to offer, so show nothing.
  return null
}

// Safari gives no install API at all, so this is a plain instruction card.
// There is no way to confirm the user followed it — the pill disappears on its
// own the next time the app opens, because it then opens standalone.
function IosSheet({ safari, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal install-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Install TRC-MMS"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>Install TRC-MMS</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {safari ? (
          <ol className="install-steps">
            <li>
              Tap the <strong>Share</strong> button at the bottom of Safari — the square with an arrow pointing up.
            </li>
            <li>
              Scroll down the list and tap <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong> in the top-right corner.
            </li>
          </ol>
        ) : (
          <>
            <p className="install-note">
              This browser can’t add apps to the home screen on iPhone or iPad — only <strong>Safari</strong> can.
            </p>
            <ol className="install-steps">
              <li>
                Open <strong>trc-mms.up.railway.app</strong> in <strong>Safari</strong>.
              </li>
              <li>
                Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong>.
              </li>
            </ol>
          </>
        )}
        <p className="install-note">
          TRC-MMS then opens like a normal app — its own icon, no browser bars, and reports you enter offline sync as
          soon as you reconnect.
        </p>
      </div>
    </div>
  )
}
