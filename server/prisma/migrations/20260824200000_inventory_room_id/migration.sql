-- The room within a store — the step between the store and the shelf, for a
-- branch whose stock is spread across more than one.

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "room_id" TEXT NOT NULL DEFAULT '';
