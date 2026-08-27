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

/*
 * ── Two-way entry sync ───────────────────────────────────────────
 *
 * The one part of the database where both directions are meaningful. An entry
 * carries no number anybody minted and no running total, so two machines can
 * each hold some without either being wrong — unlike a saved report (seq is
 * unique, both would mint REP-0043) or stock (begin/out are counters, and two
 * machines each consuming is a lost update). Those still travel one way,
 * through the whole-database copy above.
 *
 * The exchange, in the order it has to happen:
 *
 *   1. read what changed HERE since our last push — before anything lands, or
 *      the rows that just arrived get pushed straight back
 *   2. ask live what changed THERE
 *   3. apply live's changes here, higher revision wins per entry
 *   4. push ours
 *   5. keep BOTH marks, each in the counter of the database it belongs to
 *
 * TWO MARKS, NOT ONE, and this is the part that changed when the ordering
 * became a counter. There is no longer a shared clock both machines can page
 * by. Each database numbers its OWN writes, so "everything since 41" means
 * something different on each side and the two numbers cannot be swapped or
 * merged. We therefore remember how far we have read of theirs and how far we
 * have pushed of ours, separately.
 *
 * A SMALL, BOUNDED ECHO is accepted on purpose. Both marks are taken BEFORE
 * anything is applied, so the rows that arrive during this sync fall above our
 * local mark and get offered back once, on the next sync — where the far side
 * sees an identical revision and keeps its own. It costs one comparison per row
 * for one round and then stops. Taking the marks afterwards would close it, and
 * would also silently swallow anything typed on this machine while the sync was
 * in flight. Re-sending a row is cheap; losing somebody's entry is not.
 */

async function liveJson(origin, path, cookie, init = {}) {
  const res = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    signal: AbortSignal.timeout(120_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `${path} failed (${res.status}).`)
  return body
}

/** Sign in and hand back the cookie the rest of the exchange rides on. */
export async function liveSession({ url, username, password }) {
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
  return { origin, cookie: (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ') }
}

/**
 * Exchange working entries with the live server, both directions.
 *
 * @param creds  url + username + password
 * @param deps   { prisma, applyChanges, pullChanges } — the LOCAL database and
 *               the same two functions the server route uses, so both ends
 *               resolve a conflict by one rule rather than two that agree today
 * @param marks  { localSeq, serverSeq } from the last successful sync, or nulls
 *               for everything. They are counters in two different databases
 *               and are never interchangeable — see the note above.
 */
export async function syncEntries(
  creds,
  { prisma, applyChanges, pullChanges },
  { localSeq = null, serverSeq = null } = {},
) {
  const { origin, cookie } = await liveSession(creds)

  // 1. Ours first — read before anything from live lands here.
  const ours = await pullChanges(prisma, { since: localSeq })

  // 2 + 3. Theirs, applied here.
  const qs = serverSeq === null ? '' : `?since=${encodeURIComponent(serverSeq)}`
  const theirs = await liveJson(origin, `/api/sync/entries${qs}`, cookie)
  const down = await applyChanges(prisma, { entries: theirs.entries, tombstones: theirs.tombstones })

  // 4. Ours, pushed.
  const up = await liveJson(origin, '/api/sync/entries', cookie, {
    method: 'POST',
    body: JSON.stringify({ entries: ours.entries, tombstones: ours.tombstones }),
  })

  return {
    origin,
    // Each mark in its own database's counter, both as they stood before this
    // exchange wrote anything.
    localSeq: ours.seq,
    serverSeq: theirs.seq,
    down: { applied: down.applied.length, removed: down.removed.length, kept: down.kept.length },
    up: { applied: up.applied.length, removed: up.removed.length, kept: up.kept.length, refused: up.refused.length },
  }
}

/** The two-way result, in a sentence somebody can check rather than "synced". */
export const describeExchange = (r) =>
  [
    `From live:  ${r.down.applied} entr${r.down.applied === 1 ? 'y' : 'ies'} updated here` +
      (r.down.removed ? `, ${r.down.removed} deleted here` : '') +
      (r.down.kept ? `, ${r.down.kept} already newer here` : ''),
    `To live:    ${r.up.applied} entr${r.up.applied === 1 ? 'y' : 'ies'} updated there` +
      (r.up.removed ? `, ${r.up.removed} deleted there` : '') +
      (r.up.kept ? `, ${r.up.kept} already newer there` : '') +
      (r.up.refused ? `, ${r.up.refused} refused` : ''),
  ].join('\n')
