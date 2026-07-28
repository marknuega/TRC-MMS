-- AlterTable
ALTER TABLE "faults" ADD COLUMN     "company" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "report_date" DATE NOT NULL,
    "seq" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_report_date_key" ON "reports"("report_date");

-- CreateIndex
CREATE UNIQUE INDEX "reports_seq_key" ON "reports"("seq");
