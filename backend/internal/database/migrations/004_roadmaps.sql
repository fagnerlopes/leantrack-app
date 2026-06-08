-- 004: introduz roadmaps e vincula itens a um roadmap.
-- Aditivo e idempotente. roadmap_id é anulável nesta fase (backfill em 005).

CREATE TABLE IF NOT EXISTS roadmaps (
    id          BIGSERIAL PRIMARY KEY,
    owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT   NOT NULL,
    slug        TEXT   NOT NULL,
    description TEXT   NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT roadmaps_owner_name_unique UNIQUE (owner_id, name)
);

CREATE INDEX IF NOT EXISTS roadmaps_owner_idx ON roadmaps(owner_id);

ALTER TABLE roadmap_items
    ADD COLUMN IF NOT EXISTS roadmap_id BIGINT REFERENCES roadmaps(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS roadmap_items_roadmap_idx ON roadmap_items(roadmap_id);
