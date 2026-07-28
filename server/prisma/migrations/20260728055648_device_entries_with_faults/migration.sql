/*
  Warnings:

  - You are about to drop the `daily_reports` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "daily_reports";

-- CreateTable
CREATE TABLE "report_entries" (
    "id" SERIAL NOT NULL,
    "report_date" DATE NOT NULL,
    "technician" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "tel_number" TEXT NOT NULL,
    "issi_number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faults" (
    "id" SERIAL NOT NULL,
    "entry_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "issue" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "action" TEXT NOT NULL,

    CONSTRAINT "faults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_entries_report_date_idx" ON "report_entries"("report_date");

-- CreateIndex
CREATE INDEX "faults_entry_id_idx" ON "faults"("entry_id");

-- AddForeignKey
ALTER TABLE "faults" ADD CONSTRAINT "faults_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "report_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
