-- AlterTable
ALTER TABLE "report_entries" ADD COLUMN     "branch" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "report_entries_branch_idx" ON "report_entries"("branch");
