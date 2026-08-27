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
 * WHO WINS. The higher syncRev — a COUNTER, bumped by one on every edit made
 * on the machine that made it, never a wall clock. Ties go to the higher
 * syncOrigin, so both machines reach the same verdict independently. Both
 * rules live in compareRev, in syncClock.js.
 *
 * This used to be last-write-wins on timestamps, and the change is worth
 * stating plainly: NOTHING HERE READS A CLOCK TO DECIDE A WINNER any more. A
 * machine whose clock is wrong now syncs correctly rather than being refused,
 * because its clock was never the thing that mattered — only the order of its
 * own edits, which it can count without help. The only remaining use of wall
 * time is pruning tombstones by age, which is a question about elapsed time
 * and not about who is right.
 *
 * WHAT A COUNTER MEANS, since it is not the promise a timestamp made. The
 * winner is the version with more edits behind it in its own lineage, not the
 * one made most recently. A machine that goes away, edits an entry five times
 * and comes back beats a machine that edited the same entry once yesterday.
 * That is the intended reading: that machine did more work on the entry.
 *
 * AN ENTRY IS ONE DOCUMENT. The winner's faults replace the loser's outright
 * rather than being merged fault by fault, because a half-and-half list of
 * faults is a device nobody worked on.
 */

import { compareRev, nextSeq, syncOrigin } from './syncClock.js'

// How long a deletion has to keep being announced. A machine that syncs less
// often than this and then pushes would resurrect an entry deleted while it was
// away, so this is the real ceiling on "how long a copy may stay offline".
export const TOMBSTONE_DAYS = 90

export const entryShape = {
  include: { faults: { orderBy: { position: 'asc' } } },
}

/*
 * The fields an entry carries across.
 *
 * changeSeq is deliberately NOT here. It describes a position in the SENDING
 * database's write order and means nothing in the receiving one, which stamps
 * its own. Carrying it across would corrupt the receiver's paging for every
 * later puller.
 */
