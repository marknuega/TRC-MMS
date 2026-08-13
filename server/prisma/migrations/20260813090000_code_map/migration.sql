-- Home for the CDS code map, moved off the WhatsApp bridge into this app.
-- Single row (id=1) holding the whole map as JSON, matching the app_options
-- pattern: it is read, edited and published as one document.
CREATE TABLE IF NOT EXISTS "code_map" (
  "id"         INTEGER      NOT NULL DEFAULT 1,
  "data"       JSONB        NOT NULL DEFAULT '{}',
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "code_map_pkey" PRIMARY KEY ("id")
);
