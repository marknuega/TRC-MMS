/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Pulling the live server's database down onto this machine.
 *
 * ONE DIRECTION, AND ON PURPOSE. The live server is the authority and this
 * machine is a copy of it. Nothing here ever pushes, because the two databases
 * cannot be merged: Report.reportDate is unique and both machines would create
 * a row for today; SavedReport.seq is unique and both would mint REP-0043;
 * every id is an autoincrement, so entry 5 here and entry 5 there are different
 * entries. A "sync each other" button over that does not merge — it picks a
 * winner silently, and the day it costs somebody a shift of reports nothing
 * would show which shift it was. So the copy goes one way and says so.
 *
 * WHAT THAT MEANS FOR THE PERSON USING IT: anything typed on this machine is
 * replaced by the next pull. This build is for reading the live data offline —
 * looking up a code, checking stock, printing yesterday — not for filing into.
 * Every entry point here says that before it does anything.
 *
 * The pull runs in the Electron main process rather than the page, for two
 * reasons that both matter: the live server is a different origin, so a fetch
 * from the renderer would be blocked and would not carry a session anyway; and
 * the import writes through the same backup.js the server uses, which is
 * reachable from here as a module and would otherwise need an HTTP round trip
 * and a locally minted token to get at.
 *
 * ACCOUNTS ARE NOT COPIED by default. Nothing in the schema references a user
 * by foreign key — a report carries a technician's NAME — so the data lands
 * whole either way, and keeping this machine's own login means a pull can never
 * lock somebody out of the app they are standing in front of.
 */

import electron from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'

const { safeStorage } = electron

// Users, the WhatsApp de-duplication log and the credential queue. See
// SKIPPABLE in server/src/backup.js for why each is safe to leave behind — and
// why `users` is the one that matters here.
export const DESKTOP_SKIP = ['users', 'processedMessages', 'credentialRequests']

/**
 * Credentials are encrypted at rest with the OS keystore (DPAPI on Windows),
 * so config.json cannot be read off a copied profile. Where the platform
 * offers no keystore we do NOT quietly fall back to plaintext: auto-sync is
 * simply unavailable and the password is asked for each time instead. An admin
 * password on disk in the clear is not a trade to make on the user's behalf
 * without telling them, and this way there is nothing to tell.
 */
export const canStoreSecret = () => {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

const seal = (text) => safeStorage.encryptString(String(text)).toString('base64')
const unseal = (b64) => safeStorage.decryptString(Buffer.from(String(b64), 'base64'))

/** The sync settings as stored, with the password left sealed. */
export function readSync(configPath) {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')).sync ?? {}
  } catch {
    return {}
  }
}

export function writeSync(configPath, patch) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  config.sync = { ...(config.sync ?? {}), ...patch }
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  return config.sync
}

/** Store a password only if the OS will encrypt it; otherwise store nothing. */
export function rememberPassword(configPath, password) {
  if (!canStoreSecret()) return false
  writeSync(configPath, { password: seal(password) })
  return true
}

export function recallPassword(configPath) {
  const { password } = readSync(configPath)
  if (!password || !canStoreSecret()) return ''
  try {
    return unseal(password)
  } catch {
    // Sealed by a different OS user or machine — unreadable, and not an error
    // worth stopping for: it just means asking for it again.
    return ''
  }
}

/** Trim a pasted URL down to an origin, so "…/api/backup" or a trailing slash both work. */
export function normalizeUrl(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try {
    return new URL(withScheme).origin
  } catch {
    return ''
  }
}

/** Is the live server reachable right now? Used to decide whether to auto-pull. */
export async function reachable(url, timeoutMs = 8000) {
  const origin = normalizeUrl(url)
  if (!origin) return false
  try {
    const res = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Log in to the live server and read its whole database out.
 *
 * Kept separate from the import so a failure has an unambiguous side: either
 * nothing was fetched, or a complete document was, and only then is anything
 * on this machine touched.
 */
export async function fetchLiveExport({ url, username, password }, { timeoutMs = 180_000 } = {}) {
  const origin = normalizeUrl(url)
  if (!origin) throw new Error('That is not a valid address for the live server.')

  const login = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!login.ok) {
    const body = await login.json().catch(() => ({}))
    throw new Error(
      login.status === 401
        ? 'The live server rejected that username or password.'
        : (body.error ?? `Sign-in failed (${login.status}).`),
    )
  }
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')

  const res = await fetch(`${origin}/api/backup/export`, {
    headers: cookie ? { cookie } : {},
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      res.status === 403
        ? 'That account is not an admin on the live server, so it cannot export the database.'
        : (body.error ?? `The live server refused the export (${res.status}).`),
    )
  }
  return res.json()
}

/**
 * Replace this machine's database with a live export.
 *
 * `deps` are passed in rather than imported so this module stays loadable
 * without DATABASE_URL set — the server's db.js throws on import until Electron
 * has pointed it at the SQLite file, which happens after this file is read.
 */
export async function applyExport(
  doc,
  { prisma, importAll, validateExport, resyncSequences },
  { skip = DESKTOP_SKIP } = {},
) {
  const problem = validateExport(doc)
  if (problem) throw new Error(problem)
  const result = await prisma.$transaction((tx) => importAll(tx, doc, { skip }), {
    timeout: 120_000,
    maxWait: 15_000,
  })
  // A no-op on SQLite, which is all this build ever runs on — called anyway so
  // the desktop path and the server route cannot drift into doing different
  // things with the same document.
  result.resequenced = await resyncSequences(prisma, { skip })
  return result
}

/** One line per table, for the "here is what landed" dialog. */
export const describeResult = (result) =>
  Object.entries(result?.imported ?? {})
    .filter(([, n]) => n > 0)
    .map(([table, n]) => `${LABELS[table] ?? table}: ${n}`)
    .join('\n') || 'Nothing — the live server is empty.'

const LABELS = {
  appOptions: 'Option lists',
  codeMap: 'Code map',
  monthlySheets: 'Monthly sheets',
  savedReports: 'Saved reports',
  reports: 'Report numbers',
  reportEntries: 'Entries',
  faults: 'Faults',
  inventoryItems: 'Inventory items',
  inventoryTxns: 'Ledger lines',
}
