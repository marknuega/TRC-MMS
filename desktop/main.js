/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Electron shell for the offline desktop build.
 *
 * There is no desktop rewrite of the app: this starts the SAME Express server
 * that runs on Railway, bound to 127.0.0.1 on a port that stays put across
 * launches, and points a BrowserWindow at it. The React client is byte-identical
 * too — it calls a relative /api, so it neither knows nor cares that the origin
 * is now local.
 *
 * What this file owns is everything Railway used to provide:
 *   - the database         -> a SQLite file in the user's profile
 *   - JWT_SECRET           -> generated once per install, kept beside it
 *   - the starting admin   -> seeded on first run, shown once in a dialog
 *
 * Nothing here reaches the network. The window has no internet dependency at
 * all: no CDN, no remote font, no telemetry.
 */

// `electron` is a CommonJS module with no ESM named exports, so it has to be
// imported whole and destructured — `import { app } from 'electron'` throws
// "does not provide an export named 'app'" before any of this file runs.
import electron from 'electron'
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = electron
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  DESKTOP_SKIP,
  applyExport,
  canStoreSecret,
  describeExchange,
  describeResult,
  fetchLiveExport,
  normalizeUrl,
  reachable,
  readSync,
  recallPassword,
  rememberPassword,
  syncEntries,
  writeSync,
} from './sync.js'
import { upgradeSchema } from './schemaUpgrade.js'

const here = dirname(fileURLToPath(import.meta.url))

// The window, the shortcut and the installer all say "TRC-MMS (Desktop)". The
// deployed site can be installed as a PWA under the name "TRC-MMS", and the two
// windows are otherwise near identical — one talks to Railway, the other to a
// database on this machine. Typing a day of reports into the wrong one is the
// mistake this name exists to prevent.
const APP_TITLE = 'TRC-MMS (Desktop)'

/**
 * What the TITLE BAR says: the name, then the version.
 *
 * Separate from APP_TITLE, and it must stay separate. APP_TITLE is passed to
 * app.setName() below, which is what names the data folder — putting a version
 * in it would move %APPDATA%\TRC-MMS (Desktop)\ to a new path on every release,
 * and an upgraded install would open on an empty database. That looks exactly
 * like losing every report ever typed, and the reports would still be sitting
 * in the old folder with nothing pointing at them.
 *
 * So the version goes only where it is read, never where it is resolved.
 *
 * Lazy, because app.getVersion() is called for each window rather than once at
 * import: createWindow runs after the app is ready, which is the state this is
 * documented to be safe in.
 */
const windowTitle = () => `${APP_TITLE} ${app.getVersion()}`

// Pin the data folder name before anything reads it. Left alone, Electron names
// it from package.json's `name` ("trc-mms-desktop"), which is a build-time
// detail nobody should have to recognise when they go looking for the database
// to back up. Must run before the first getPath('userData').
app.setName(APP_TITLE)

const userData = app.getPath('userData')
const DB_PATH = join(userData, 'trc-mms.db')
const CONFIG_PATH = join(userData, 'config.json')

// Builds before the rename kept their data in a folder named "TRC-MMS". Renaming
// the app moved where it looks, so carry the old folder across rather than
// silently starting empty and looking, to whoever typed into it, like data loss.
// One-time and conservative: it only ever runs when the new folder does not yet
// exist, so it can never overwrite newer data.
function migrateLegacyDataFolder() {
  const legacy = join(dirname(userData), 'TRC-MMS')
  if (legacy === userData || existsSync(userData) || !existsSync(join(legacy, 'trc-mms.db'))) return
  try {
    renameSync(legacy, userData)
    console.log(`migrated data folder ${legacy} -> ${userData}`)
  } catch (err) {
    console.error('could not migrate the old data folder:', err.message)
  }
}

// A packaged build reads the seed database from resources/; an unpackaged `npm
// start` reads it straight out of app/.
const TEMPLATE_DB = app.isPackaged ? join(process.resourcesPath, 'template.db') : join(here, 'app/template.db')

let serverUrl = null
let firstRunAdmin = null // { username, password } to show once, after the window opens

