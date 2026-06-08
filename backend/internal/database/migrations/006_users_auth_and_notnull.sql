-- 006: prepara `users` para autenticação desacoplada (SSO/Keycloak),
-- normaliza papéis legados, garante os admins fixos e torna
-- `roadmap_items.roadmap_id` obrigatório. Aditivo e idempotente.

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

-- 3) Garante os 3 admins fixos com papel admin. Sem senha local: o acesso
--    se dará por senha definida via seed (dev/preview) ou por SSO no futuro.
INSERT INTO users (email, name, role, auth_provider) VALUES
    ('fagner.lopes@kinghost.com.br',  'Fagner Lopes',   'admin', 'local'),
    ('marcus.januario@locaweb.com.br', 'Marcus Januário', 'admin', 'local'),
    ('eduarda.moraes@kinghost.com.br', 'Eduarda Moraes',  'admin', 'local')
ON CONFLICT (email) DO UPDATE SET role = 'admin';

-- 4) Garante que todo item tenha roadmap antes de exigir NOT NULL.
UPDATE roadmap_items
SET roadmap_id = (SELECT id FROM roadmaps WHERE slug = 'roadmap-squad-cloud-2026')
WHERE roadmap_id IS NULL
  AND EXISTS (SELECT 1 FROM roadmaps WHERE slug = 'roadmap-squad-cloud-2026');

-- 5) roadmap_id passa a ser obrigatório (backfill garantido em 005 e no passo 4).
ALTER TABLE roadmap_items ALTER COLUMN roadmap_id SET NOT NULL;
