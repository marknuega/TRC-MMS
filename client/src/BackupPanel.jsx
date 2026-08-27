/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Take a copy of the whole database, or put one back.
 *
 * Admin-only, and shown beside Users & Access because that is the screen for
 * things that are done TO the installation rather than in it.
 *
 * Restoring is the most destructive action in the app — more so than deleting a
 * report, which takes one thing away from a database that is otherwise intact.
 * So it is deliberately not a button you can be halfway through pressing: the
 * file has to be chosen, what is in it is read back and counted against what is
 * here now, and the word REPLACE has to be typed. Nothing is sent until then.
 *
 * The counts are the part that actually protects anybody. "Restore?" invites a
 * yes; "1,240 entries here, 3 in the file" is a person noticing they picked the
 * wrong file.
 */

import { useEffect, useState } from 'react'
import { formatDateTime } from './dates'
import { downloadBackup, getBackupCounts, restoreBackup } from './api'

// Order and wording as a person thinks of them, not as the tables are named.
const ROWS = [
  ['reportEntries', 'Entries'],
  ['faults', 'Faults'],
  ['savedReports', 'Saved reports'],
  ['inventoryItems', 'Inventory items'],
  ['inventoryTxns', 'Ledger lines'],
  ['monthlySheets', 'Monthly sheets'],
  ['users', 'Accounts'],
]

const n = (v) => (typeof v === 'number' ? v.toLocaleString('en-GB') : '—')

export default function BackupPanel({ edition = 'server' }) {
  const [counts, setCounts] = useState(null)
  const [file, setFile] = useState(null)
  const [doc, setDoc] = useState(null)
  const [confirm, setConfirm] = useState('')
  const [keepAccounts, setKeepAccounts] = useState(true)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null)

  useEffect(() => {
    getBackupCounts()
      .then((r) => setCounts(r.counts))
      .catch(() => setCounts(null))
  }, [])

  const say = (kind, text) => setNote({ kind, text })

  async function onExport() {
    setBusy('export')
    try {
      say('ok', `Saved ${await downloadBackup()}`)
    } catch (err) {
      say('bad', err.message)
    } finally {
      setBusy('')
    }
  }

  // Read and validate here rather than on submit, so choosing the wrong file is
  // found out while it is still only a file — not after REPLACE is typed.
  async function onPick(e) {
    const picked = e.target.files?.[0] ?? null
    setFile(picked)
    setDoc(null)
    setConfirm('')
    setNote(null)
    if (!picked) return
    try {
      const parsed = JSON.parse(await picked.text())
      if (parsed?.format !== 'trc-mms-export') throw new Error('That file is not a TRC-MMS backup.')
      setDoc(parsed)
    } catch (err) {
      say('bad', err.message.startsWith('That file') ? err.message : 'That file could not be read as a backup.')
    }
  }

  async function onRestore() {
    if (!doc || confirm.trim().toUpperCase() !== 'REPLACE') return
    setBusy('restore')
    try {
      const skip = keepAccounts ? ['users'] : []
      const result = await restoreBackup(doc, skip)
      const total = Object.values(result.imported ?? {}).reduce((a, b) => a + b, 0)
      say(
        'ok',
        `Restored ${n(total)} rows.${result.signedOut ? ' Accounts were replaced — sign in with a username from the backup.' : ''}`,
      )
      setFile(null)
      setDoc(null)
      setConfirm('')
      setCounts((await getBackupCounts()).counts)
    } catch (err) {
      say('bad', err.message)
    } finally {
      setBusy('')
    }
  }

  const ready = doc && confirm.trim().toUpperCase() === 'REPLACE'

  return (
    <section className="backup-panel">
      <h3 className="manage-charts-h">Backup &amp; restore</h3>
      <p className="manage-hint">
        A backup is the whole database in one file — every report, the saved report history with its REP numbers, the
        inventory and its ledger, the option lists, the code map and the accounts. It is how this installation is copied
        onto another machine, and the only thing that gets any of it back.
        {edition === 'desktop' && (
          <>
            {' '}
            On this desktop copy there is also <strong>File → Sync from the live server</strong>, which fetches the live
            data directly instead of going through a file.
          </>
        )}
      </p>

      {counts && (
        <table className="backup-counts">
          <tbody>
            {ROWS.map(([key, label]) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td>{n(counts[key])}</td>
                {doc && <td className="backup-incoming">{n(doc.counts?.[key] ?? doc.data?.[key]?.length)}</td>}
              </tr>
            ))}
          </tbody>
          {doc && (
            <thead>
              <tr>
                <th />
                <th scope="col">Here now</th>
                <th scope="col">In the file</th>
              </tr>
            </thead>
          )}
        </table>
      )}

      <div className="backup-actions">
        <button type="button" onClick={onExport} disabled={busy === 'export'}>
          {busy === 'export' ? 'Preparing…' : 'Download a backup'}
        </button>
      </div>

      <div className="backup-restore">
        <label className="backup-file">
          <span>Restore from a backup file</span>
          <input type="file" accept="application/json,.json" onChange={onPick} />
        </label>

        {doc && (
          <>
            <p className="backup-warn">
              This replaces everything listed above with what is in <strong>{file?.name}</strong>, taken{' '}
              {doc.exportedAt ? formatDateTime(doc.exportedAt) : 'at an unknown time'}. There is no undo, and no merge —
              whatever is here now is gone.
            </p>
            <label className="backup-keep">
              <input type="checkbox" checked={keepAccounts} onChange={(e) => setKeepAccounts(e.target.checked)} />
              {/* Nothing references a user by foreign key — a report carries a
                  technician's NAME — so the data lands whole either way, and
                  keeping the accounts means a restore cannot lock you out of
                  the machine you are standing in front of. */}
              Keep the accounts already on this installation (otherwise you will be signed out and must use a login from
              the backup)
            </label>
            <label className="backup-confirm">
              <span>
                Type <strong>REPLACE</strong> to confirm
              </span>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="REPLACE"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button type="button" className="danger" onClick={onRestore} disabled={!ready || busy === 'restore'}>
              {busy === 'restore' ? 'Restoring…' : 'Replace this database'}
            </button>
          </>
        )}
      </div>

      {note && <p className={note.kind === 'ok' ? 'backup-ok' : 'backup-bad'}>{note.text}</p>}
    </section>
  )
}
