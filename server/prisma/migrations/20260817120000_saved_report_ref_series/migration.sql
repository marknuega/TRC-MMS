-- A reference-only report gets its own REF-#### series, running alongside
-- REP-#### inside the same 'report' mode.
--
-- The series is its own column rather than being derived from is_reference_only
-- because that flag is TOGGLEABLE (see the PATCH route): a unique index over a
-- mutable column could be violated by a toggle, and, worse, a report's printed
-- number would change under whoever is holding the printout. The series is
-- decided once, when the number is minted, and never moves after that.

-- 1) Back-fill from mode. Reports already saved as reference-only KEEP their
--    REP number — renumbering saved records would break every reference to them
--    that already exists on paper.
ALTER TABLE "saved_reports" ADD COLUMN "series" TEXT NOT NULL DEFAULT 'REP';
UPDATE "saved_reports" SET "series" = 'TRANS' WHERE "mode" = 'transmittal';

-- 2) Number per SERIES, not per mode — REP and REF share mode='report' and must
--    not collide in the same counter.
DROP INDEX IF EXISTS "saved_reports_mode_branch_doc_number_key";
CREATE UNIQUE INDEX "saved_reports_series_branch_doc_number_key"
  ON "saved_reports"("series", "branch", "doc_number");