// ── Per-install configuration ────────────────────────────────────
// JWT_SECRET must be stable across restarts or every session cookie is
// invalidated on launch. It is generated per install rather than baked into the
// installer, so one machine's secret cannot forge another's sessions.
function loadConfig() {
  migrateLegacyDataFolder()
  mkdirSync(userData, { recursive: true })
  if (existsSync(CONFIG_PATH)) {
    try {
      return withInstallId(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
    } catch {
      // Corrupt config: fall through and rebuild it. Losing the secret only
      // signs everyone out, which is recoverable; refusing to start is not.
    }
  }
  const config = {
    jwtSecret: randomBytes(32).toString('base64url'),
    // Each standalone install mints its own REP-#### numbers, so two machines
    // will reach the same number independently. This tag is what tells their
    // documents apart after the fact.
    deviceTag: randomBytes(2).toString('hex').toUpperCase(),
    installId: newInstallId(),
    createdAt: new Date().toISOString(),
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
  return config
}

/*
 * Who this installation is, for the purpose of breaking a sync tie.
 *
 * Distinct from deviceTag, which is four hex characters and exists to tell two
 * machines' REP numbers apart on paper. Four characters collide about once in
 * 65,536, and a collision here is not cosmetic: two installs sharing an origin
 * cannot break a tie at all, so each would keep its own version of a tied entry
 * and the pair would stay quietly split while syncing cleanly every time. 128
 * bits removes that as something to think about.
 *
 * Lower-case hex on purpose. The comparison is textual and the live server
 * answers to 'live', which sorts above every hex digit — so a genuine tie goes
 * to the server, which is the copy more people can see. See compareRev in
 * server/src/syncClock.js.
 */
const newInstallId = () => randomBytes(16).toString('hex')

/** Backfill an install id into a config written before entries synced by counter. */
function withInstallId(config) {
  if (config.installId) return config
  const filled = { ...config, installId: newInstallId() }
  writeFileSync(CONFIG_PATH, JSON.stringify(filled, null, 2), 'utf8')
  return filled
}

// ── The database ─────────────────────────────────────────────────
// Lives in the user's profile, NOT next to the .exe: an install under Program
// Files is not writable by a standard user, and an upgrade replaces that folder
// wholesale. Keeping it here means reinstalling never destroys the reports.
function ensureDatabase() {
  if (existsSync(DB_PATH)) return false
  if (!existsSync(TEMPLATE_DB)) {
    throw new Error(`The bundled starter database is missing (looked in ${TEMPLATE_DB}).`)
  }
  copyFileSync(TEMPLATE_DB, DB_PATH)
  return true // brand new install
}

// ── Boot the Express app on a free local port ────────────────────
async function startServer(config) {
  process.env.NODE_ENV = 'production' // makes app.js serve client/dist
  process.env.DATABASE_URL = `file:${DB_PATH}`
  process.env.JWT_SECRET = config.jwtSecret
  // Nothing sits in front of this server, so the rate limiter must read the
  // real socket address rather than a forwarded-for header no one set.
  process.env.TRUST_PROXY = '0'

  // Tells the client (via /api/auth/me) that it is the standalone edition, so
  // it hides the sync UI and stops trusting navigator.onLine — which is false
  // on a PC with no network even though this server is a millimetre away.
  process.env.APP_EDITION = 'desktop'

  // Which installation the shared sync code should sign its edits with. Passed
  // in through the environment exactly as DATABASE_URL is, so server/src runs
  // here byte for byte as it runs on Railway — where nothing sets it and the
  // default, 'live', is correct. See server/src/syncClock.js.
  process.env.SYNC_ORIGIN = config.installId

  // This build generates its own SQLite Prisma client into app/generated/prisma
  // (see make-sqlite-schema.mjs for why it is not in the default location).
  // db.js loads whatever this points at.
  const generated = join(here, 'app/generated/prisma')
  process.env.PRISMA_CLIENT_URL = pathToFileURL(join(generated, 'index.js')).href

  // The query engine is a native .node binary, and Windows cannot load one from
  // inside an asar archive. It ships unpacked beside the archive instead (see
  // asarUnpack), but Prisma looks for it relative to the generated client —
  // which still reports a path *inside* app.asar — so it has to be told.
  if (app.isPackaged) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = join(
      process.resourcesPath,
      'app.asar.unpacked/app/generated/prisma/query_engine-windows.dll.node',
    )
  }

  const fresh = ensureDatabase()

  if (fresh) {
    // Seed a known admin rather than letting auth.js generate one and print it
    // to a console nobody can see in a packaged app.
    firstRunAdmin = { username: 'admin', password: randomBytes(9).toString('base64url') }
    process.env.SEED_ADMIN_USERNAME = firstRunAdmin.username
    process.env.SEED_ADMIN_PASSWORD = firstRunAdmin.password
  }

  // Imported dynamically because db.js throws unless DATABASE_URL is already
  // set, and a static import would be hoisted above the assignments above.
  const serverSrc = join(here, 'app/server/src')

  // BEFORE the Express app, which starts querying the moment it is reached: an
  // install carried forward from an older version has a database this build's
  // schema does not match, and the first query against a missing column is a
  // crash on a machine whose reports are in that file. A fresh database copied
  // from template.db already matches and this changes nothing.
  const { prisma } = await import(pathToFileURL(join(serverSrc, 'db.js')).href)
  const upgraded = await upgradeSchema(prisma)
  if (upgraded.length) console.log(`schema upgraded: ${upgraded.join(', ')}`)

  const { app: expressApp } = await import(pathToFileURL(join(serverSrc, 'app.js')).href)
  const { seedAdmin } = await import(pathToFileURL(join(serverSrc, 'auth.js')).href)

  await seedAdmin().catch((err) => {
    // Non-fatal: an existing database already has its admin, and a failure here
    // must not stop an otherwise working app from opening.
    console.error('seedAdmin failed:', err.message)
  })

  // The port has to stay the same across launches, which is why it is stored
  // rather than picked fresh each time. localStorage, IndexedDB and the service
  // worker are all scoped to scheme://host:PORT, so a new port every launch
  // would be a brand new origin: the theme, the remembered branch, the sidebar
  // state and the last-used values would all reset, and any write still sitting
  // in the offline queue would be stranded in the previous origin's database.
  // (Cookies are host-scoped and ignore the port, so the session itself would
  // have survived — it is everything else that would not.)
  //
  // Bound to 127.0.0.1 explicitly, never 0.0.0.0: this is a single-user offline
  // app and the API has no business being reachable from the LAN.
  return listenOn(expressApp, config)
}

function listen(expressApp, port) {
  return new Promise((resolve, reject) => {
    const server = createServer(expressApp)
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server.address().port))
  })
}

