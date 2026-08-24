-- What the item is, in words. Descriptive only: nothing matches on it, so it
-- can be written for whoever reads the listing rather than for the resolver.

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '';
