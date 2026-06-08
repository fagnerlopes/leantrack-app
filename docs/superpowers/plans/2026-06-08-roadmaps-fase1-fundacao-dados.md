# Roadmaps por usuário — Fase 1: Fundação de dados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir a tabela `roadmaps` e vincular cada item a um roadmap, migrando os dados atuais para o "Roadmap Squad Cloud 2026" (dono: Eduarda), sem alterar o comportamento visível da aplicação.

**Architecture:** Mudança puramente aditiva no esquema do banco. Cria-se `roadmaps` e uma coluna `roadmap_id` (inicialmente anulável) em `roadmap_items`. Uma migração de dados move os itens existentes para um roadmap institucional pertencente à Eduarda. Os endpoints e o frontend **não mudam** nesta fase — a troca para rotas por roadmap acontece nas Fases 2 e 3. Assim a aplicação continua verde e funcional após cada commit.

**Tech Stack:** Go 1.23, `net/http` ServeMux, pgx/v5, sqlc v2 (schema lido de `internal/database/migrations`), migrações SQL embutidas aplicadas no startup, Postgres (supabase/postgres).

**Spec de referência:** `docs/superpowers/specs/2026-06-08-roadmaps-por-usuario-design.md` (seções 3.1, 3.1.1, 3.2, 4).

---

## Estrutura de arquivos

- **Create** `backend/internal/slugutil/slug.go` — helper puro para gerar slug a partir do nome (usado já agora na migração de forma documentada e na Fase 2 ao criar roadmaps).
- **Create** `backend/internal/slugutil/slug_test.go` — testes unitários do slug.
- **Create** `backend/internal/database/migrations/004_roadmaps.sql` — DDL: tabela `roadmaps`, coluna `roadmap_id`, índices.
- **Create** `backend/internal/database/migrations/005_backfill_roadmaps.sql` — DML idempotente: garante a Eduarda, cria o roadmap institucional, move os itens existentes.
- **Create** `backend/internal/database/queries/roadmaps.sql` — queries de roadmap (geram código sqlc para uso na Fase 2; não usadas ainda).
- **Modify** `scripts/` (novo) `scripts/seed_dev.sh` — carrega o backup no Postgres local para dev/preview.
- **Modify** `docs/PRD.md`, `docs/TASKS.md`, `docs/adr/004-autorizacao-por-propriedade.md`, `docs/adr/005-auth-desacoplada-para-sso.md`.

> **Convenção do projeto:** todo comando Go/sqlc roda via `mise x -- <cmd>` a partir da pasta `backend/` (ver skill tech-stack). O runner de migrações (`backend/internal/database/migrate.go`) aplica em ordem de nome de arquivo todo `*.sql` ainda não registrado em `schema_migrations`.

---

### Task 1: Helper de slug (função pura, TDD)

**Files:**
- Create: `backend/internal/slugutil/slug.go`
- Test: `backend/internal/slugutil/slug_test.go`

- [ ] **Step 1: Escrever o teste que falha**

```go
package slugutil

import "testing"

func TestSlugify(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Roadmap VPS 2026", "roadmap-vps-2026"},
		{"Roadmap Squad Cloud 2026", "roadmap-squad-cloud-2026"},
		{"  Áreas  Críticas / Infra  ", "areas-criticas-infra"},
		{"Múltiplos   espaços", "multiplos-espacos"},
		{"JÁ-com-hífen", "ja-com-hifen"},
		{"", ""},
		{"!!!", ""},
	}
	for _, c := range cases {
		if got := Slugify(c.in); got != c.want {
			t.Fatalf("Slugify(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && mise x -- go test ./internal/slugutil/ -run TestSlugify -v`
Expected: FAIL — `undefined: Slugify` (pacote ainda não existe).

- [ ] **Step 3: Implementar o mínimo para passar**

```go
// Package slugutil gera slugs URL-friendly a partir de textos livres.
package slugutil

import (
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// Slugify converte um texto em um slug: minúsculo, sem acentos, apenas
// [a-z0-9], com palavras separadas por hífen. Retorna "" se não sobrar nada.
func Slugify(s string) string {
	// Remove acentos: decompõe e descarta marcas de combinação (Mn).
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	noAccent, _, err := transform.String(t, s)
	if err != nil {
		noAccent = s
	}
	noAccent = strings.ToLower(noAccent)

	var b strings.Builder
	prevHyphen := false
	for _, r := range noAccent {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevHyphen = false
		default:
			if !prevHyphen && b.Len() > 0 {
				b.WriteRune('-')
				prevHyphen = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}
```

