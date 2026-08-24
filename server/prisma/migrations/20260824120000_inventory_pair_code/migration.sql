-- The Model+Parts pair code: [device letter][parts][variant] (C45A), or the
-- provisional [device letter]:[item name] while the part has no parts code.
-- See client/src/pairCode.js for the format and why the letter is the identity.

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "pair_code" TEXT NOT NULL DEFAULT '';
-- The provisional code an item was held by before its name was given a parts
-- code. Kept for good: documents already printed and issued carry the old form
-- and must stay traceable to the same shelf.
ALTER TABLE "inventory_items" ADD COLUMN     "former_pair_code" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "inventory_txns" ADD COLUMN     "pair_code" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "inventory_items_pair_code_idx" ON "inventory_items"("pair_code");

-- No backfill and no unique constraint. Every existing row keeps a blank pair
-- code, which is what makes it a SHARED item matched by name exactly as before
-- — most of the store genuinely is shared, and a wrong guess here would move
-- stock. Uniqueness is enforced per branch in the API (routes/inventory.js)
-- rather than by an index, because '' is not NULL and would collide on every
-- untagged row.
