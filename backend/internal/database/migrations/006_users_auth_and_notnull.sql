-- 006: prepara `users` para autenticação desacoplada (SSO/Keycloak),
-- normaliza papéis legados e torna `roadmap_items.roadmap_id` obrigatório.
-- Aditivo e idempotente. Contém apenas esquema: a criação de contas é
-- responsabilidade do pacote `internal/database/seed`.

-- 1) users: senha local passa a ser opcional (usuários SSO não terão senha)
--    e ganham colunas de provedor de identidade.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Identidade externa única por provedor (só quando preenchida).
CREATE UNIQUE INDEX IF NOT EXISTS users_provider_external_unique
    ON users (auth_provider, external_id)
    WHERE external_id IS NOT NULL;

-- 2) Normaliza papéis legados ('viewer' -> 'user') e ajusta o default.
UPDATE users SET role = 'user' WHERE role = 'viewer';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';

-- 3) roadmap_id passa a ser obrigatório. Num banco novo a tabela está vazia,
--    então a restrição é aplicada sem necessidade de backfill.
ALTER TABLE roadmap_items ALTER COLUMN roadmap_id SET NOT NULL;
