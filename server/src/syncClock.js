/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The two numbers two-way entry sync runs on — and neither of them is a clock.
 *
 * This module exists because the sync used to order edits by wall time, and a
 * wall clock is the one input here nobody can vouch for. A desktop an hour
 * fast won every conflict it was in, including the ones it should have lost,
 * and the result looked entirely ordinary afterwards. The guard that caught it
 * could only ever turn that into a refusal; it could not make the ordering
 * right. So the ordering no longer asks a clock anything.
 *
 * TWO NUMBERS, TWO JOBS. They are easy to confuse and they are not the same.
 *
 *   syncRev    versions ONE ENTRY. Bumped by one on every edit made here.
 *              Higher wins. This is the conflict rule.
 *
 *   changeSeq  orders WRITES ACROSS ALL ENTRIES in THIS database, so a puller
 *              can ask "everything since X". syncRev cannot do this job: entry
 *              A at rev 5 and entry B at rev 2 say nothing about which was
 *              written first, because their counters are unrelated.
 *
 * A machine therefore remembers TWO marks per peer — how far it has read of
 * the other's sequence, and how far it has pushed of its own. See desktop/sync.js.
 */

/**
 * Which installation this database is.
 *
 * Only ever read to break a tie, and it needs to be nothing more than stable
 * and distinct. The live server answers to 'live'; the desktop passes its own
 * per-install id in through the environment, exactly as it passes DATABASE_URL,
 * so the same server code runs in both places without a branch.
 */
export const syncOrigin = () => process.env.SYNC_ORIGIN || 'live'

/**
 * Which of two revisions is later, without consulting a clock.
 *
 * Returns > 0 if A is later, < 0 if B is later, 0 only when they are the same
 * revision from the same machine — the one case where there is nothing to
 * choose between and nothing to do.
 *
 * THE TIE is the case a counter has and a timestamp does not: two machines
 * both holding rev 3, both editing while apart, both now at rev 4 with
 * different content. The counter cannot separate them, so the origin does, as
 * text, higher wins. The choice of winner is arbitrary; that both machines
 * make the SAME arbitrary choice is not, and is the whole point. If they broke
 * the tie differently they would each keep their own version and stay split
 * forever, syncing cleanly every time and never converging.
 *
 * One consequence worth knowing rather than discovering: 'live' sorts above
 * any hex install id, so on a genuine tie the live server's version is the one
 * that stands. That is the right way round — it is the copy more people can see.
 */
export function compareRev(revA, originA, revB, originB) {
  const a = Number(revA ?? 0)
  const b = Number(revB ?? 0)
  if (a !== b) return a - b
  const oa = String(originA ?? '')
  const ob = String(originB ?? '')
  return oa === ob ? 0 : oa > ob ? 1 : -1
}

/**
 * The next change-sequence number for this database.
 *
 * Taken as one past the highest in use across BOTH tables, because entries and
 * tombstones share a single sequence — a puller carries one mark, and two
 * independent counters would interleave in a way that mark could not express.
 *
 * Two writers racing can land on the same number. That is deliberately fine
 * here and cannot lose a row: the pull filter is `>=`, so a repeated number is
 * re-sent rather than skipped, and nothing is ever issued BELOW a number
 * already handed out. Sending a row twice costs a comparison. Missing one
 * costs somebody's work.
 *
 * Takes the caller's transaction so the number and the write it stamps land
 * together.
 */
export async function nextSeq(tx) {
  const [entries, tombs] = await Promise.all([
    tx.reportEntry.aggregate({ _max: { changeSeq: true } }),
    tx.entryTombstone.aggregate({ _max: { changeSeq: true } }),
  ])
  return Math.max(entries._max.changeSeq ?? 0, tombs._max.changeSeq ?? 0) + 1
}
