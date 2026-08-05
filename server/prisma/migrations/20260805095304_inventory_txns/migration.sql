-- CreateTable
CREATE TABLE "inventory_txns" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'usage',
    "change" INTEGER NOT NULL DEFAULT 0,
    "avail_after" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT NOT NULL DEFAULT '',
    "branch" TEXT NOT NULL DEFAULT '',
    "material" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_txns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_txns_item_id_idx" ON "inventory_txns"("item_id");

-- AddForeignKey
ALTER TABLE "inventory_txns" ADD CONSTRAINT "inventory_txns_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
