-- The short name an item is written by on a report — "Battery 3180" for
-- "BLN-11 BATTERY 3180 MAH". A fault matches on either name, so an entry can
-- carry the words a technician actually uses while the stock keeps the name on
-- the box.

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "alias" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "inventory_items_alias_idx" ON "inventory_items"("alias");

-- No backfill: every existing item keeps a blank alias, which means it answers
-- to its listing name alone, exactly as it did before this column existed.