async function listenOn(expressApp, config) {
  if (config.port) {
    try {
      return `http://127.0.0.1:${await listen(expressApp, config.port)}`
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err
      // Something else on this machine took the port since last launch. Moving
      // is better than refusing to start; the cost is one reset of the
      // browser-side settings, and the new port is remembered from here on.
      console.warn(`port ${config.port} is in use — choosing another`)
    }
  }

  const port = await listen(expressApp, 0) // 0 = let the OS pick a free one
  writeFileSync(CONFIG_PATH, JSON.stringify({ ...config, port }, null, 2), 'utf8')
  return `http://127.0.0.1:${port}`
}

// Which client bundle this install actually contains. The calculation rules ship
// inside that bundle, so when a total is disputed this is the first fact worth
// having — it says whether the machine is running the code you think it is.
function clientBuildId() {
  try {
    return JSON.parse(readFileSync(join(here, 'app/client/dist/build.json'), 'utf8')).buildId || 'unknown'
  } catch {
    return 'unknown'
  }
}

// ── Printing ─────────────────────────────────────────────────────
// Electron has no print preview. window.print() opens the Windows printer
// dialog — no PDF view, no "Save as PDF" — which is not what the web app does
// and not what anyone wants from an export button. So the renderer hands the
// document here instead (see preload.cjs), and this renders a real PDF and
// shows it in a viewer window the user can save or print from.

const scratch = [] // temp files to remove on quit

function tempFile(ext) {
  const file = join(tmpdir(), `trc-mms-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`)
  scratch.push(file)
  return file
}

