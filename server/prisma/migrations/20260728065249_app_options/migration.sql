-- CreateTable
CREATE TABLE "app_options" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_options_pkey" PRIMARY KEY ("id")
);
