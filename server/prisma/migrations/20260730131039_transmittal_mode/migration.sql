-- AlterTable
ALTER TABLE "report_entries" ADD COLUMN     "comment" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "saved_reports" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'report',
ADD COLUMN     "received_by" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "transmitted_by" TEXT NOT NULL DEFAULT '';