// One hidden renderer, reused for every export, created on first use and kept
// for the life of the app.
//
// Not one window per export: destroying a BrowserWindow and creating another
// leaves the new one failing every file:// load with ERR_FAILED, so the first
// export would work and every one after it would silently produce nothing.
// Reusing a single window sidesteps that entirely and is faster besides.
let pdfWorker = null

function worker() {
  if (pdfWorker && !pdfWorker.isDestroyed()) return pdfWorker
  pdfWorker = new BrowserWindow({
    show: false,
    // These documents are static markup built by the app itself; they never need
    // scripting, and turning it off means a report can never execute anything.
    webPreferences: { javascript: false, contextIsolation: true, nodeIntegration: false },
  })
  return pdfWorker
}

// Render a standalone HTML document. It is loaded from a file rather than a
// data: URL — Electron refuses data: URLs in a window, and a full report would
// exceed what one can carry anyway.
async function htmlToPdf(html) {
  const source = tempFile('html')
  writeFileSync(source, html, 'utf8')

  const w = worker()
  await w.loadFile(source)
  return w.webContents.printToPDF({
    printBackground: true,
    // The exports carry their own @page rules; honouring them keeps the desktop
    // output identical to what the browser produces.
    preferCSSPageSize: true,
    pageSize: 'A4',
  })
}

function showPdf(data, title) {
  const file = tempFile('pdf')
  writeFileSync(file, data)

  const viewer = new BrowserWindow({
    width: 900,
    height: 1000,
    title: title || 'TRC-MMS — print preview',
    autoHideMenuBar: true,
    // Chromium's own PDF viewer, which brings the save and print controls with
    // it. Without plugins the window would offer to download the file instead.
    webPreferences: { plugins: true, contextIsolation: true, nodeIntegration: false },
  })
  viewer.setMenuBarVisibility(false)
  // Chromium's PDF viewer renames the window after the temp file it is showing,
  // which is a scratch path no one should be reading. Keep the given title.
  viewer.on('page-title-updated', (e) => e.preventDefault())
  viewer.loadURL(pathToFileURL(file).href)
  return file
}

ipcMain.handle('trc:print-html', async (_event, { html, title }) => {
  showPdf(await htmlToPdf(html), title)
})

ipcMain.handle('trc:print-page', async (event, { title }) => {
  // The live page, through its own print stylesheet — the same thing the
  // browser would put on paper.
  const data = await event.sender.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4' })
  showPdf(data, title)
})

// ── Window ───────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: windowTitle(),
    backgroundColor: '#ffffff',
    icon: app.isPackaged ? undefined : join(here, 'build/icon.png'),
    webPreferences: {
      // The page is our own app served from localhost, but it has no need to
      // reach Node, so it does not get to. The preload is the single, narrow
      // exception: two functions for rendering a document to PDF, and nothing
      // else crosses.
      preload: join(here, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  // The page sets its own <title>, which Electron would adopt — and that title
  // is the same string the PWA window shows. Keeping ours means the title bar
  // stays the one place the two builds are always distinguishable.
  win.on('page-title-updated', (e) => e.preventDefault())

  // The hidden PDF worker is still a window as far as Electron is concerned, so
  // leaving it alive would stop 'window-all-closed' ever firing — after the
  // first export, closing the app would leave it running invisibly. Drop it with
  // the main window, and let any open PDF viewer keep the app alive on its own.
  win.on('closed', () => {
    if (pdfWorker && !pdfWorker.isDestroyed()) pdfWorker.destroy()
    pdfWorker = null
  })

  win.once('ready-to-show', () => {
    win.show()
    if (firstRunAdmin) showFirstRunAdmin(win)
  })

  // Nothing in this app should open an external browser, but a stray target=_blank
  // must not spawn a chrome-less Electron window either.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:')) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadURL(serverUrl)
  return win
}

// The generated password is shown exactly once and never written to disk in
// plaintext. "Reset admin password" in the Help menu is the way back if it is
// lost, so a missed dialog is not a locked-out machine.
function showFirstRunAdmin(win) {
  const { username, password } = firstRunAdmin
  firstRunAdmin = null
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'TRC-MMS — first run',
    message: 'Your administrator account is ready',
    detail:
      `Username:  ${username}\n` +
      `Password:  ${password}\n\n` +
      'Write this down now — it is not shown again and is not stored anywhere in readable form.\n\n' +
      'Sign in and change it from Users & Access. If you lose it, use ' +
      'Help → Reset admin password.',
    buttons: ['I have written it down'],
    noLink: true,
  })
}

