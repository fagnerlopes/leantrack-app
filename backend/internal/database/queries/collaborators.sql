-- name: GetCollaborator :one
SELECT roadmap_id, user_id, can_edit, can_share
FROM roadmap_collaborators
WHERE roadmap_id = $1 AND user_id = $2;

-- name: ListCollaboratorsByRoadmap :many
SELECT c.roadmap_id, c.user_id, c.can_edit, c.can_share,
       u.name AS user_name, u.email AS user_email
FROM roadmap_collaborators c
JOIN users u ON u.id = c.user_id
WHERE c.roadmap_id = $1
ORDER BY u.name ASC;

-- name: ListMyCollaborations :many
SELECT roadmap_id, can_edit, can_share
FROM roadmap_collaborators
WHERE user_id = $1;

-- UpsertCollaborator cria ou atualiza o vínculo. Reconvidar atualiza permissões.
-- name: UpsertCollaborator :one
INSERT INTO roadmap_collaborators (roadmap_id, user_id, can_edit, can_share, created_by)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (roadmap_id, user_id) DO UPDATE
SET can_edit = EXCLUDED.can_edit, can_share = EXCLUDED.can_share
RETURNING roadmap_id, user_id, can_edit, can_share;

-- name: DeleteCollaborator :exec
DELETE FROM roadmap_collaborators WHERE roadmap_id = $1 AND user_id = $2;
