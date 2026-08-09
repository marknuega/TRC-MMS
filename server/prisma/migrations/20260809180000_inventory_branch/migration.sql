-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "branch" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "inventory_items_branch_idx" ON "inventory_items"("branch");

-- Backfill: all existing stock is Makkah (SKUs / stores are tagged "MAK").
UPDATE "inventory_items" SET "branch" = 'Makkah'
 WHERE UPPER("sku") LIKE '%MAK%' OR UPPER("store") LIKE '%MAK%';