async function resetAdminPassword(win) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Reset admin password',
    message: 'Generate a new password for the "admin" account?',
    detail: 'The current admin password stops working immediately. No report data is affected.',
    buttons: ['Cancel', 'Generate new password'],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
  })
  if (response !== 1) return

  const password = randomBytes(9).toString('base64url')
  try {
    const serverSrc = join(here, 'app/server/src')
    const { hashPassword } = await import(pathToFileURL(join(serverSrc, 'auth.js')).href)
    const { prisma } = await import(pathToFileURL(join(serverSrc, 'db.js')).href)
    const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { id: 'asc' } })
    if (!admin) throw new Error('This database has no admin account to reset.')
    await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(password) } })

    dialog.showMessageBox(win, {
      type: 'info',
      title: 'New admin password',
      message: `Password reset for "${admin.username}"`,
      detail: `Password:  ${password}\n\nWrite it down now — it is not shown again.`,
      buttons: ['I have written it down'],
      noLink: true,
    })
  } catch (err) {
    dialog.showErrorBox('Could not reset the password', err.message)
  }
}

// ── Pulling the live server down onto this machine ───────────────
// One direction only, and every entry point says so before it does anything —
// see the header of sync.js for why the two databases cannot be merged.

/** The server modules the import writes through, loaded once DATABASE_URL is set. */
async function backupDeps() {
  const serverSrc = join(here, 'app/server/src')
  const { prisma } = await import(pathToFileURL(join(serverSrc, 'db.js')).href)
  const { importAll, validateExport, resyncSequences } = await import(pathToFileURL(join(serverSrc, 'backup.js')).href)
  return { prisma, importAll, validateExport, resyncSequences }
}

/**
 * The LOCAL database plus the same two functions the server's sync route uses.
 *
 * Deliberately the same module on both sides: a conflict has one rule, not two
 * implementations that agree today. Whichever end applies a batch resolves it
 * identically, which is what makes the outcome of a sync predictable from
 * either machine.
 */
async function entrySyncDeps() {
  const serverSrc = join(here, 'app/server/src')
  const { prisma } = await import(pathToFileURL(join(serverSrc, 'db.js')).href)
  const { applyChanges, pullChanges } = await import(pathToFileURL(join(serverSrc, 'entrySync.js')).href)
  return { prisma, applyChanges, pullChanges }
}

/**
 * Exchange working entries with live, both directions.
 *
 * Separate from "Replace everything from the live server" below, and not a
 * replacement for it. That one REPLACES this machine wholesale — history,
 * stock, vocabulary — and is how a copy is first set up. This moves only the
 * entries and moves them both ways, which is what a machine that gets typed
 * into wants: nothing on it is lost by running this.
 */
async function syncEntriesWithLive(win, { silent = false } = {}) {
  const stored = readSync(CONFIG_PATH)
  const url = normalizeUrl(stored.url)
  const password = recallPassword(CONFIG_PATH)
  if (!url || !stored.username || !password) {
    if (silent) return { ok: false, reason: 'not configured' }
    if (!(await configureSync(win))) return { ok: false, reason: 'cancelled' }
    return syncEntriesWithLive(win, { silent: false })
  }

  try {
    // Two marks, each a counter in its own database, and never interchangeable
    // — see the note in sync.js. A config written before the counter existed
    // has neither, and starting from nothing is the right answer: the first
    // sync then compares every entry by revision rather than trusting a mark
    // that counted something else.
    const result = await syncEntries({ url, username: stored.username, password }, await entrySyncDeps(), {
      localSeq: stored.entriesLocalSeq ?? null,
      serverSeq: stored.entriesServerSeq ?? null,
    })
    writeSync(CONFIG_PATH, { entriesLocalSeq: result.localSeq, entriesServerSeq: result.serverSeq })
    if (!silent) {
      await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Entries synced',
        message: `Exchanged with ${result.origin}`,
        detail: `${describeExchange(result)}

Where the same entry was changed in both places, the version with more edits behind it won.`,
        buttons: ['Close'],
        noLink: true,
      })
    }
    win?.webContents?.reload()
    return { ok: true, result }
  } catch (err) {
    if (silent) return { ok: false, reason: err.message }
    return offerNewCredentials(win, err, () => syncEntriesWithLive(win, { silent: false }))
  }
}

