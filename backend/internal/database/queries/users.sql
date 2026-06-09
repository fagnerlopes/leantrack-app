-- name: GetUserByEmail :one
SELECT id, email, password_hash, name, role, created_at
FROM users
WHERE email = $1;

-- name: GetUserByID :one
SELECT id, email, password_hash, name, role, created_at
FROM users
WHERE id = $1;

-- name: UpsertSeedUser :exec
INSERT INTO users (email, password_hash, name, role)
VALUES ($1, $2, $3, $4)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    role = EXCLUDED.role;

-- SetInitialAdminPasswords define uma senha inicial para admins que ainda não
-- têm senha local utilizável (NULL ou string vazia — ex.: os admins fixos das
-- migrações 005/006, prontos para SSO). Idempotente: nunca sobrescreve um hash
-- bcrypt já definido.
-- name: SetInitialAdminPasswords :exec
UPDATE users
SET password_hash = $1
WHERE role = 'admin' AND (password_hash IS NULL OR password_hash = '');

-- name: ListUsers :many
SELECT id, email, name, role, auth_provider, created_at
FROM users
ORDER BY name ASC;

-- name: CreateUser :one
INSERT INTO users (email, password_hash, name, role, auth_provider)
VALUES ($1, $2, $3, $4, 'local')
RETURNING id, email, name, role, auth_provider, created_at;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: UpdateUserRole :one
UPDATE users SET role = $2 WHERE id = $1
RETURNING id, email, name, role, auth_provider, created_at;

-- name: CountAdmins :one
SELECT COUNT(*) FROM users WHERE role = 'admin';

-- UpdateOwnName altera o nome da própria conta do usuário logado.
-- name: UpdateOwnName :one
UPDATE users SET name = $2 WHERE id = $1
RETURNING id, email, name, role, auth_provider, created_at;

-- UpdateOwnPassword define um novo hash de senha para a própria conta.
-- name: UpdateOwnPassword :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- name: CreateSession :exec
INSERT INTO sessions (token, user_id, expires_at)
VALUES ($1, $2, $3);

-- name: GetSession :one
SELECT s.token, s.user_id, s.expires_at, u.email, u.name, u.role
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token = $1 AND s.expires_at > now();

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token = $1;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at <= now();
