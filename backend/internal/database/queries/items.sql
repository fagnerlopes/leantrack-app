-- name: ListItems :many
SELECT id, title, status, start_date, end_date, progress, dependency_id,
       notes, ext_team, ext_description, ext_milestone, sort_order,
       created_at, updated_at
FROM roadmap_items
ORDER BY sort_order ASC, id ASC;

-- name: GetItem :one
SELECT id, title, status, start_date, end_date, progress, dependency_id,
       notes, ext_team, ext_description, ext_milestone, sort_order,
       created_at, updated_at
FROM roadmap_items
WHERE id = $1;

-- name: CreateItem :one
INSERT INTO roadmap_items (
    title, status, start_date, end_date, progress, dependency_id, notes,
    ext_team, ext_description, ext_milestone, sort_order
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING id, title, status, start_date, end_date, progress, dependency_id,
          notes, ext_team, ext_description, ext_milestone, sort_order,
          created_at, updated_at;

-- name: UpdateItem :one
UPDATE roadmap_items SET
    title = $2,
    status = $3,
    start_date = $4,
    end_date = $5,
    progress = $6,
    dependency_id = $7,
    notes = $8,
    ext_team = $9,
    ext_description = $10,
    ext_milestone = $11,
    sort_order = $12,
    updated_at = now()
WHERE id = $1
RETURNING id, title, status, start_date, end_date, progress, dependency_id,
          notes, ext_team, ext_description, ext_milestone, sort_order,
          created_at, updated_at;

-- name: DeleteItem :exec
DELETE FROM roadmap_items WHERE id = $1;

-- name: CountItems :one
SELECT COUNT(*) FROM roadmap_items;
