-- name: ListItemsByRoadmap :many
SELECT id, title, status, start_date, end_date, progress, dependency_id,
       notes, ext_team, ext_description, ext_milestone, sort_order, color,
       epic_url, created_at, updated_at
FROM roadmap_items
WHERE roadmap_id = $1
ORDER BY sort_order ASC, id ASC;

-- name: CreateItem :one
INSERT INTO roadmap_items (
    roadmap_id, title, status, start_date, end_date, progress, dependency_id,
    notes, ext_team, ext_description, ext_milestone, sort_order, color, epic_url
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING id, title, status, start_date, end_date, progress, dependency_id,
          notes, ext_team, ext_description, ext_milestone, sort_order, color,
          epic_url, created_at, updated_at;

-- name: UpdateItem :one
UPDATE roadmap_items SET
    title = $3,
    status = $4,
    start_date = $5,
    end_date = $6,
    progress = $7,
    dependency_id = $8,
    notes = $9,
    ext_team = $10,
    ext_description = $11,
    ext_milestone = $12,
    sort_order = $13,
    color = $14,
    epic_url = $15,
    updated_at = now()
WHERE id = $1 AND roadmap_id = $2
RETURNING id, title, status, start_date, end_date, progress, dependency_id,
          notes, ext_team, ext_description, ext_milestone, sort_order, color,
          epic_url, created_at, updated_at;

-- name: UpdateSortOrder :exec
UPDATE roadmap_items SET sort_order = $3, updated_at = now()
WHERE id = $1 AND roadmap_id = $2;

-- name: DeleteItem :exec
DELETE FROM roadmap_items WHERE id = $1 AND roadmap_id = $2;

-- name: CountItems :one
SELECT COUNT(*) FROM roadmap_items;

-- name: CountItemsByRoadmap :one
SELECT COUNT(*) FROM roadmap_items WHERE roadmap_id = $1;