/**
 * Ask for whatever is still missing, then pull.
 *
 * `silent` is the automatic path: it runs only when everything needed is
 * already stored, and it never opens a dialog to ask for more. An auto-sync
 * that popped a password box on reconnect would be a machine interrupting
 * somebody rather than a machine keeping itself current.
 */
async function syncFromLive(win, { silent = false } = {}) {
  const stored = readSync(CONFIG_PATH)
  const url = normalizeUrl(stored.url)
  const password = recallPassword(CONFIG_PATH)

  if (!url || !stored.username || !password) {
    if (silent) return { ok: false, reason: 'not configured' }
    const ready = await configureSync(win)
    if (!ready) return { ok: false, reason: 'cancelled' }
    return syncFromLive(win, { silent: false })
  }

  if (!silent) {
    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Sync from the live server',
      message: `Replace this machine's data with ${url}?`,
      detail:
        'Everything on this computer is replaced by a copy of the live server: reports, ' +
        'saved reports, inventory, the ledger, the option lists and the code map.\n\n' +
        'ANYTHING TYPED ON THIS MACHINE AND NOT ON THE LIVE SERVER IS LOST.\n\n' +
        'Your login here is kept — accounts are not copied.',
      checkboxLabel: 'Keep this machine up to date automatically when the internet is available',
      checkboxChecked: stored.auto === true,
      buttons: ['Cancel', 'Replace with live data'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    writeSync(CONFIG_PATH, { auto: checkboxChecked })
    if (response !== 1) return { ok: false, reason: 'cancelled' }
  }

  try {
    const doc = await fetchLiveExport({ url, username: stored.username, password })
    const result = await applyExport(doc, await backupDeps(), { skip: DESKTOP_SKIP })
    writeSync(CONFIG_PATH, { lastSyncAt: new Date().toISOString(), lastSyncFrom: url })
    if (!silent) {
      await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Sync complete',
        message: `Copied from ${url}`,
        detail: `${describeResult(result)}\n\nTaken from the live server at ${new Date(doc.exportedAt).toLocaleString()}.`,
        buttons: ['Close'],
        noLink: true,
      })
    }
    // The page is showing the database as it was a moment ago.
    win?.webContents?.reload()
    return { ok: true, result }
  } catch (err) {
    if (silent) return { ok: false, reason: err.message }
    return offerNewCredentials(win, err, () => syncFromLive(win, { silent: false }))
  }
}

/**
 * A sync failed. If it failed over WHO signed in, offer to fix that.
 *
 * This exists because both sync paths used to end at an error box, while the
 * credentials prompt only ever appeared when credentials were MISSING. Once a
 * wrong username was stored, nothing in the app could change it: every retry
 * went straight back to the same refusal, and the only real fix was editing
 * config.json by hand. A rejected password and an account without admin rights
 * both landed there, and both are things the person in front of the machine
 * could have corrected in seconds if anything had asked them.
 *
 * Only credential failures reopen the prompt. A timeout or an unreachable
 * server is not something retyping a password fixes, and offering it would
 * teach people to blame their own login for the network being down.
 *
 * The retry is never automatic — it happens only after somebody chooses to
 * change the sign-in and completes the prompt — so this cannot spin.
 */