- [ ] **Step 4: Garantir a dependência `golang.org/x/text` (já é dependência indireta)**

Run: `cd backend && mise x -- go get golang.org/x/text@v0.19.0 && mise x -- go mod tidy`
Expected: `golang.org/x/text` passa de `// indirect` para dependência direta em `go.mod`, sem erros.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd backend && mise x -- go test ./internal/slugutil/ -run TestSlugify -v`
Expected: PASS (todos os casos).

- [ ] **Step 6: Commit**

```bash
git add backend/internal/slugutil/slug.go backend/internal/slugutil/slug_test.go backend/go.mod backend/go.sum
git commit -m "feat(backend): helper Slugify para slugs de roadmap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migração 004 — esquema de roadmaps (DDL)

**Files:**
- Create: `backend/internal/database/migrations/004_roadmaps.sql`

- [ ] **Step 1: Escrever a migração de esquema**

```sql
-- 004: introduz roadmaps e vincula itens a um roadmap.
-- Aditivo e idempotente. roadmap_id é anulável nesta fase (backfill em 005).

CREATE TABLE IF NOT EXISTS roadmaps (
    id          BIGSERIAL PRIMARY KEY,
    owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT   NOT NULL,
    slug        TEXT   NOT NULL,
    description TEXT   NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT roadmaps_owner_name_unique UNIQUE (owner_id, name)
);

CREATE INDEX IF NOT EXISTS roadmaps_owner_idx ON roadmaps(owner_id);

ALTER TABLE roadmap_items
    ADD COLUMN IF NOT EXISTS roadmap_id BIGINT REFERENCES roadmaps(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS roadmap_items_roadmap_idx ON roadmap_items(roadmap_id);
```

- [ ] **Step 2: Verificar que o sqlc lê o novo esquema sem erros**

Run: `cd backend && mise x -- sqlc generate`
Expected: gera código sem erro; aparece o tipo `Roadmap` e o campo `RoadmapID *int64` em `internal/database/sqlc/models.go`.

- [ ] **Step 3: Confirmar build verde**

Run: `cd backend && mise x -- go build ./...`
Expected: compila sem erros (queries existentes de itens listam colunas explícitas, então a nova coluna anulável não as afeta).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/database/migrations/004_roadmaps.sql backend/internal/database/sqlc/
git commit -m "feat(db): migração 004 cria tabela roadmaps e coluna roadmap_id

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Queries de roadmap (sqlc) — preparam a Fase 2

**Files:**
- Create: `backend/internal/database/queries/roadmaps.sql`

- [ ] **Step 1: Escrever as queries**

```sql
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
```

- [ ] **Step 2: Gerar o código sqlc**

Run: `cd backend && mise x -- sqlc generate`
Expected: cria `internal/database/sqlc/roadmaps.sql.go` com funções `ListRoadmaps`, `ListMyRoadmaps`, `GetRoadmapByID`, `CreateRoadmap`, `UpdateRoadmap`, `DeleteRoadmap`. Sem erros.

- [ ] **Step 3: Confirmar build verde**

Run: `cd backend && mise x -- go build ./...`
Expected: compila. (As novas funções ainda não são chamadas — ok; o Go não reclama de métodos gerados não usados.)

- [ ] **Step 4: Commit**

