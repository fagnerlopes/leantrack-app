-- name: GetUserByEmail :one
SELECT id, email, password_hash, name, role, must_change_password, created_at
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

-- CreateUser registra uma conta com senha definida pelo admin. Como essa senha
-- é temporária (o admin não conhecerá a senha definitiva do usuário), a conta
-- nasce marcada para troca obrigatória no primeiro acesso.
-- name: CreateUser :one
INSERT INTO users (email, password_hash, name, role, auth_provider, must_change_password)
VALUES ($1, $2, $3, $4, 'local', true)
RETURNING id, email, name, role, auth_provider, created_at;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: UpdateUserRole :one
UPDATE users SET role = $2 WHERE id = $1
RETURNING id, email, name, role, auth_provider, created_at;

-- name: CountAdmins :one
SELECT COUNT(*) FROM users WHERE role = 'admin';

-- SearchUsersForRoadmap alimenta o autocomplete do compartilhamento: busca por
-- e-mail OU nome, excluindo o dono e quem já é colaborador do roadmap.
-- O parâmetro @query já chega com os curingas LIKE escapados pelo handler.
-- name: SearchUsersForRoadmap :many
SELECT u.id, u.email, u.name
FROM users u
WHERE (u.email ILIKE '%' || @query || '%' OR u.name ILIKE '%' || @query || '%')
  AND u.id <> (SELECT r.owner_id FROM roadmaps r WHERE r.id = @roadmap_id)
  AND NOT EXISTS (
    SELECT 1 FROM roadmap_collaborators rc
    WHERE rc.roadmap_id = @roadmap_id AND rc.user_id = u.id
  )
ORDER BY u.name ASC
LIMIT 10;

-- UpdateOwnName altera o nome da própria conta do usuário logado.
-- name: UpdateOwnName :one
UPDATE users SET name = $2 WHERE id = $1
RETURNING id, email, name, role, auth_provider, created_at;

-- UpdateOwnPassword define um novo hash de senha para a própria conta e
-- desliga a obrigatoriedade de troca: ao escolher a senha, o usuário cumpriu a
-- exigência do primeiro acesso.
-- name: UpdateOwnPassword :exec
UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1;

-- ResetUserPassword (admin) define uma senha temporária para outro usuário e
-- marca a conta para troca obrigatória no próximo acesso. Não exige a senha
-- antiga — é a alternativa ao fluxo de "esqueci minha senha".
-- name: ResetUserPassword :exec
UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1;

-- name: CreateSession :exec
INSERT INTO sessions (token, user_id, expires_at)
VALUES ($1, $2, $3);

-- name: GetSession :one
SELECT s.token, s.user_id, s.expires_at, u.email, u.name, u.role, u.must_change_password
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token = $1 AND s.expires_at > now();

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token = $1;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at <= now();
