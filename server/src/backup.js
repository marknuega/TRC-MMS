/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Whole-dataset export and import — the one way a database moves between two
 * installations of this app.
 *
 * It exists because the ordinary API cannot do it. Every other route models
 * what a PERSON does: POST /api/saved-reports snapshots whatever working
 * entries are on the server rather than accepting a report someone hands it,
 * and the inventory ledger has no write route at all, because a movement is a
 * consequence of a save and never a thing to be typed. Both are right for the
 * app and both make a copy impossible — a mirror built out of those routes
 * would carry the vocabulary and the stock and silently leave the history
 * behind.
 *
 * So this is deliberately NOT an API of intentions. It reads rows and writes
 * rows, ids and all, because the point is a faithful copy: a saved report must
 * come back carrying the same REP number it was printed under, and a ledger
 * line must still name the item it moved.
 *
 * WHAT IT IS FOR. Loading the offline desktop build from the live server is the
 * case it was written for, but nothing here knows that — it is equally a backup
 * taken before a risky change, and equally the way a second branch machine is
 * brought up. The two editions run the same server against different databases
 * (PostgreSQL on Railway, SQLite on a desktop), which is exactly why this
 * works: one schema, one set of tables, two engines.
 *
 * WHAT IT IS NOT. It is not sync. There is no merge, no conflict resolution
 * and no clock: an import REPLACES the tables it is given, wholesale. Two
 * machines that have both been typed into cannot be reconciled by this and
 * must not be — one of them would lose a day's work with nothing to show which
 * day it was.
 */

// Every table, in an order that satisfies the foreign keys when read top-down
// and, reversed, when deleted. `parent` names the table a row hangs off, so a
// child is never inserted before the row it points at and never outlives it.
//
// Kept as data rather than twelve hand-written calls so a model added to the
// schema is added HERE, once, and both directions pick it up — a table missing
// from an export is a table silently absent from every copy made afterwards.
export const TABLES = [
  { key: 'appOptions', model: 'appOptions' },
  { key: 'codeMap', model: 'codeMap' },
  { key: 'users', model: 'user' },
  { key: 'credentialRequests', model: 'credentialRequest' },
  { key: 'monthlySheets', model: 'monthlySheet' },
  { key: 'savedReports', model: 'savedReport' },
  { key: 'reports', model: 'report' },
  { key: 'reportEntries', model: 'reportEntry' },
  { key: 'faults', model: 'fault', parent: 'reportEntries' },
  { key: 'inventoryItems', model: 'inventoryItem' },
  { key: 'inventoryTxns', model: 'inventoryTxn', parent: 'inventoryItems' },
  { key: 'processedMessages', model: 'processedMessage' },
]

export const FORMAT = 'trc-mms-export'
export const VERSION = 1

/** Tables a caller may leave behind, and what leaving them behind means. */
export const SKIPPABLE = {
  // The one skip with a real use. Importing live data into a desktop machine
  // replaces its accounts with the server's, and the admin doing the importing
  // is signed in as one of the accounts being deleted — so the next request is
  // from a user that no longer exists. Skipping keeps the local login working.
  // Safe in a way no other skip is: NOTHING references a user by foreign key.
  // Reports carry a technician's NAME, not their id, so an entry means the same
  // thing under any set of accounts.
  users: 'keeps the accounts already on this machine',
  // WhatsApp de-duplication ids. Purely operational, pruned on a timer, and
  // meaningless on a machine no webhook reaches.
  processedMessages: 'drops the WhatsApp de-duplication log',
  // A queue of people asking for a login on the source system. Rarely wanted
  // on a copy, and never wanted on a desktop machine that issues no logins.
  credentialRequests: 'drops pending credential requests',
}

/**
 * Read every table out, ids and relations intact.
 *
 * Ordered by id so an export of an unchanged database is byte-identical run to
 * run — which is what lets two exports be diffed to see what a day changed.
 */
export async function exportAll(prisma) {
  const data = {}
  for (const { key, model } of TABLES) {
    data[key] = await prisma[model].findMany(
      model === 'processedMessage' ? { orderBy: { messageId: 'asc' } } : { orderBy: { id: 'asc' } },
    )
  }
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    edition: process.env.APP_EDITION || 'server',
    counts: Object.fromEntries(Object.entries(data).map(([k, rows]) => [k, rows.length])),
    data,
  }
}

