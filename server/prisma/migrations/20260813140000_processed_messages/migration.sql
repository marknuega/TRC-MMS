-- Webhook dedup for the WhatsApp integration, moved off the bot's Railway
-- volume into this app. Meta redelivers a message id after failures (observed
-- ~40 minutes later on 2026-08-08) and this service has no persistent disk, so
-- an in-memory guard would forget every id on each redeploy and let a retry
-- file a duplicate report.
--
-- The processed_at index serves the retention sweep, which deletes rows older
-- than the retention window; without it that sweep is a full scan.
CREATE TABLE IF NOT EXISTS "processed_messages" (
  "message_id"   TEXT         NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "processed_messages_pkey" PRIMARY KEY ("message_id")
);

CREATE INDEX IF NOT EXISTS "processed_messages_processed_at_idx"
  ON "processed_messages" ("processed_at");
