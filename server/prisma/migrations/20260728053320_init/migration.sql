-- CreateTable
CREATE TABLE "daily_reports" (
    "id" SERIAL NOT NULL,
    "report_date" DATE NOT NULL,
    "author" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "hours_worked" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_reports_report_date_idx" ON "daily_reports"("report_date");
