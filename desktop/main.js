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
const { app, BrowserWindow, dialog, Menu, shell } = electron
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Pin the data folder name before anything reads it. Left alone, Electron names
// it from package.json's `name` ("trc-mms-desktop"), which is a build-time
// detail nobody should have to recognise when they go looking for the database
// to back up. Must run before the first getPath('userData').
app.setName('TRC-MMS')

const userData = app.getPath('userData')
const DB_PATH = join(userData, 'trc-mms.db')
const CONFIG_PATH = join(userData, 'config.json')

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
  mkdirSync(userData, { recursive: true })
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
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
    createdAt: new Date().toISOString(),
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
  return config
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

// ── Window ───────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'TRC-MMS',
    backgroundColor: '#ffffff',
    icon: app.isPackaged ? undefined : join(here, 'build/icon.png'),
    webPreferences: {
      // The page is our own app served from localhost, but it has no need to
      // reach Node, so it does not get to.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
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

function buildMenu(win, config) {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
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
    } catch (err) {
      dialog.showErrorBox(
        'TRC-MMS could not start',
        `${err.message}\n\nData folder:\n${userData}\n\n` +
          'If this keeps happening, send this message along with the contents of that folder.',
      )
      app.quit()
    }
  })

  app.on('window-all-closed', () => app.quit())
}
