/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Rendered for two different callers with different rights: a global admin
 * (sees/manages every account, can create directors and assign regions) and
 * a regional director (sees/manages only `user` accounts within their own
 * region, cannot touch role or region at all). The server is the actual
 * authority on what each caller may do — see server/src/routes/admin.js —
 * this component just narrows the UI to match so a director never sees a
 * control that would 403.
 */

import { useEffect, useMemo, useState } from 'react'
import SearchSelect from './SearchSelect'
import {
  getUsers, createUser, updateUser, deleteUser,
  getCredentialRequests, updateCredentialRequest, deleteCredentialRequest,
} from './api'
import { BRANCHES } from './options'

const BLANK = { username: '', password: '', role: 'user', branch: BRANCHES[0] ?? '', region: '' }
const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'director', label: 'Director' },
  { value: 'admin', label: 'Admin' },
]
const ACTIVE_OPTIONS = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Disabled' },
]

export default function AdminUsers({ currentUser, embedded = false, branches = BRANCHES, regions = {}, onAddBranch }) {
  const isDirectorCaller = currentUser?.role === 'director'
  const isAdminCaller = currentUser?.role === 'admin'
  // A director only ever picks among their own region's branches; an admin
  // picks from the full branch list (branches prop already carries either
  // shape depending on who's logged in, but deriving from `regions` here too
  // keeps this component correct regardless of what the caller passes).
  const branchOptions = isDirectorCaller ? regions?.[currentUser.region] ?? [] : branches
  const regionOptions = useMemo(() => Object.keys(regions ?? {}), [regions])

  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [form, setForm] = useState(() => ({ ...BLANK, branch: branchOptions[0] ?? '' }))
  const [newBranch, setNewBranch] = useState('')
  const [editId, setEditId] = useState(null) // user id being edited
  const [editForm, setEditForm] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Convenience default: pre-fill the first region as soon as Role switches
  // to Director, so there's already a sensible value if Create/Save is
  // pressed without touching the Region picker. (Originally a workaround for
  // a native <select> quirk where an out-of-range value still displayed the
  // first <option> — SearchSelect doesn't have that failure mode, since an
  // unmatched value just shows its placeholder, but the default is still
  // worth keeping.)
  useEffect(() => {
    if (form.role === 'director' && !form.region && regionOptions.length) {
      setForm((f) => ({ ...f, region: regionOptions[0] }))
    }
  }, [form.role, form.region, regionOptions])
  useEffect(() => {
    if (editId != null && editForm.role === 'director' && !editForm.region && regionOptions.length) {
      setEditForm((f) => ({ ...f, region: regionOptions[0] }))
    }
  }, [editId, editForm.role, editForm.region, regionOptions])

  async function refresh() {
    try {
      const [u, r] = await Promise.all([getUsers(), getCredentialRequests()])
      setUsers(u)
      setRequests(r)
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => {
    refresh()
  }, [])

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests])
  const flash = (m) => {
    setNotice(m)
    setTimeout(() => setNotice(''), 3000)
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Add a new branch to the managed list and select it for the new user.
  // Admin only — a director's workspace is exactly their region's existing
  // branches, so this control isn't offered to them at all.
  function addBranchInline() {
    const v = newBranch.trim()
    if (!v) return
    if (!branches.some((b) => String(b).toLowerCase() === v.toLowerCase())) onAddBranch?.(v)
    setForm((f) => ({ ...f, branch: v }))
    setNewBranch('')
    flash(`Branch "${v}" is now available.`)
  }

  async function addUser(e) {
    e.preventDefault()
    setError('')
    try {
      const payload = { username: form.username.trim(), password: form.password }
      if (isDirectorCaller) {
        payload.branch = form.branch
      } else {
        payload.role = form.role
        if (form.role === 'director') payload.region = form.region
        else payload.branch = form.branch
      }
      await createUser(payload)
      setForm({ ...BLANK, branch: branchOptions[0] ?? '' })
      flash('User created.')
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  function startEdit(u) {
    setEditId(u.id)
    setEditForm({ username: u.username, role: u.role, branch: u.branch, region: u.region || '', active: u.active, password: '' })
    setError('')
  }
  async function saveEdit(id) {
    try {
      const payload = { username: editForm.username.trim(), active: editForm.active }
      if (isAdminCaller) {
        payload.role = editForm.role
        payload.branch = editForm.branch
        payload.region = editForm.region
      } else {
        payload.branch = editForm.branch
      }
      if (editForm.password) payload.password = editForm.password
      await updateUser(id, payload)
      setEditId(null)
      flash('User updated.')
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }
  async function removeUser(u) {
    if (!window.confirm(`Delete user "${u.username}"?`)) return
    try {
      await deleteUser(u.id)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function setReqStatus(r, status) {
    try {
      await updateCredentialRequest(r.id, { status })
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }
  async function removeReq(r) {
    try {
      await deleteCredentialRequest(r.id)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }
  function makeAccountFrom(r) {
    setForm({ username: r.name.replace(/\s+/g, '').toLowerCase(), password: '', role: 'user', branch: r.branch || branchOptions[0] || '', region: '' })
    setError('')
    document.getElementById('admin-new-user')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const eset = (k) => (e) => setEditForm((f) => ({ ...f, [k]: k === 'active' ? e.target.value === 'true' : e.target.value }))

  return (
    <section className="admin">
      {embedded && <h2 className="page-title">🔐 Users &amp; access {pendingCount > 0 && <span className="hint">· {pendingCount} pending request{pendingCount === 1 ? '' : 's'}</span>}</h2>}
      {error && <p className="manage-notice">{error}</p>}
      {notice && <p className="saved-hint">✅ {notice}</p>}

      {/* Credential requests */}
      <div className="admin-block">
        <h3 className="sp-brand-h">Access requests</h3>
        {requests.length === 0 ? (
          <p className="empty">No requests.</p>
        ) : (
          <div className="inv-scroll">
            <table className="inv-table sp-table">
              <thead>
                <tr>
                  <th>Name</th><th>Branch</th><th>Contact</th><th>Note</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{r.name}</td>
                    <td>{r.branch}</td>
                    <td className="nowrap">{r.contact}</td>
                    <td>{r.note}</td>
                    <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                    <td className="admin-actions">
                      <button type="button" onClick={() => makeAccountFrom(r)}>Make account</button>
                      {r.status !== 'approved' && <button type="button" onClick={() => setReqStatus(r, 'approved')}>Approve</button>}
                      {r.status !== 'rejected' && <button type="button" className="ghost" onClick={() => setReqStatus(r, 'rejected')}>Reject</button>}
                      <button type="button" className="danger" onClick={() => removeReq(r)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create user */}
      <div className="admin-block" id="admin-new-user">
        <h3 className="sp-brand-h">Create login</h3>
        <form className="admin-form" onSubmit={addUser}>
          <label>Username<input value={form.username} onChange={set('username')} required /></label>
          <label>Password<input value={form.password} onChange={set('password')} required /></label>
          {isAdminCaller && (
            <label>Role
              <SearchSelect value={form.role} onChange={set('role')} options={ROLE_OPTIONS} />
            </label>
          )}
          {isAdminCaller && form.role === 'director' ? (
            <label>Region
              <SearchSelect value={form.region} onChange={set('region')} options={regionOptions} />
            </label>
          ) : (
            <label>Branch
              <SearchSelect
                value={form.branch}
                onChange={set('branch')}
                options={branchOptions}
                disabled={isAdminCaller && form.role === 'admin'}
              />
            </label>
          )}
          {isAdminCaller && (
            <label>New branch
              <div className="add-row">
                <input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBranchInline())}
                  placeholder="Add a future branch"
                  disabled={form.role !== 'user'}
                />
                <button type="button" onClick={addBranchInline} disabled={form.role !== 'user' || !newBranch.trim()}>
                  Add
                </button>
              </div>
            </label>
          )}
          <button type="submit" className="submit">Create</button>
        </form>
        <p className="saved-hint">
          {isAdminCaller
            ? 'Admins see all branches. Directors run one region. Users are limited to their branch. New branches are also editable under ⚙️ Manage inputs → Branches.'
            : `You can create logins for branches in your region (${currentUser?.region || ''}).`}
        </p>
      </div>

      {/* Users */}
      <div className="admin-block">
        <h3 className="sp-brand-h">Accounts ({users.length})</h3>
        <div className="inv-scroll">
          <table className="inv-table sp-table">
            <thead>
              <tr><th>Username</th><th>Role</th><th>Branch</th><th>Active</th><th /></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                editId === u.id ? (
                  <tr key={u.id}>
                    <td><input value={editForm.username} onChange={eset('username')} /></td>
                    <td>
                      {isAdminCaller ? (
                        <SearchSelect value={editForm.role} onChange={eset('role')} options={ROLE_OPTIONS} />
                      ) : (
                        'user'
                      )}
                    </td>
                    <td>
                      {isAdminCaller && editForm.role === 'director' ? (
                        <SearchSelect value={editForm.region} onChange={eset('region')} options={regionOptions} />
                      ) : (
                        <SearchSelect
                          value={editForm.branch}
                          onChange={eset('branch')}
                          options={isAdminCaller ? branches : branchOptions}
                          disabled={isAdminCaller && editForm.role === 'admin'}
                        />
                      )}
                    </td>
                    <td>
                      <SearchSelect value={String(editForm.active)} onChange={eset('active')} options={ACTIVE_OPTIONS} />
                    </td>
                    <td className="admin-actions">
                      <input placeholder="New password (optional)" value={editForm.password} onChange={eset('password')} />
                      <button type="button" onClick={() => saveEdit(u.id)}>Save</button>
                      <button type="button" className="ghost" onClick={() => setEditId(null)}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id}>
                    <td className="nowrap">{u.username}{u.id === currentUser?.id && <span className="hint"> · you</span>}</td>
                    <td>{u.role}</td>
                    <td>{u.branch || (u.role === 'admin' ? 'all' : u.role === 'director' ? u.region : '—')}</td>
                    <td>{u.active ? 'Yes' : 'No'}</td>
                    <td className="admin-actions">
                      <button type="button" onClick={() => startEdit(u)}>Edit</button>
                      {u.id !== currentUser?.id && <button type="button" className="danger" onClick={() => removeUser(u)}>Delete</button>}
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
