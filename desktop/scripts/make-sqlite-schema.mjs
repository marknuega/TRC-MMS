/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Derives the desktop build's SQLite schema from the server's PostgreSQL one.
 *
 * The two must never be maintained by hand in parallel — a model added to the
 * server and forgotten here would build a desktop app whose database silently
 * lacks a table. So this generates the SQLite copy at build time and the
 * generated file is not committed.
 *
 * Only two things actually differ between the two databases:
 *   1. the datasource provider and url, and
 *   2. `@db.Date`, which SQLite has no native type for.
 *
 * Dropping `@db.Date` is safe here because nothing relies on the column being
 * date-only at the storage layer: every write goes through `new Date("YYYY-MM-DD")`,
 * which is UTC midnight, and every read goes back through `dateKey()`, which is
 * `toISOString().slice(0, 10)`. The time component is always zero, so the
 * `@unique` on Report.reportDate still means "one report per day".
 *
 * Anything else Postgres-only that shows up later should fail loudly rather
 * than be quietly rewritten — see the guard at the bottom.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../server/prisma/schema.prisma')
const OUT = resolve(here, '../prisma/schema.prisma')

let schema = readFileSync(SRC, 'utf8')

// The desktop database is a file in the user's profile; main.js passes its path
// in as DATABASE_URL, exactly as Railway does for Postgres.
schema = schema.replace(
  /datasource\s+db\s*\{[^}]*\}/,
  ['datasource db {', '  provider = "sqlite"', '  url      = env("DATABASE_URL")', '}'].join('\n'),
)

// SQLite stores no date-only type, so the native attribute goes. See the note
// above for why this changes no behaviour.
const dropped = (schema.match(/\s*@db\.Date/g) || []).length
schema = schema.replace(/\s*@db\.Date/g, '')

// The generated client goes into app/ rather than the default
// node_modules/.prisma/client, for two reasons. electron-builder collects
// node_modules from the declared dependency tree, and `.prisma` is not a
// package anyone depends on — so the default location is silently dropped from
// the installer and the app dies on its first query. And keeping it inside app/
// means the server's own Postgres client is never overwritten by this one.
schema = schema.replace(
  /generator\s+client\s*\{[^}]*\}/,
  ['generator client {', '  provider = "prisma-client-js"', '  output   = "../app/generated/prisma"', '}'].join('\n'),
)

// Prisma emits `DEFAULT {}` — unquoted, and therefore a syntax error — when it
// builds SQLite DDL for a Json column with a literal default, so `prisma db push`
// dies on the AppOptions and CodeMap tables. Dropping the default is safe rather
// than merely expedient: both are single-row (id=1) stores, and every write to
// them is an upsert whose `create` branch passes `data` explicitly
// (routes/options.js, routes/codemap.js), so nothing ever inserts a row and
// leaves the column to the database.
let defaults = 0
schema = schema.replace(/(Json[ \t]+)@default\("\{\}"\)[ \t]*/g, (_, keep) => {
  defaults += 1
  return keep
})

// Any OTHER native-type attribute is a Postgres feature this script has not
// been taught to translate. Rewriting one blindly could change how a column
// stores data, so stop and make it a decision rather than a silent guess.
const unknown = [...schema.matchAll(/@db\.\w+/g)].map((m) => m[0])
if (unknown.length) {
  console.error(`make-sqlite-schema: unhandled native types: ${[...new Set(unknown)].join(', ')}`)
  console.error('Teach this script how to translate them before shipping a desktop build.')
  process.exit(1)
}

const banner = [
  '// GENERATED FILE — do not edit, and do not commit.',
  '// Built from server/prisma/schema.prisma by desktop/scripts/make-sqlite-schema.mjs.',
  '// Edit the server schema instead; this is rebuilt on every desktop build.',
  '',
].join('\n')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, banner + schema, 'utf8')

const models = (schema.match(/^model\s/gm) || []).length
console.log(`make-sqlite-schema: ${models} models, dropped ${dropped} @db.Date + ${defaults} Json default(s) -> ${OUT}`)
