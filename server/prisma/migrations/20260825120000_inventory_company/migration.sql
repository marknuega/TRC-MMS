-- The company that owns a shelf, read out of the SKU prefix it was already
-- written in (MOT-MAK-1114-2 -> MOT). See client/src/company.js.
--
-- '' means shared stock, which is what every unprefixed row already was. The
-- backfill is deliberately narrow: a first segment is only taken as a company
-- when it is 1-6 alphanumerics AND contains a letter, so a legacy SKU like
-- 1114-2 stays shared instead of inventing the company "1114".

ALTER TABLE "inventory_items" ADD COLUMN "company" TEXT NOT NULL DEFAULT '';
ALTER TABLE "inventory_txns" ADD COLUMN "company" TEXT NOT NULL DEFAULT '';

UPDATE "inventory_items"
   SET "company" = upper(split_part("sku", '-', 1))
 WHERE position('-' in "sku") > 1
   AND upper(split_part("sku", '-', 1)) ~ '^[A-Z0-9]{1,6}$'
   AND upper(split_part("sku", '-', 1)) ~ '[A-Z]';

-- The ledger keeps the company its item had at the time, so a past movement
-- still reads against the right shelf if the item is ever re-prefixed.
UPDATE "inventory_txns" t
   SET "company" = i."company"
  FROM "inventory_items" i
 WHERE t."item_id" = i."id";

-- Model Code uniqueness is checked per branch AND company now, so this is the
-- shape the check reads by.
CREATE INDEX "inventory_items_company_idx" ON "inventory_items"("company");
CREATE INDEX "inventory_items_branch_company_idx" ON "inventory_items"("branch", "company");
