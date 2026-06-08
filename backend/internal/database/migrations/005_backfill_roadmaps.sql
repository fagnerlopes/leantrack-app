-- 005: garante a dona do roadmap atual, cria o roadmap institucional e
-- move todos os itens existentes para ele. Idempotente.

-- 1) Garante a usuária Eduarda (dona). Senha vazia => sem login até ser definida.
INSERT INTO users (email, password_hash, name, role)
VALUES ('eduarda.moraes@kinghost.com.br', '', 'Eduarda Moraes', 'admin')
ON CONFLICT (email) DO NOTHING;

-- 2) Cria o roadmap institucional atual, dono = Eduarda.
INSERT INTO roadmaps (owner_id, name, slug, description)
SELECT u.id, 'Roadmap Squad Cloud 2026', 'roadmap-squad-cloud-2026', ''
FROM users u
WHERE u.email = 'eduarda.moraes@kinghost.com.br'
ON CONFLICT (owner_id, name) DO NOTHING;

-- 3) Move todos os itens ainda sem roadmap para esse roadmap.
UPDATE roadmap_items
SET roadmap_id = (SELECT id FROM roadmaps WHERE slug = 'roadmap-squad-cloud-2026')
WHERE roadmap_id IS NULL;
