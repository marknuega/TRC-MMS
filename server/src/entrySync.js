/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Two-way sync of WORKING ENTRIES between the live server and a desktop copy.
 *
 * Entries only, and that boundary is the whole reason this is safe when a
 * whole-database sync is not. An entry carries no number anybody minted and no
 * running total: it is a device, a date and up to six faults, and two machines
 * can each hold some without either being wrong. Everything the full copy
 * carries and this does not is excluded because it CANNOT be merged —
 *
 *   SavedReport   seq is globally unique and [series, branch, docNumber] is
 *                 unique per branch, so two machines both saving mint the same
 *                 REP number and one of them has to lose a printed document.
 *   InventoryItem begin/out are running counters. Two machines each consuming
 *                 stock is a lost update with no way to detect it after.
 *   InventoryTxn  a ledger is an append-only account of what the saves did; it
 *                 follows from them and is not a thing to reconcile.
 *
 * — so those still travel one way, through the whole-database copy in
 * backup.js. This is the one part of the database where two-way is meaningful.
 *
 * HOW A ROW IS IDENTIFIED. By syncId, a uuid minted where the entry was
 * created. Never by `id`: that is an autoincrement, so the desktop's entry 5
 * and the server's entry 5 are different entries and matching on it would
 * merge two people's work into one row.
 *
 * WHO WINS. The later syncRev — the moment the owning machine last changed the
 * entry, in its own clock. An entry is treated as ONE DOCUMENT: the winner's
 * faults replace the loser's outright rather than being merged fault by fault,
 * because a half-and-half list of faults is a device nobody worked on.
 *
 * THE CLOCK. Last-write-wins on wall clocks is only as good as the clocks, and
 * a desktop PC's clock is not guaranteed to be anything. A machine running an
 * hour fast wins every conflict it is in, including the ones it should lose,
 * and nothing about the result looks wrong afterwards. skewOf() below measures
 * the difference and the caller refuses a sync that is badly out — which
 * converts a silent wrong answer into a message somebody can act on. It cannot
 * make LWW correct; it can stop it being confidently wrong.
 */

// A machine more than this far from the server cannot be trusted to say which
// of two edits came second. Five minutes is far wider than any real drift and
// far narrower than the gap that does damage.
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

// How long a deletion has to keep being announced. A machine that syncs less
// often than this and then pushes would resurrect an entry deleted while it was
// away, so this is the real ceiling on "how long a copy may stay offline".
export const TOMBSTONE_DAYS = 90

export const entryShape = {
  include: { faults: { orderBy: { position: 'asc' } } },
}

/** The fields an entry carries across, without the local-only id. */
const SCALARS = [
  'syncId',
  'syncRev',
  'reportDate',
  'mode',
  'branch',
  'technician',
  'agency',
  'telNumber',
  'issiNumber',
  'type',
  'model',
  'comment',
]

const FAULT_SCALARS = ['position', 'issue', 'quantity', 'action', 'company', 'status']

const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]))

/** One entry as it travels: scalars plus its faults, and nothing local. */
export const wireEntry = (e) => ({
  ...pick(e, SCALARS),
  faults: (e.faults ?? []).map((f) => pick(f, FAULT_SCALARS)),
})

/**
 * How far the other machine's clock is from this one's, in milliseconds.
 *
 * Positive means the caller is ahead. Measured from a timestamp the caller
 * sends at the moment it sends it, so it includes the request's flight time —
 * which is the conservative direction: a slow link makes the skew look worse
 * and the sync more cautious, never less.
 */
export const skewOf = (theirNow, now = Date.now()) => {
  const t = Date.parse(String(theirNow ?? ''))
  return Number.isNaN(t) ? null : t - now
}

/**
 * Everything that has changed since `since`, for the branches a caller may see.
 *
 * `since` is exclusive of nothing — it is compared with >=, so an entry written
 * in the same millisecond as the last sync is sent again rather than missed.
 * Sending a row twice costs a comparison; missing one loses work.
 */
export async function pullChanges(prisma, { since, where = {} } = {}) {
  const after = since ? new Date(since) : null
  const timeFilter = after && !Number.isNaN(after.getTime()) ? { gte: after } : undefined

  const entries = await prisma.reportEntry.findMany({
    where: { ...where, ...(timeFilter ? { syncRev: timeFilter } : {}) },
    ...entryShape,
    orderBy: { syncRev: 'asc' },
  })
  const tombstones = await prisma.entryTombstone.findMany({
    where: { ...(timeFilter ? { deletedAt: timeFilter } : {}) },
    orderBy: { deletedAt: 'asc' },
  })
  return {
    // The server's clock, so the caller can both detect its own skew and know
    // what to pass as `since` next time — using its own clock for that would
    // skip or repeat rows by exactly the amount it is out.
    now: new Date().toISOString(),
    entries: entries.map(wireEntry),
    tombstones: tombstones.map((t) => ({ syncId: t.syncId, deletedAt: t.deletedAt, branch: t.branch, mode: t.mode })),
  }
}