async function offerNewCredentials(win, err, retry) {
  if (!err?.credentials) {
    dialog.showErrorBox('Sync failed', `${err.message}\n\nNothing on this machine was changed.`)
    return { ok: false, reason: err.message }
  }
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Sync failed',
    message: err.message,
    detail: 'Nothing on this machine was changed.\n\nSign in as a different account on the live server?',
    buttons: ['Cancel', 'Change sign-in'],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
  })
  if (response !== 1) return { ok: false, reason: err.message }
  if (!(await configureSync(win))) return { ok: false, reason: 'cancelled' }
  return retry()
}

/** Where the live server is and who to sign in as. Returns whether it is now usable. */
async function configureSync(win) {
  const stored = readSync(CONFIG_PATH)
  const url = await promptLine(win, {
    title: 'Live server',
    message: 'Address of the live TRC-MMS server',
    detail: 'For example:  https://trc-mms.up.railway.app',
    value: stored.url ?? '',
  })
  if (url === null) return false
  if (!normalizeUrl(url)) {
    dialog.showErrorBox('Sync', 'That is not a valid address.')
    return false
  }
  const username = await promptLine(win, {
    title: 'Live server',
    message: 'Admin username on the live server',
    detail: 'Only an admin account can export the database.',
    value: stored.username ?? '',
  })
  if (username === null || !username.trim()) return false
  const password = await promptLine(win, {
    title: 'Live server',
    message: `Password for "${username.trim()}"`,
    detail: canStoreSecret()
      ? 'Stored encrypted by Windows, so it is not readable from a copied profile.'
      : 'This computer offers no secure store, so the password is NOT saved and automatic sync is unavailable — you will be asked for it each time.',
    value: '',
    password: true,
  })
  if (password === null || !password) return false

  writeSync(CONFIG_PATH, { url: normalizeUrl(url), username: username.trim() })
  rememberPassword(CONFIG_PATH, password)
  return true
}

/**
 * A one-line input, which Electron has no dialog for.
 *
 * A small modal BrowserWindow holding an inline document. Nothing is loaded
 * from disk or the network, so this stays true to the build's promise that it
 * contacts nothing — and a password typed here never reaches the app's own
 * page or its localStorage.
 */
function promptLine(win, { title, message, detail, value = '', password = false }) {
  return new Promise((resolve) => {
    const child = new BrowserWindow({
      parent: win,
      modal: true,
      show: false,
      width: 540,
      height: 280,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title,
      webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
    })
    const esc = (t) =>
      String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    const channel = `prompt-done-${child.id}`
    const html = [
      '<!doctype html><meta charset="utf-8"><style>',
      'body{font:14px system-ui,Segoe UI,sans-serif;margin:0;padding:18px;background:#fff;color:#111}',
      'h1{font-size:15px;margin:0 0 6px}p{margin:0 0 12px;color:#555;font-size:12.5px}',
      'input{width:100%;box-sizing:border-box;font:14px inherit;padding:8px 10px;border:1px solid #bbb;border-radius:6px}',
      '.row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}',
      'button{font:14px inherit;padding:7px 16px;border-radius:6px;border:1px solid #bbb;background:#f4f4f4}',
      'button.p{background:#1f57d6;border-color:#1f57d6;color:#fff}',
      '@media (prefers-color-scheme:dark){body{background:#1e1e1e;color:#eee}p{color:#aaa}',
      'input{background:#2b2b2b;color:#eee;border-color:#444}button{background:#333;color:#eee;border-color:#555}}',
      '</style>',
      `<h1>${esc(message)}</h1><p>${esc(detail)}</p>`,
      `<input id="v" type="${password ? 'password' : 'text'}" value="${esc(value)}">`,
      '<div class="row"><button id="c">Cancel</button><button id="o" class="p">OK</button></div>',
      '<script>',
      `const CH=${JSON.stringify(channel)};`,
      "const v=document.getElementById('v');v.focus();v.select();",
      'const done=(ok)=>window.desktop.promptDone(CH, ok?v.value:null);',
      "document.getElementById('o').onclick=()=>done(true);",
      "document.getElementById('c').onclick=()=>done(false);",
      "v.addEventListener('keydown',e=>{if(e.key==='Enter')done(true);if(e.key==='Escape')done(false)});",
      '</script>',
    ].join('')

    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
      if (!child.isDestroyed()) child.destroy()
    }
    ipcMain.once(channel, (_e, result) => finish(result))
    child.webContents.once('did-finish-load', () => child.show())
    child.on('closed', () => finish(null))
    child.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  })
}

