# TRC-MMS — offline desktop build

A Windows installer that runs TRC-MMS entirely on one computer, with no internet
connection of any kind.

_Software Developed by Muhammad Amir · MT# MT1063 — © 2026 Muhammad Amir. All rights reserved._

## What it is

There is no desktop rewrite. This packages the **same** Express server and the
**same** React client that run on Railway, and points an Electron window at them
over `127.0.0.1`. The only substitution is the database: PostgreSQL becomes a
local SQLite file.

```
TRC-MMS (Desktop).exe
  └── Electron window ── http://127.0.0.1:<stable port>
                            └── Express (server/src, unmodified)
                                  └── SQLite  %APPDATA%\TRC-MMS (Desktop)\trc-mms.db
```

Nothing in the app contacts the network. No CDN, no remote font, no telemetry,
no sync.

## Telling it apart from the website

The deployed site can be installed as a PWA, which also opens in its own window
with its own icon and no browser chrome. The two look nearly identical, but one
talks to Railway and the other to a database on this machine — and typing a day
of reports into the wrong one is an easy, expensive mistake.

So this build is named **TRC-MMS (Desktop)** everywhere: the installer, the
shortcut, the data folder, and the window title, which is pinned rather than
taken from the page (the page's `<title>` is the same string the PWA shows). It
also has a **File / Edit / View / Help** menu bar, which the PWA has not, and
`Help → About` names the edition, the installation ID and the data folder.

## The sync UI is suppressed here

The client is shipped unchanged, offline queue and all, but the server sets
`APP_EDITION=desktop` and `/api/auth/me` passes that to the client, which then
hides the sync and offline pills.

This is not cosmetic. On a PC with no network at all, `navigator.onLine` is
`false` even though the server is on the same machine, which without this flag
would (a) show a permanent "Offline" badge on a perfectly working app and (b)
make `flushQueue` refuse to drain, stranding any write that ever did queue.
Writes themselves were never at risk — they always try the network first, and
`fetch` to `127.0.0.1` succeeds regardless of what the network adapter says.

The expired-session pill still shows, because that one is real and actionable.

## Stale bundles: why every build rebuilds the client

The report calculation rules live in `client/src/report.js`, which means they
ship **inside the client bundle**. A stale bundle therefore does not look
broken — the app quietly computes different totals from the same data, and the
only symptom is somebody noticing a number is wrong, often days later.

`prepare.mjs` used to build the client only when `client/dist` was missing, so
an existing-but-stale `dist/` was packaged as-is. Editing `report.js` and
building the installer shipped the *previous* rules. It now rebuilds the client
every single time; a Vite build of this client takes about a second.

Three defences, so this cannot come back quietly:

1. **`prepare.mjs` always rebuilds** — the stale input is gone at the source.
2. **Every build is stamped.** `vite.config.js` bakes a `BUILD_ID`
   (`<timestamp>-<git sha>`, plus `-dirty` for an uncommitted tree) into the
   bundle, writes it to `dist/build.json`, and the server reports it at
   `/api/version`. It shows in the app footer and under `Help → About`, so
   "which code is this actually running" is a thing you read, not deduce.
3. **`scripts/smoke.mjs` fails if the packaged client is not the current one** —
   it compares what the packaged server serves against a freshly built
   `client/dist/build.json`.

The live web app has a different failure mode — Railway always rebuilds, so the
*deployed* bundle is current, but a tab left open across a deploy keeps running
the code it loaded. `UpdateBanner` in `client/src/version.jsx` polls
`/api/version` (every five minutes and on window focus) and offers a reload when
the running build no longer matches the server's.

## Printing: why the desktop path is different

Electron has no print preview. `window.print()` opens the Windows **printer**
dialog — no PDF view, no "Save as PDF" — and `window.open('', '_blank')`, which
several exports used to build their document in, is a popup the shell declines
to open at all, so those exports silently did nothing.

Every export now goes through `client/src/printDoc.js`. In a browser it is the
hidden-iframe trick as before. In the desktop app the document is handed to the
main process over `preload.cjs`, rendered with `printToPDF`, and shown in a
viewer window with Chromium's own PDF controls — the same end result the browser
gives: a PDF on screen that can be saved.

Two things that are easy to get wrong here, both checked by
`npm run print-check`:

- **The preload must actually load.** Electron ignores a preload path it cannot
  resolve without raising anything — no error, no event — leaving
  `window.trcDesktop` undefined and the client falling back to the browser path,
  which on Electron is the printer dialog. The check asserts the bridge is there.
- **One reused renderer, not one per export.** Destroying a `BrowserWindow` and
  creating another leaves the new one failing every `file://` load with
  `ERR_FAILED`, so the first export would work and every later one would produce
  nothing. The hidden worker is created once and reused, and dropped with the
  main window so `window-all-closed` still fires.

## Building the installer

```bash
cd desktop
npm install
npm run build      # -> desktop/release/TRC-MMS (Desktop) Setup 1.0.4.exe
```

`npm run build` runs `scripts/prepare.mjs` first, which:

1. builds the React client if `client/dist` is missing,
2. copies `server/src` and `client/dist` into `desktop/app/`, preserving the
   relative layout so `app.js` finds the client with no code change,
3. follows the server's imports into `client/src` and copies only the modules it
   actually shares (currently `options.js` and `report.js`),
4. derives the SQLite schema from `server/prisma/schema.prisma`,
5. generates a SQLite Prisma client into `app/generated/prisma`, and
6. builds `app/template.db` — the empty starter database.

`desktop/app/`, `desktop/prisma/` and `desktop/release/` are all generated. None
of them are committed.

## Checking it before you ship it

```bash
node scripts/smoke.mjs
```

Boots the packaged server against a throwaway SQLite database and drives the
real HTTP API — login, sessions, the `Json` columns, the report round trip.
This is the check that matters: everything it covers is something the
PostgreSQL→SQLite conversion could have broken silently.

## Installing on a technician's PC

Copy `TRC-MMS (Desktop) Setup 1.0.4.exe` (about 126 MB) to the machine and run it. It
installs per-user, so it needs no administrator rights, and it creates a desktop
and Start Menu shortcut.

**On first launch a dialog shows the administrator username and a generated
password. Write it down — it is shown once and is never stored in readable
form.** If it is lost, use **Help → Reset admin password**.

## Where the data lives

```
%APPDATA%\TRC-MMS (Desktop)\
    trc-mms.db     every report, entry, inventory row and user
    config.json    the JWT secret, the local port, the installation ID
```

Deliberately **not** beside the `.exe`: Program Files is not writable by a
standard user, and reinstalling or upgrading replaces that folder wholesale.
Keeping the database in the profile means a reinstall never destroys reports.

**`trc-mms.db` is the only file worth backing up.** `File → Open data folder`
opens it directly. Copy that file somewhere safe on a schedule — there is no
server behind this build, so if the machine dies, that file is the reports.

## Things to know before rolling it out

**Each install is an island.** Every copy has its own database. A report typed
on one machine does not exist on any other, an admin sees only what was typed on
their own PC, and inventory counts drift apart independently. This is what a
fully standalone build means, and it is the main thing to weigh against the LAN
option (one PC serving the others, still with no internet).

**Document numbers collide across machines.** Each install mints its own
`REP-####` series starting from 1, so two PCs will both produce `REP-0001` for
different reports. `config.json` carries a per-install `deviceTag` (shown under
**Help → About**) so the documents can be told apart after the fact.

**Upgrades keep the data but not schema changes.** Installing a newer build
leaves `%APPDATA%\TRC-MMS (Desktop)\trc-mms.db` untouched, which is right for the reports
but means a build whose schema has changed will not match an existing database.
Adding a migration step is the follow-up work when the schema next moves.

**The build is unsigned.** Windows SmartScreen will warn on first run
("Windows protected your PC" → More info → Run anyway). A code-signing
certificate is what removes that.

## Why the schema is generated, not written

`scripts/make-sqlite-schema.mjs` derives the SQLite schema from the server's
PostgreSQL one at build time, so the two cannot drift — a model added to the
server and forgotten here would otherwise ship a desktop app whose database
silently lacks a table.

Three differences are handled, and anything else stops the build rather than
being guessed at:

| PostgreSQL | SQLite | Why it is safe |
| --- | --- | --- |
| `provider = "postgresql"` | `provider = "sqlite"` | the database file path arrives as `DATABASE_URL`, as on Railway |
| `@db.Date` | dropped | every write is `new Date("YYYY-MM-DD")` (UTC midnight) and every read goes through `dateKey()`, so date-only semantics survive |
| `Json @default("{}")` | default dropped | Prisma emits invalid SQLite DDL for it; both tables are single-row stores whose every write passes `data` explicitly |

The generated Prisma client goes to `app/generated/prisma` rather than the
default `node_modules/.prisma/client`, because electron-builder collects
`node_modules` from the declared dependency tree — `.prisma` is not a package
anyone depends on, so the default location is dropped from the installer and the
app dies on its first query.