```bash
git add backend/internal/database/queries/roadmaps.sql backend/internal/database/sqlc/
git commit -m "feat(db): queries sqlc de roadmaps (uso na Fase 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Migração 005 — backfill dos dados atuais (DML idempotente)

**Files:**
- Create: `backend/internal/database/migrations/005_backfill_roadmaps.sql`

> **Por que separada da 004:** a 004 é DDL (lida pelo sqlc como esquema); a 005 é só DML (dados), que o sqlc ignora ao montar o catálogo. Mantê-las separadas evita qualquer ambiguidade no gerador. A ordem de aplicação é garantida pelo nome (`004` antes de `005`).

> **Nota sobre a senha da Eduarda:** ela é criada com `password_hash = ''` (vazio), o que satisfaz o `NOT NULL` atual mas **não permite login** (o bcrypt nunca valida hash vazio). A definição da senha real acontece na Fase 2 (endpoint de gestão de contas) ou via seed de dev. Isso é intencional: a Fase 1 só precisa que a linha exista para ser dona do roadmap.

- [ ] **Step 1: Escrever a migração de dados**

```sql
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
```

- [ ] **Step 2: Confirmar que o sqlc ainda gera sem erros (DML é ignorado pelo catálogo)**

Run: `cd backend && mise x -- sqlc generate`
Expected: sem erros; nenhum tipo novo (a 005 não altera esquema).

> Se o `sqlc generate` falhar reclamando das instruções da 005, é sinal de que esta versão do sqlc tenta validar DML do diretório de esquema. Nesse caso, mover o conteúdo da 005 para um arquivo de seed fora de `migrations/` aplicado pelo runner não resolve (o runner só lê `migrations/`). A correção é manter a 005 em `migrations/` e adicionar `-- sqlc:ignore` não é suportado; em vez disso, confirmar a versão do sqlc (`mise x -- sqlc version`) — a v1.27+ ignora DML normalmente. Registrar o resultado no commit.

- [ ] **Step 3: Subir o ambiente local e aplicar as migrações**

Run (a partir da raiz do projeto, seguindo a skill tech-stack para subir Postgres + backend):
```bash
# Sobe o Postgres local e o backend (que aplica migrações no startup).
# Use o fluxo da skill tech-stack (ex.: mise tasks ou docker/podman compose do projeto).
cd backend && mise x -- go run ./cmd/server
```
Expected nos logs: `applying migration file=004_roadmaps.sql` e `applying migration file=005_backfill_roadmaps.sql`, seguidos de `listening`.

- [ ] **Step 4: Verificar no banco que o backfill funcionou**

Run (psql no Postgres local — ajuste a string de conexão à do seu `.env`):
```bash
mise x -- psql "$DATABASE_URL" -c "
SELECT r.name, r.slug, u.email AS dono, COUNT(i.id) AS itens
FROM roadmaps r
JOIN users u ON u.id = r.owner_id
LEFT JOIN roadmap_items i ON i.roadmap_id = r.id
GROUP BY r.name, r.slug, u.email;"
```
Expected: uma linha `Roadmap Squad Cloud 2026 | roadmap-squad-cloud-2026 | eduarda.moraes@kinghost.com.br | N`, com `N` = total de itens existentes. E:
```bash
mise x -- psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM roadmap_items WHERE roadmap_id IS NULL;"
```
Expected: `0` (nenhum item órfão).

- [ ] **Step 5: Confirmar que a aplicação continua funcionando como antes**

Run: `curl -s -H "Cookie: session=<token de login>" http://localhost:8080/api/items | head`
(Ou abrir a UI em dev e confirmar que o roadmap aparece igual.)
Expected: a lista de itens responde normalmente — comportamento idêntico ao de antes desta fase.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/database/migrations/005_backfill_roadmaps.sql
git commit -m "feat(db): migração 005 move itens atuais para Roadmap Squad Cloud 2026 (Eduarda)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Seed de dev/preview a partir do backup

**Files:**
- Create: `scripts/seed_dev.sh`

> **Objetivo:** em produção, a migração 005 reaproveita os itens reais já existentes. Em **dev/preview** (banco novo e vazio), não há itens para mover — então carregamos o conteúdo a partir do backup salvo (`backups/roadmap_2026-06-08_*.sql`). Após restaurar, o startup aplica 004/005, que criam o roadmap e vinculam os itens restaurados.

- [ ] **Step 1: Escrever o script de seed**

```bash
#!/usr/bin/env bash
# Carrega o backup mais recente no Postgres local para dev/preview.
# NÃO usar em produção. Requer DATABASE_URL no ambiente.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: defina DATABASE_URL (ex.: export \$(grep DATABASE_URL .env))" >&2
  exit 1
fi

BACKUP="$(ls -t backups/roadmap_*.sql 2>/dev/null | head -1 || true)"
if [ -z "$BACKUP" ]; then
  echo "ERRO: nenhum backup encontrado em backups/roadmap_*.sql" >&2
  exit 1
fi

echo "Restaurando $BACKUP em \$DATABASE_URL ..."
mise x -- psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$BACKUP"
echo "Seed concluído. Suba o backend para aplicar as migrações 004/005."
```

- [ ] **Step 2: Tornar executável**

Run: `chmod +x scripts/seed_dev.sh`
Expected: sem saída; arquivo fica executável.

- [ ] **Step 3: Testar o seed num banco de dev limpo**