/**
 * Apply a batch from the other machine, last-write-wins per entry.
 *
 * Returns a per-entry verdict rather than a count, so the caller can say what
 * actually happened — "12 sent, 9 applied, 3 already newer here" is a sentence
 * somebody can check, and "synced" is not.
 */
export async function applyChanges(prisma, { entries = [], tombstones = [] } = {}, { canWrite = () => true } = {}) {
  const applied = []
  const kept = []
  const refused = []
  const removed = []

  for (const t of tombstones) {
    const syncId = String(t?.syncId ?? '')
    if (!syncId) continue
    const existing = await prisma.reportEntry.findUnique({ where: { syncId }, select: { branch: true, syncRev: true } })
    if (existing && !canWrite(existing.branch)) {
      refused.push({ syncId, reason: 'branch' })
      continue
    }
    const at = new Date(t.deletedAt ?? Date.now())
    // A deletion loses to an edit made after it, exactly as an edit would. The
    // entry was deleted on one machine and then worked on again on the other;
    // the later act is the one that stands.
    if (existing && existing.syncRev > at) {
      kept.push({ syncId, reason: 'edited after it was deleted' })
      continue
    }
    if (existing) await prisma.reportEntry.delete({ where: { syncId } })
    await prisma.entryTombstone.upsert({
      where: { syncId },
      create: { syncId, branch: t.branch ?? '', mode: t.mode ?? 'report', deletedAt: at },
      update: { deletedAt: at },
    })
    removed.push(syncId)
  }

  for (const e of entries) {
    const syncId = String(e?.syncId ?? '')
    if (!syncId) continue
    const rev = new Date(e.syncRev ?? 0)
    if (Number.isNaN(rev.getTime())) {
      refused.push({ syncId, reason: 'unreadable syncRev' })
      continue
    }
    if (!canWrite(e.branch ?? '')) {
      refused.push({ syncId, reason: 'branch' })
      continue
    }

    // An entry deleted HERE after the incoming edit stays deleted: the
    // tombstone is the later act. Without this the entry comes back on every
    // sync from a machine that has not yet heard about the deletion.
    const grave = await prisma.entryTombstone.findUnique({ where: { syncId } })
    if (grave && grave.deletedAt >= rev) {
      kept.push({ syncId, reason: 'deleted here more recently' })
      continue
    }

    const existing = await prisma.reportEntry.findUnique({
      where: { syncId },
      select: { id: true, syncRev: true, branch: true },
    })
    if (existing && !canWrite(existing.branch)) {
      refused.push({ syncId, reason: 'branch' })
      continue
    }
    if (existing && existing.syncRev >= rev) {
      // Ours is the same or newer. Equal counts as ours on purpose: a re-sent
      // identical row must not churn the record or move its revision forward.
      kept.push({ syncId, reason: 'newer here' })
      continue
    }

    const data = {
      ...pick(e, SCALARS),
      reportDate: new Date(e.reportDate),
      syncRev: rev,
      faults: { create: (e.faults ?? []).map((f) => pick(f, FAULT_SCALARS)) },
    }
    if (existing) {
      // The whole document is replaced, faults and all. Merging fault by fault
      // would produce a device with half of one person's work and half of
      // another's, which is not a state anybody entered.
      await prisma.reportEntry.update({
        where: { syncId },
        data: { ...data, faults: { deleteMany: {}, create: data.faults.create } },
      })
    } else {
      // The entry arrives fresh, and it is re-keyed: `id` is this database's to
      // assign. syncId is what makes it the same entry as the one it came from.
      await prisma.reportEntry.create({ data })
      // An entry that comes back legitimately clears its own grave, or the
      // check above would delete it again on the next round.
      if (grave) await prisma.entryTombstone.delete({ where: { syncId } }).catch(() => {})
    }
    applied.push(syncId)
  }
  return { applied, kept, refused, removed }
}

/** Drop tombstones older than the window a copy is allowed to be away for. */
export async function pruneTombstones(prisma, days = TOMBSTONE_DAYS) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const { count } = await prisma.entryTombstone.deleteMany({ where: { deletedAt: { lt: cutoff } } })
  return count
}
