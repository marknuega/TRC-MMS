-- Per-branch document series: every (mode, branch) numbers its own REP-####/
-- TRANS-#### independently, instead of one global series across all branches.

-- 1) Drop the old global-unique on report_id (two branches may now share "REP-0001").
DROP INDEX IF EXISTS "saved_reports_report_id_key";

-- 2) Renumber existing snapshots so each branch has a clean 1..N series, ordered
--    by insertion (seq). report_id is rewritten to match the new number.
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "mode", "branch" ORDER BY "seq") AS rn
  FROM "saved_reports"
)
UPDATE "saved_reports" s
SET "doc_number" = ranked.rn,
    "report_id"  = CASE WHEN s."mode" = 'transmittal' THEN 'TRANS-' ELSE 'REP-' END
                   || LPAD(ranked.rn::text, 4, '0')
FROM ranked
WHERE ranked."id" = s."id";

-- 3) Enforce one number per (mode, branch).
CREATE UNIQUE INDEX "saved_reports_mode_branch_doc_number_key"
  ON "saved_reports"("mode", "branch", "doc_number");