Run:
```bash
export $(grep -E '^DATABASE_URL=' .env | xargs) && ./scripts/seed_dev.sh
cd backend && mise x -- go run ./cmd/server   # aplica 004/005 sobre os dados restaurados
```
Expected: após subir, a verificação da Task 4 Step 4 mostra o roadmap "Roadmap Squad Cloud 2026" com os itens do backup vinculados.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed_dev.sh
git commit -m "chore(dev): script de seed do banco a partir do backup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Rodar a suíte de testes completa do backend

- [ ] **Step 1: Rodar todos os testes Go**

Run: `cd backend && mise x -- go test ./...`
Expected: PASS em todos os pacotes (incluindo `internal/slugutil` e os testes já existentes em `internal/handler` e `internal/auth`).

- [ ] **Step 2: Confirmar `go vet` limpo**

Run: `cd backend && mise x -- go vet ./...`
Expected: sem avisos.

---

### Task 7: Atualizar documentação e ADRs

**Files:**
- Modify: `docs/TASKS.md`, `docs/PRD.md`
- Create: `docs/adr/004-autorizacao-por-propriedade.md`, `docs/adr/005-auth-desacoplada-para-sso.md`

- [ ] **Step 1: ADR 004 — autorização por propriedade**

Criar `docs/adr/004-autorizacao-por-propriedade.md` seguindo o template do projeto (Status: Accepted; Context: vários roadmaps por usuário, leitura aberta, edição só do dono, mesma empresa; Decision: autorização no nível da aplicação, sem RLS; Rationale/Trade-offs/Alternatives conforme spec seção 2).

- [ ] **Step 2: ADR 005 — autenticação desacoplada para SSO**

Criar `docs/adr/005-auth-desacoplada-para-sso.md` (Status: Accepted; Decision: interface `Authenticator`, campos `auth_provider`/`external_id`, senha anulável — preparação para Keycloak; detalhes na Fase 2).

- [ ] **Step 3: Atualizar PRD**

Em `docs/PRD.md`, registrar o novo modelo (vários roadmaps por usuário; todos veem, só o dono edita; admin gerencia contas; roadmap inicial "Roadmap Squad Cloud 2026" da Eduarda).

- [ ] **Step 4: Atualizar TASKS**

Em `docs/TASKS.md`, marcar a Fase 1 e listar Fases 2 e 3 como pendentes.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: ADRs 004/005, PRD e TASKS para roadmaps por usuário (Fase 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Critério de conclusão da Fase 1

- `go test ./...` e `go vet ./...` verdes.
- Banco local: roadmap "Roadmap Squad Cloud 2026" (dono Eduarda) existe e todos os itens têm `roadmap_id` (zero órfãos).
- App roda e se comporta exatamente como antes (sem mudança visível ao usuário).
- Seed de dev funciona a partir do backup.
- Docs atualizadas.

---

## Visão das próximas fases (a detalhar em sessão própria)

**Fase 2 — Backend (API + autorização + contas + auth desacoplada):**
- `users`: tornar `password_hash` anulável; adicionar `auth_provider`/`external_id` (migração 006) + ajustar login para o novo tipo gerado.
- Endpoints de roadmaps (`/api/roadmaps`, `/api/roadmaps/{id}`, etc.) e itens escopados (`/api/roadmaps/{id}/items`).
- Middleware `RequireRoadmapOwner` (403 a quem não é dono); leitura aberta.
- Endpoints `/api/admin/users` (criar/remover/definir papel/definir senha) protegidos por `RequireAdmin`; seed dos 3 admins.
- Interface `Authenticator` isolando o login (preparação Keycloak).
- `SET NOT NULL` em `roadmap_items.roadmap_id` após a criação passar a exigir roadmap.
- Testes Go para slug→criação, regras de propriedade (403), e gate de admin.

**Fase 3 — Frontend (telas):**
- Setup do Vitest + Testing Library (ainda não instalados).
- Tela inicial "Meus roadmaps"; aba "Todos os roadmaps"; criar roadmap (placeholder `Ex.: Roadmap VPS 2026`).
- Roteamento por ID (`/roadmaps/{id}-{slug}`); modo leitura para não-donos (flag `can_edit`); modo edição para donos.
- Modal de exclusão com confirmação por slug.
- Painel "Usuários" só para admins.
- Atualizar `frontend/src/api.ts` para as novas rotas; remover chamadas a `/api/items*`.
- Verificação visual com Playwright (`e2e/screenshot.mjs`).
