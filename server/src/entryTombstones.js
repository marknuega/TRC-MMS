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

/**
 * Tombstone everything matching `where`, then let the caller delete it.
 *
 * Takes the caller's transaction rather than opening one, so an entry can never
 * be gone without its tombstone or a tombstone exist for an entry still here.
 */
export async function buryEntries(tx, where) {
  const doomed = await tx.reportEntry.findMany({ where, select: { syncId: true, branch: true, mode: true } })
  const deletedAt = new Date()
  for (const e of doomed) {
    await tx.entryTombstone.upsert({
      where: { syncId: e.syncId },
      create: { syncId: e.syncId, branch: e.branch, mode: e.mode, deletedAt },
      update: { deletedAt },
    })
  }
  return doomed.length
}
