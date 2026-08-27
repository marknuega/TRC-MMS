-- Two-way entry sync: a stable cross-machine identity, a revision stamp, and
-- tombstones so a deletion can travel instead of being undone by the next push.

-- gen_random_uuid() is built in from PostgreSQL 13. Backfilled per row rather
-- than defaulted-then-filled so every existing entry gets a DISTINCT id — a
-- single default would give them all the same one and the unique index below
-- would refuse to build.
ALTER TABLE "report_entries" ADD COLUMN "sync_id" TEXT;
UPDATE "report_entries" SET "sync_id" = gen_random_uuid()::text WHERE "sync_id" IS NULL;
ALTER TABLE "report_entries" ALTER COLUMN "sync_id" SET NOT NULL;
CREATE UNIQUE INDEX "report_entries_sync_id_key" ON "report_entries"("sync_id");

-- Existing rows are stamped with the time they were last touched, not with now:
-- stamping them all with the moment of the migration would make every one of
-- them look newer than anything a desktop copy holds, and the first sync would
-- overwrite work that was genuinely more recent.
ALTER TABLE "report_entries" ADD COLUMN "sync_rev" TIMESTAMP(3);
UPDATE "report_entries" SET "sync_rev" = COALESCE("updated_at", "created_at", CURRENT_TIMESTAMP) WHERE "sync_rev" IS NULL;
ALTER TABLE "report_entries" ALTER COLUMN "sync_rev" SET NOT NULL;
ALTER TABLE "report_entries" ALTER COLUMN "sync_rev" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "entry_tombstones" (
    "sync_id" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'report',
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entry_tombstones_pkey" PRIMARY KEY ("sync_id")
);
CREATE INDEX "entry_tombstones_deleted_at_idx" ON "entry_tombstones"("deleted_at");
