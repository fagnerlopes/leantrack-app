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
