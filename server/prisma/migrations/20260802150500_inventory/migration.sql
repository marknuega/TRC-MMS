-- CreateTable
CREATE TABLE "inventory_items" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "store" TEXT NOT NULL DEFAULT '',
    "shelf" TEXT NOT NULL DEFAULT '',
    "item_code" TEXT NOT NULL DEFAULT '',
    "begin" INTEGER NOT NULL DEFAULT 0,
    "out" INTEGER NOT NULL DEFAULT 0,
    "low_stock" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");

-- CreateIndex
CREATE INDEX "inventory_items_store_idx" ON "inventory_items"("store");
