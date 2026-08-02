-- CreateTable
CREATE TABLE "monthly_sheets" (
    "id" SERIAL NOT NULL,
    "month_key" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_sheets_month_key_branch_key" ON "monthly_sheets"("month_key", "branch");
