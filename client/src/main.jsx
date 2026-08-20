/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LoginPage from './LoginPage.jsx'
import { getMe, logout, syncNow } from './api'

// Gate the whole app behind a session: show the login page until authenticated.
function Gate() {
  const [status, setStatus] = useState('loading') // loading | anon | authed
  const [user, setUser] = useState(null)

  useEffect(() => {
    getMe()
      .then(({ user }) => {
        if (user) {
          setUser(user)
          setStatus('authed')
        } else {
          setStatus('anon')
        }
      })
      .catch(() => setStatus('anon'))
  }, [])

  async function handleLogout() {
    try {
      await logout()
    } catch {
      /* ignore */
    }
    setUser(null)
    setStatus('anon')
  }

  if (status === 'loading') return <div className="auth-splash">Loading…</div>
  if (status === 'anon')
    return (
      <LoginPage
        onAuthed={(u) => {
          setUser(u)
          setStatus('authed')
        }}
      />
    )
  return <App user={user} onLogout={handleLogout} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Gate />
  </StrictMode>,
)

// Register the service worker so the app is installable + offline-capable.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* PWA install is a progressive enhancement — ignore registration errors */
    })
  })

  // A Background Sync fired while this window was open. The worker deliberately
  // does not replay the queue itself in that case — this context owns the
  // optimistic cache and the 401 handling — so it hands the work back here.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'FLUSH_QUEUE') syncNow()
  })
}
