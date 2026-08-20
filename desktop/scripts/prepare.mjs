/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Assembles desktop/app/ — the tree electron-builder actually packages.
 *
 * The server is copied rather than imported across the repo because the layout
 * has to be preserved exactly: server/src/app.js finds the built client with
 * `path.resolve(here, '../../client/dist')`. Reproducing that same relative
 * shape under app/ means the server needs no desktop-specific branch at all —
 * it runs in the packaged app byte for byte as it runs on Railway.
 *
 *   app/
 *     server/src/**      <- copied from ../server/src
 *     client/dist/**     <- copied from ../client/dist
 *     template.db        <- an empty database built from the SQLite schema
 *
 * template.db is built HERE, at package time, so the installed app never needs
 * Prisma's schema engine at runtime — only the query engine. First launch just
 * copies this file into the user's profile.
 */

import { cpSync, existsSync, rmSync, mkdirSync, copyFileSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = resolve(here, '..')
const repo = resolve(desktop, '..')
const app = resolve(desktop, 'app')

// Windows needs a shell to resolve `npm`/`npx` (they are .cmd shims), but a
// shell re-splits the arguments — and this repo's own path contains a space
// ("TRC Daily Report"), so every path argument has to be quoted or it arrives
// as two broken halves.
const run = (cmd, args, cwd, env) => {
  const shell = process.platform === 'win32'
  return execFileSync(cmd, shell ? args.map((a) => (/[\s]/.test(a) ? `"${a}"` : a)) : args, {
    cwd,
    stdio: 'inherit',
    shell,
    env: { ...process.env, ...env },
  })
}

// ── 1. Always rebuild the client ─────────────────────────────────
// ALWAYS, not "if dist/ is missing". That earlier shortcut was the source of a
// genuinely nasty class of bug: an existing-but-stale client/dist passed the
// check and got packaged as-is, so editing client/src/report.js and building the
// installer shipped the PREVIOUS calculation rules. Nothing looks broken when
// that happens — the app just quietly produces different totals from the same
// data, and the only symptom is someone noticing a number is wrong days later.
//
// A Vite build of this client takes about a second. There is no version of that
// trade worth taking.
const clientDist = resolve(repo, 'client/dist')
console.log('prepare: building the client (always, so a stale dist can never ship)')
run('npm', ['run', 'build'], resolve(repo, 'client'))

if (!existsSync(resolve(clientDist, 'index.html'))) {
  console.error('prepare: the client build produced no index.html — refusing to package.')
  process.exit(1)
}

// ── 2. Fresh app/ every time ─────────────────────────────────────
// A stale file here would ship silently: the packager copies whatever it finds,
// so a route deleted upstream would live on inside the installer.
rmSync(app, { recursive: true, force: true })
mkdirSync(app, { recursive: true })

cpSync(resolve(repo, 'server/src'), resolve(app, 'server/src'), { recursive: true })
cpSync(clientDist, resolve(app, 'client/dist'), { recursive: true })

// ── 2b. The modules the server shares with the client ────────────
// The server does not only serve the client, it imports from its source:
// auth.js and reportEntry.js pull in client/src/options.js, and dailyText.js
// and savedReports.js pull in client/src/report.js, so the option vocabulary
// and the counting rules have exactly one definition.
//
// Those files are followed transitively rather than listed, so a new shared
// module is picked up on its own. The whole of client/src is deliberately NOT
// copied: it would put the entire readable UI source inside the installer for
// the sake of two files.
function copyShared() {
  const clientSrc = resolve(repo, 'client/src')
  const seen = new Set()
  const queue = []

  // Scanned in the repo, not in app/: the import has to resolve against a tree
  // where client/src actually exists, which the destination does not yet.
  for (const file of ['server/src', 'server/src/routes', 'server/src/whatsapp']
    .filter((dir) => existsSync(resolve(repo, dir)))
    .flatMap((dir) => readdirSync(resolve(repo, dir)).map((f) => resolve(repo, dir, f)))
    .filter((f) => f.endsWith('.js'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/from\s+'((?:\.\.\/)+client\/src\/[^']+)'/g)) {
      queue.push(resolve(dirname(file), m[1]))
    }
  }

  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    // Relative imports inside a shared module are shared too.
    for (const m of source.matchAll(/from\s+'(\.[^']+)'/g)) queue.push(resolve(dirname(file), m[1]))
  }

  for (const file of seen) {
    const rel = file.slice(clientSrc.length + 1)
    const dest = resolve(app, 'client/src', rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(file, dest)
  }
  return [...seen].map((f) => f.slice(clientSrc.length + 1))
}

// The paths above resolve against app/server/src, whose '../../client/src' is
// app/client/src — the same shape as the repo, so nothing needs rewriting.
const shared = copyShared()
console.log(`prepare: ${shared.length} shared client module(s): ${shared.join(', ')}`)

// ── 3. SQLite schema + client ────────────────────────────────────
run('node', [resolve(here, 'make-sqlite-schema.mjs')], desktop)

// Generated into app/generated/prisma (the schema carries the output path), so
// the server's own Postgres client in server/node_modules is left alone — the
// two never overwrite each other.
run('npx', ['prisma', 'generate', '--schema', resolve(desktop, 'prisma/schema.prisma')], desktop)

// ── 4. The empty template database ───────────────────────────────
const template = resolve(app, 'template.db')
rmSync(template, { force: true })
run('npx', ['prisma', 'db', 'push', '--schema', resolve(desktop, 'prisma/schema.prisma'), '--skip-generate'], desktop, {
  DATABASE_URL: `file:${template}`,
})

if (!existsSync(template)) {
  console.error('prepare: template.db was not created — the packaged app would have no database.')
  process.exit(1)
}

// The schema travels with the app: @prisma/client reads it at runtime to know
// the model shapes, and it is outside app/ in the packaged layout.
copyFileSync(resolve(desktop, 'prisma/schema.prisma'), resolve(app, 'server/src/schema.prisma'))

console.log('prepare: app/ assembled (server + client + template.db)')
