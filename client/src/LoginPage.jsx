/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { useState } from 'react'
import { login, requestCredentials } from './api'
import { BRANCHES } from './options'
import { Credit } from './copyright'
import { LOGO_FULL, BRAND_NAME } from './brand'
import SearchSelect from './SearchSelect'

export default function LoginPage({ onAuthed }) {
  const [tab, setTab] = useState('login') // login | request
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [req, setReq] = useState({ name: '', branch: BRANCHES[0] ?? '', contact: '', note: '' })
  const [sent, setSent] = useState(false)

  async function doLogin(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { user } = await login(username.trim(), password)
      onAuthed(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function doRequest(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await requestCredentials(req)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const setR = (k) => (e) => setReq((r) => ({ ...r, [k]: e.target.value }))

  return (
    <div className="auth-wrap app">
      <div className="auth-card">
        <img className="auth-logo" src={LOGO_FULL} alt={BRAND_NAME} />
        <div className="auth-brand">TRC-MMS</div>
        <p className="auth-sub">Tetra Repair Center · Maintenance Management System</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={tab === 'login' ? 'active' : ''}
            onClick={() => {
              setTab('login')
              setError('')
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={tab === 'request' ? 'active' : ''}
            onClick={() => {
              setTab('request')
              setError('')
            }}
          >
            Request access
          </button>
        </div>

        {error && <p className="auth-error">{error}</p>}

        {tab === 'login' ? (
          <form onSubmit={doLogin} className="auth-form">
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" className="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : sent ? (
          <div className="auth-form">
            <p className="auth-ok">✅ Request sent. An admin will review it and give you a username &amp; password.</p>
            <button
              type="button"
              className="add-fault"
              onClick={() => {
                setSent(false)
                setTab('login')
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={doRequest} className="auth-form">
            <p className="auth-hint">No account? Send a request — only an admin can create your login.</p>
            <label>
              Your name
              <input value={req.name} onChange={setR('name')} required />
            </label>
            <label>
              Branch
              <SearchSelect value={req.branch} onChange={setR('branch')} options={BRANCHES} />
            </label>
            <label>
              Contact (phone / email)
              <input value={req.contact} onChange={setR('contact')} />
            </label>
            <label>
              Note
              <input value={req.note} onChange={setR('note')} placeholder="Anything the admin should know" />
            </label>
            <button type="submit" className="submit" disabled={busy || !req.name.trim()}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </form>
        )}
      </div>
      <footer className="app-footer">
        <Credit />
      </footer>
    </div>
  )
}