/**
 * Keep the copy current on its own, when it has been asked to.
 *
 * Polls rather than listening for an online event: on a PC with no adapter at
 * all navigator.onLine is false even when a tether is carrying traffic, and
 * Electron's own net.isOnline has the same blind spot. Asking the live server
 * whether it answers is the only question whose answer is the one that matters.
 * Slow on purpose — this is a mirror, not a feed.
 */
function startAutoSync(win) {
  let reachableBefore = null
  let running = false
  const tick = async () => {
    if (running) return
    const { auto, url } = readSync(CONFIG_PATH)
    if (!auto || !url) return
    running = true
    try {
      const now = await reachable(url)
      // Only on the EDGE from unreachable to reachable, plus once at startup.
      // A machine left online must not re-pull every ten minutes and throw away
      // what somebody is in the middle of reading.
      if (now && reachableBefore !== true) await syncFromLive(win, { silent: true })
      reachableBefore = now
    } finally {
      running = false
    }
  }
  setTimeout(tick, 15_000).unref?.()
  const timer = setInterval(tick, 10 * 60_000)
  timer.unref?.()
  return timer
}

function buildMenu(win, config) {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          {
            label: 'Sync entries with the live server…',
            // Both directions, entries only. Nothing on this machine is lost by
            // running it — see the header of sync.js for why entries can go both
            // ways and saved reports and stock cannot.
            click: () => syncEntriesWithLive(win),
          },
          { type: 'separator' },
          {
            label: 'Replace everything from the live server…',
            // The live server is the authority and this machine is a copy of
            // it; see the header of sync.js for why it can only go this way.
            click: () => syncFromLive(win),
          },
          { type: 'separator' },
          {
            label: 'Live server sign-in…',
            // Reachable WITHOUT having to fail first. Both sync items store the
            // address and account on first use and then never ask again, so
            // before this existed the only way to correct a wrong username was
            // to edit config.json by hand — and you had to know that.
            click: () => configureSync(win),
          },
          { type: 'separator' },
          {
            label: 'Open data folder',
            // Where the database lives — this is the folder to back up, and the
            // one to copy when moving an install to another machine.
            click: () => shell.openPath(userData),
          },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          { role: 'toggleDevTools' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Reset admin password', click: () => resetAdminPassword(win) },
          { type: 'separator' },
          {
            label: 'About TRC-MMS',
            click: () =>
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'About TRC-MMS',
                message: `TRC-MMS ${app.getVersion()} — offline desktop edition`,
                detail:
                  'Software Developed by Muhammad Amir · MT# MT1063\n' +
                  '© 2026 Muhammad Amir. All rights reserved.\n\n' +
                  `Build:  ${clientBuildId()}\n` +
                  `Installation ID:  ${config.deviceTag}\n` +
                  `Data folder:  ${userData}\n\n` +
                  'This copy runs entirely on this computer. It stores its reports in ' +
                  'its own local database and never contacts the internet.',
                buttons: ['Close'],
                noLink: true,
              }),
          },
        ],
      },
    ]),
  )
}

// One install, one window. A second launch focuses the running copy rather than
// starting a second server against the same SQLite file.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow = null
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    try {
      const config = loadConfig()
      serverUrl = await startServer(config)
      mainWindow = createWindow()
      buildMenu(mainWindow, config)
      // Only does anything once somebody has ticked the box in the sync dialog.
      startAutoSync(mainWindow)
    } catch (err) {
      dialog.showErrorBox(
        'TRC-MMS could not start',
        `${err.message}\n\nData folder:\n${userData}\n\n` +
          'If this keeps happening, send this message along with the contents of that folder.',
      )
      app.quit()
    }
  })

  // The rendered PDFs and their HTML sources are scratch files; a viewer window
  // may still hold one open, so they go at quit rather than on close.
  app.on('will-quit', () => {
    for (const file of scratch) rmSync(file, { force: true })
  })

  app.on('window-all-closed', () => app.quit())
}