const SCALARS = [
  'syncId',
  'syncRev',
  'syncOrigin',
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

/** A revision number that can actually be compared, or null if it cannot. */
const readRev = (value) => {
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

/** The highest change-sequence number this database has issued. */
export async function currentSeq(prisma) {
  const [entries, tombs] = await Promise.all([
    prisma.reportEntry.aggregate({ _max: { changeSeq: true } }),
    prisma.entryTombstone.aggregate({ _max: { changeSeq: true } }),
  ])
  return Math.max(entries._max.changeSeq ?? 0, tombs._max.changeSeq ?? 0)
}

/**
 * Everything written since `since`, for the branches a caller may see.
 *
 * `since` is a changeSeq from THIS database, handed out by a previous pull —
 * never the caller's own number, which counts a different database's writes and
 * would skip or repeat by however far the two have diverged.
 *
 * Compared with `>=`, not `>`, and the returned mark is the highest sequence in
 * use rather than one past it. Both together are what make a race harmless: two
 * writers can be issued the same number, and only one of them may have landed
 * when the mark was read. Re-sending the boundary row on the next pull costs a
 * comparison; excluding it would silently lose the row that came second.
 */
export async function pullChanges(prisma, { since, where = {} } = {}) {
  const after = readRev(since)
  const seqFilter = after === null ? undefined : { gte: after }

  const entries = await prisma.reportEntry.findMany({
    where: { ...where, ...(seqFilter ? { changeSeq: seqFilter } : {}) },
    ...entryShape,
    orderBy: { changeSeq: 'asc' },
  })
  const tombstones = await prisma.entryTombstone.findMany({
    where: { ...(seqFilter ? { changeSeq: seqFilter } : {}) },
    orderBy: { changeSeq: 'asc' },
  })
  return {
    // What the caller passes as `since` next time.
    seq: await currentSeq(prisma),
    entries: entries.map(wireEntry),
    tombstones: tombstones.map((t) => ({
      syncId: t.syncId,
      syncRev: t.syncRev,
      syncOrigin: t.syncOrigin,
      branch: t.branch,
      mode: t.mode,
    })),
  }
}

/**
 * Apply a batch from the other machine — higher revision wins, per entry.
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
    const rev = readRev(t.syncRev)
    if (rev === null) {
      refused.push({ syncId, reason: 'unreadable syncRev' })
      continue
    }
    const origin = String(t.syncOrigin ?? '')

    const existing = await prisma.reportEntry.findUnique({
      where: { syncId },
      select: { branch: true, syncRev: true, syncOrigin: true },
    })
    if (existing && !canWrite(existing.branch)) {
      refused.push({ syncId, reason: 'branch' })
      continue
    }
    // A deletion loses to an edit made after it, exactly as an edit would. The
    // entry was deleted on one machine and then worked on again on the other;
    // the higher revision is the later act, and it stands.
    if (existing && compareRev(existing.syncRev, existing.syncOrigin, rev, origin) > 0) {
      kept.push({ syncId, reason: 'edited after it was deleted' })
      continue
    }

    // A grave already held at the same or a higher revision is the later word
    // on this entry; an older repeat of the same deletion must not move it
    // backwards. The row still goes, if somehow it is still here.
    const grave = await prisma.entryTombstone.findUnique({ where: { syncId } })
    if (grave && compareRev(grave.syncRev, grave.syncOrigin, rev, origin) >= 0) {
      if (existing) {
        await prisma.reportEntry.delete({ where: { syncId } })
        removed.push(syncId)
      } else {
        kept.push({ syncId, reason: 'already deleted here' })
      }
      continue
    }

    if (existing) await prisma.reportEntry.delete({ where: { syncId } })
    const seq = await nextSeq(prisma)
    const deletedAt = new Date()
    await prisma.entryTombstone.upsert({
      where: { syncId },
      create: {
        syncId,
        branch: t.branch ?? '',
        mode: t.mode ?? 'report',
        syncRev: rev,
        syncOrigin: origin,
        changeSeq: seq,
        deletedAt,
      },
      update: { syncRev: rev, syncOrigin: origin, changeSeq: seq, deletedAt },
    })
    removed.push(syncId)
  }

  for (const e of entries) {
    const syncId = String(e?.syncId ?? '')
    if (!syncId) continue
    const rev = readRev(e.syncRev)
    if (rev === null) {
      refused.push({ syncId, reason: 'unreadable syncRev' })
      continue
    }
    const origin = String(e.syncOrigin ?? '')
    if (!canWrite(e.branch ?? '')) {
      refused.push({ syncId, reason: 'branch' })
      continue
    }

    // An entry deleted HERE at the same or a higher revision stays deleted: the
    // tombstone is the later act. Without this the entry comes back on every
    // sync from a machine that has not yet heard about the deletion.
    const grave = await prisma.entryTombstone.findUnique({ where: { syncId } })
    if (grave && compareRev(grave.syncRev, grave.syncOrigin, rev, origin) >= 0) {
      kept.push({ syncId, reason: 'deleted here more recently' })
      continue
    }

    const existing = await prisma.reportEntry.findUnique({
      where: { syncId },
      select: { id: true, syncRev: true, syncOrigin: true, branch: true },
    })
    if (existing && !canWrite(existing.branch)) {
      refused.push({ syncId, reason: 'branch' })
      continue
    }
    if (existing && compareRev(existing.syncRev, existing.syncOrigin, rev, origin) >= 0) {
      // Ours is the same or higher. Equal-and-same-origin counts as ours on
      // purpose: a re-sent identical row must not churn the record or move its
      // revision forward.
      kept.push({ syncId, reason: 'newer here' })
      continue
    }

    const data = {
      ...pick(e, SCALARS),
      reportDate: new Date(e.reportDate),
      // The incoming revision travels verbatim. Re-stamping it with a local
      // number would make this machine claim authorship of somebody else's
      // edit, and the two ends would then disagree about what happened.
      syncRev: rev,
      syncOrigin: origin,
      // The sequence, by contrast, is this database's own: it says where this
      // write sits in OUR write order, which is what our next puller reads.
      changeSeq: await nextSeq(prisma),
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

/**
 * Drop tombstones older than the window a copy is allowed to be away for.
 *
 * The one place wall time is still consulted, and legitimately so: this asks
 * how long ago something happened, not which of two things happened later.
 */
export async function pruneTombstones(prisma, days = TOMBSTONE_DAYS) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const { count } = await prisma.entryTombstone.deleteMany({ where: { deletedAt: { lt: cutoff } } })
  return count
}

export { compareRev, nextSeq, syncOrigin }
