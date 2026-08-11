-- name: ListRoadmaps :many
SELECT r.id, r.owner_id, r.name, r.slug, r.description, r.created_at, r.updated_at,
       u.name AS owner_name,
       (SELECT COUNT(*) FROM roadmap_items i WHERE i.roadmap_id = r.id) AS item_count
FROM roadmaps r
JOIN users u ON u.id = r.owner_id
ORDER BY r.name ASC;

-- name: ListMyRoadmaps :many
SELECT r.id, r.owner_id, r.name, r.slug, r.description, r.created_at, r.updated_at,
       u.name AS owner_name,
       (SELECT COUNT(*) FROM roadmap_items i WHERE i.roadmap_id = r.id) AS item_count
FROM roadmaps r
JOIN users u ON u.id = r.owner_id
WHERE r.owner_id = $1
ORDER BY r.name ASC;

-- name: GetRoadmapByID :one
SELECT id, owner_id, name, slug, description, created_at, updated_at
FROM roadmaps
WHERE id = $1;

-- name: GetRoadmapBySlug :one
SELECT id, owner_id, name, slug, description, created_at, updated_at
FROM roadmaps
WHERE slug = $1;

-- name: CreateRoadmap :one
INSERT INTO roadmaps (owner_id, name, slug, description)
VALUES ($1, $2, $3, $4)
RETURNING id, owner_id, name, slug, description, created_at, updated_at;

-- name: UpdateRoadmap :one
UPDATE roadmaps
SET name = $2, slug = $3, description = $4, updated_at = now()
WHERE id = $1
RETURNING id, owner_id, name, slug, description, created_at, updated_at;

-- name: DeleteRoadmap :exec
DELETE FROM roadmaps WHERE id = $1;

-- AdminListRoadmaps alimenta o painel do admin: todos os roadmaps com o dono
-- (nome e e-mail, para identificar contas de quem saiu) e as contagens de
-- iniciativas e colaboradores.
-- name: AdminListRoadmaps :many
SELECT r.id, r.owner_id, r.name, r.slug, r.description, r.created_at, r.updated_at,
       u.name AS owner_name, u.email AS owner_email,
       (SELECT COUNT(*) FROM roadmap_items i WHERE i.roadmap_id = r.id) AS item_count,
       (SELECT COUNT(*) FROM roadmap_collaborators c WHERE c.roadmap_id = r.id) AS collaborator_count
FROM roadmaps r
JOIN users u ON u.id = r.owner_id
ORDER BY u.name ASC, r.name ASC;

-- CountRoadmapsByOwnerAndName antecipa a restrição UNIQUE (owner_id, name):
-- permite recusar a transferência com uma mensagem clara antes de tentar o
-- UPDATE (que abortaria a transação em curso).
-- name: CountRoadmapsByOwnerAndName :one
SELECT COUNT(*) FROM roadmaps WHERE owner_id = $1 AND name = $2;

-- TransferRoadmapOwner troca o dono do roadmap. Só o admin chama; a restrição
-- UNIQUE (owner_id, name) pode barrar se o novo dono já tiver roadmap homônimo.
-- name: TransferRoadmapOwner :one
UPDATE roadmaps
SET owner_id = $2, updated_at = now()
WHERE id = $1
RETURNING id, owner_id, name, slug, description, created_at, updated_at;

-- name: ListSharedRoadmaps :many
SELECT r.id, r.owner_id, r.name, r.slug, r.description, r.created_at, r.updated_at,
       u.name AS owner_name,
       (SELECT COUNT(*) FROM roadmap_items i WHERE i.roadmap_id = r.id) AS item_count,
       c.can_edit, c.can_share
FROM roadmap_collaborators c
JOIN roadmaps r ON r.id = c.roadmap_id
JOIN users u    ON u.id = r.owner_id
WHERE c.user_id = $1
ORDER BY r.name ASC;
