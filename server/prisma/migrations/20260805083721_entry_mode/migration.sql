-- AlterTable
ALTER TABLE "report_entries" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'report';

-- CreateIndex
CREATE INDEX "report_entries_mode_idx" ON "report_entries"("mode");
