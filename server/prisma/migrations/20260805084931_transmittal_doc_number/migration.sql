-- AlterTable
ALTER TABLE "saved_reports" ADD COLUMN     "doc_number" INTEGER NOT NULL DEFAULT 0;

-- Backfill a per-mode series number (1,2,3… within report / transmittal) using
-- the existing global seq for order, then rewrite report_id to REP-#### /
-- TRANS-#### so each document type numbers independently.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY mode ORDER BY seq) AS rn
  FROM "saved_reports"
)
UPDATE "saved_reports" s
SET "doc_number" = r.rn
FROM ranked r
WHERE s.id = r.id;

UPDATE "saved_reports"
SET "report_id" = 'TRANS-' || LPAD("doc_number"::text, 4, '0')
WHERE mode = 'transmittal';

UPDATE "saved_reports"
SET "report_id" = 'REP-' || LPAD("doc_number"::text, 4, '0')
WHERE mode <> 'transmittal';
