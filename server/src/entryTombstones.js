/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Recording that an entry was deleted, so the deletion can travel.
 *
 * One function, in a module of its own, because it has to be called from every
 * place an entry is removed and there are four of them: the single delete, the
 * bulk clear, the clear that SAVING a report performs, and the replace that
 * loading one performs. A copy of this in each would be four places to forget
 * it, and forgetting it is silent — the entry simply comes back on the next
 * sync, every sync, and nothing about that looks like a missing call.
 *
 * See ../entrySync.js for what a tombstone is for.
 */

import { nextSeq, syncOrigin } from './syncClock.js'

/**
 * Tombstone everything matching `where`, then let the caller delete it.
 *
 * Takes the caller's transaction rather than opening one, so an entry can never
 * be gone without its tombstone or a tombstone exist for an entry still here.
 *
 * A DELETION IS AN EDIT and carries the same kind of revision: the entry's own
 * syncRev plus one, stamped with this installation. That is what makes it
 * comparable with an edit made elsewhere — the higher number is the later act,
 * decided by exactly the rule that separates two edits. A tombstone that did
 * not advance the revision could not win against the version it deletes, and
 * the entry would come straight back.
 */
export async function buryEntries(tx, where) {
  const doomed = await tx.reportEntry.findMany({
    where,
    select: { syncId: true, branch: true, mode: true, syncRev: true },
  })
  if (!doomed.length) return 0

  const origin = syncOrigin()
  const deletedAt = new Date()
  // Taken once and advanced locally rather than re-read per row: a bulk clear
  // can be hundreds of entries, and each one asking the database for the next
  // number would be hundreds of round trips to produce a run of consecutive
  // integers we can count out ourselves.
  let seq = await nextSeq(tx)

  for (const e of doomed) {
    await tx.entryTombstone.upsert({
      where: { syncId: e.syncId },
      create: {
        syncId: e.syncId,
        branch: e.branch,
        mode: e.mode,
        syncRev: (e.syncRev ?? 0) + 1,
        syncOrigin: origin,
        changeSeq: seq,
        deletedAt,
      },
      update: {
        syncRev: (e.syncRev ?? 0) + 1,
        syncOrigin: origin,
        changeSeq: seq,
        deletedAt,
      },
    })
    seq += 1
  }
  return doomed.length
}