/** What is wrong with a document, or '' when it can be imported. */
export function validateExport(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'Body must be an export document.'
  if (doc.format !== FORMAT) return `Not a TRC-MMS export (format is ${JSON.stringify(doc.format ?? null)}).`
  // Newer is refused rather than guessed at: a document written by a later
  // version may carry a table this one would drop on the floor, and a restore
  // that quietly loses a table is worse than one that refuses.
  if (!Number.isInteger(doc.version) || doc.version > VERSION) {
    return `Export version ${doc.version} is newer than this app understands (${VERSION}). Update the app first.`
  }
  if (!doc.data || typeof doc.data !== 'object' || Array.isArray(doc.data)) return 'The export has no data.'
  for (const { key } of TABLES) {
    if (doc.data[key] !== undefined && !Array.isArray(doc.data[key])) return `${key} must be an array.`
  }
  return ''
}

// Prisma hands JSON columns back as objects and DateTimes as Date instances;
// both survive JSON.stringify, but a Date comes back as a string that Prisma
// will not accept on the way in. Revived here rather than at the call site so
// an export written to a file and one held in memory import identically.
const DATE_FIELD = /(At|Date)$/
const revive = (row) => {
  const out = {}
  for (const [k, v] of Object.entries(row ?? {})) {
    out[k] = typeof v === 'string' && DATE_FIELD.test(k) && !Number.isNaN(Date.parse(v)) ? new Date(v) : v
  }
  return out
}

/**
 * Replace the database with the contents of an export.
 *
 * Everything happens in ONE transaction: a restore that half-succeeds would
 * leave a database with this month's inventory and last month's reports, which
 * is not a state anybody could reason about afterwards. Either the copy lands
 * or the machine is exactly as it was.
 *
 * @param prisma  a client, or a transaction client
 * @param doc     a validated export document
 * @param skip    table keys to leave alone entirely (see SKIPPABLE)
 */
export async function importAll(prisma, doc, { skip = [] } = {}) {
  const skipped = new Set(skip)
  const tables = TABLES.filter((t) => !skipped.has(t.key))
  const result = { imported: {}, skipped: [...skipped] }

  // Children first, so nothing is deleted out from under a row still pointing
  // at it. Cascades would cover the two relations we have, but only by
  // accident of their being declared onDelete: Cascade — deleting in order
  // means this keeps working when a relation without one is added.
  for (const { key, model } of [...tables].reverse()) {
    await prisma[model].deleteMany({})
    void key
  }

  // A skipped PARENT with an unskipped child would leave the child pointing at
  // rows that were never deleted and never replaced. No such pair exists today
  // (users and processedMessages have no children), and this is what says so
  // out loud if one is ever added.
  for (const t of tables) {
    if (t.parent && skipped.has(t.parent)) {
      throw new Error(`Cannot import ${t.key} while skipping ${t.parent} — it would point at rows that are not here.`)
    }
  }

  for (const { key, model } of tables) {
    const rows = (doc.data[key] ?? []).map(revive)
    // One at a time rather than createMany: SQLite's createMany is a loop
    // anyway, the row counts here are small, and a failure names the row that
    // caused it instead of the batch it was in.
    for (const row of rows) await prisma[model].create({ data: row })
    result.imported[key] = rows.length
  }
  return result
}

/**
 * Put every id sequence back above the highest id just inserted.
 *
 * PostgreSQL only. Inserting an explicit id does not advance the sequence
 * behind it, so the very next row created by an ordinary save would collide
 * with an imported one — the restore looks perfect and the first thing anybody
 * types fails on a unique constraint. SQLite needs nothing: its rowid counter
 * follows MAX(id) on its own, which is why the desktop build never hit this.
 */
export async function resyncSequences(prisma, { skip = [] } = {}) {
  if (isSqlite()) return []
  const done = []
  for (const { key, model } of TABLES) {
    if (skip.includes(key) || model === 'processedMessage') continue // no integer id
    const table = TABLE_NAMES[key]
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`,
    )
    done.push(key)
  }
  return done
}

/** `file:` is what the desktop build points DATABASE_URL at (see desktop/main.js). */
export const isSqlite = () => /^file:/i.test(process.env.DATABASE_URL ?? '')

// The @@map names from schema.prisma. Needed only by resyncSequences, which
// speaks SQL rather than Prisma and so cannot ask the model for its table.
const TABLE_NAMES = {
  appOptions: 'app_options',
  codeMap: 'code_map',
  users: 'users',
  credentialRequests: 'credential_requests',
  monthlySheets: 'monthly_sheets',
  savedReports: 'saved_reports',
  reports: 'reports',
  reportEntries: 'report_entries',
  faults: 'faults',
  inventoryItems: 'inventory_items',
  inventoryTxns: 'inventory_txns',
}
