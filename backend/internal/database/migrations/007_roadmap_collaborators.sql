-- 007: colaboradores por roadmap. Permite que o dono (e quem tem can_share)
-- conceda edição/compartilhamento a outros usuários. Aditivo e idempotente:
-- não altera dados existentes.

CREATE TABLE IF NOT EXISTS roadmap_collaborators (
    roadmap_id  BIGINT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    can_edit    BOOLEAN NOT NULL DEFAULT true,
    can_share   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (roadmap_id, user_id)
);

CREATE INDEX IF NOT EXISTS roadmap_collaborators_user_idx
    ON roadmap_collaborators(user_id);
