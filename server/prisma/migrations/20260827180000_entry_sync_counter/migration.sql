-- Entry sync ordering moves from wall-clock timestamps to a counter.
--
-- sync_rev stops meaning "when the owning machine last edited this" and starts
-- meaning "how many edits this entry has behind it". Nothing in the sync reads
-- a clock to pick a winner any more.
--
-- THE CONVERSION PRESERVES ORDER rather than resetting every row to 1, and that
-- is the whole reason it is written this way. Every desktop copy out there runs
-- the same conversion, on its own copy of the same underlying timestamps, so
-- the first sync after the cutover resolves each shared entry exactly as it
-- would have before. Flattening both sides to 1 instead would tie every entry
-- in the table at once and hand each one to whichever origin sorts higher —
-- silently, and across the whole working set.
--
-- Seconds since 2023-11-14 (epoch 1700000000), floored, minimum 1. Seconds are
-- finer than anybody edits one entry twice within, and subtracting a recent
-- epoch keeps the numbers small: an integer column then has decades of headroom
-- rather than sitting just under the 2038 boundary.

ALTER TABLE "report_entries" ADD COLUMN "sync_origin" TEXT NOT NULL DEFAULT '';
ALTER TABLE "report_entries" ADD COLUMN "change_seq" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "report_entries" ALTER COLUMN "sync_rev" DROP DEFAULT;
ALTER TABLE "report_entries"
  ALTER COLUMN "sync_rev" TYPE INTEGER
  USING GREATEST(1, (FLOOR(EXTRACT(EPOCH FROM "sync_rev"))::bigint - 1700000000))::integer;
ALTER TABLE "report_entries" ALTER COLUMN "sync_rev" SET DEFAULT 1;

-- Everything already in this database is this installation's own work.
UPDATE "report_entries" SET "sync_origin" = 'live' WHERE "sync_origin" = '';

-- Tombstones get the same treatment, their revision derived from the moment of
-- deletion. deleted_at stays, but only to prune by age from here on — never to
-- decide which of two things happened later.
ALTER TABLE "entry_tombstones" ADD COLUMN "sync_origin" TEXT NOT NULL DEFAULT '';
ALTER TABLE "entry_tombstones" ADD COLUMN "change_seq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "entry_tombstones" ADD COLUMN "sync_rev" INTEGER NOT NULL DEFAULT 1;

UPDATE "entry_tombstones"
   SET "sync_rev" = GREATEST(1, (FLOOR(EXTRACT(EPOCH FROM "deleted_at"))::bigint - 1700000000))::integer,
       "sync_origin" = 'live';

-- change_seq is ONE sequence shared by both tables, so a puller carries a single
-- mark. Two independent counters would interleave in a way one number could not
-- express, and a pull would skip whichever table had run ahead.
--
-- Entries take 1..N in their existing revision order; tombstones continue from
-- there. Every later write takes MAX+1 across both tables.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "sync_rev" ASC, "id" ASC) AS n
    FROM "report_entries"
)
UPDATE "report_entries" e
   SET "change_seq" = o.n
  FROM ordered o
 WHERE e."id" = o."id";

WITH base AS (
  SELECT COALESCE(MAX("change_seq"), 0) AS n FROM "report_entries"
), ordered AS (
  SELECT "sync_id", ROW_NUMBER() OVER (ORDER BY "deleted_at" ASC, "sync_id" ASC) AS n
    FROM "entry_tombstones"
)
UPDATE "entry_tombstones" t
   SET "change_seq" = base.n + o.n
  FROM ordered o, base
 WHERE t."sync_id" = o."sync_id";

CREATE INDEX "report_entries_change_seq_idx" ON "report_entries"("change_seq");
CREATE INDEX "entry_tombstones_change_seq_idx" ON "entry_tombstones"("change_seq");
