-- CreateTable
CREATE TABLE "saved_reports" (
    "id" SERIAL NOT NULL,
    "seq" INTEGER NOT NULL,
    "report_id" TEXT NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_label" TEXT NOT NULL DEFAULT '',
    "entry_count" INTEGER NOT NULL DEFAULT 0,
    "entries" JSONB NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_reports_seq_key" ON "saved_reports"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "saved_reports_report_id_key" ON "saved_reports"("report_id");
