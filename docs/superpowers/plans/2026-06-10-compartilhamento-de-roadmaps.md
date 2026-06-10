# Compartilhamento de Roadmaps com Permissão de Edição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o dono de um roadmap (e colaboradores autorizados) convide outras pessoas por e-mail e conceda permissões granulares de **editar** e **compartilhar**, mantendo a exclusão do roadmap exclusiva do dono.

**Architecture:** Nova tabela `roadmap_collaborators` (roadmap × usuário × `can_edit`/`can_share`). No backend, a autorização de mutação deixa de ser "só dono": edição de itens e renomear passam por `RequireRoadmapEditor` (dono OU colaborador com `can_edit`); gerenciar colaboradores passa por `RequireRoadmapSharer` (dono OU `can_share`); excluir o roadmap continua em `RequireRoadmapOwner`. O DTO de roadmap ganha flags `canShare`/`canDelete`/`isOwner`. No frontend, nova aba "Compartilhados comigo" e um diálogo de compartilhamento na tela do roadmap.

**Tech Stack:** Go (net/http, pgx, sqlc), React + TypeScript (Vite, React Router), Postgres. Comandos Go rodam de `backend/` via `mise x`. Módulo Go: `github.com/fagnerlopes/roadmap-tribo-cloud/backend`.

**Pré-requisito de ambiente (uma vez, antes de rodar os testes de backend):** subir o banco e exportar `DATABASE_URL`, senão os testes de integração são *pulados* (não falham, mas também não validam nada):

```bash
podman start roadmap-tribo-cloud-db 2>/dev/null || \
  podman run -d --name roadmap-tribo-cloud-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 supabase/postgres:17.6.1.133
```

Rode os testes Go assim (carrega `.env` para ter `DATABASE_URL`):

```bash
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && mise x -- go test ./...'
```

---

## File Structure

**Backend (criar):**
- `backend/internal/database/migrations/007_roadmap_collaborators.sql` — nova tabela.
- `backend/internal/database/queries/collaborators.sql` — queries sqlc dos colaboradores.

**Backend (modificar):**
- `backend/internal/database/queries/roadmaps.sql` — query `ListSharedRoadmaps`.
- `backend/internal/auth/auth.go` — middlewares `RequireRoadmapEditor` e `RequireRoadmapSharer` (+ helper privado `roadmapAccess`).
- `backend/internal/handler/handler.go` — rotas novas; troca de `ownerM` por `editorM` em itens/renomear; handlers de colaboradores; flags no DTO; handler `listSharedRoadmaps`.
- `backend/internal/handler/collaborators_test.go` (criar) — testes de integração da matriz de permissões.

**Backend (gerado — não editar à mão):**
- `backend/internal/database/sqlc/*` — regenerado por `sqlc generate`.

**Frontend (modificar):**
- `frontend/src/api.ts` — tipo `Collaborator`, campos novos em `Roadmap`, métodos de API.
- `frontend/src/pages/RoadmapList.tsx` — aba "Compartilhados comigo".
- `frontend/src/pages/RoadmapView.tsx` — botão "Compartilhar", uso de `canDelete`, diálogo.

**Frontend (criar):**
- `frontend/src/components/ShareDialog.tsx` — diálogo de gestão de colaboradores.
- `frontend/src/components/ShareDialog.test.tsx` — testes do diálogo.
- Ajustes em `frontend/src/pages/RoadmapList.test.tsx`.

**Docs (modificar):** `docs/PRD.md`, `docs/TASKS.md`, novo `docs/adr/010-compartilhamento-colaboradores.md`.

---

## Task 1: Migração e queries (fundação de dados)

**Files:**
- Create: `backend/internal/database/migrations/007_roadmap_collaborators.sql`
- Create: `backend/internal/database/queries/collaborators.sql`
- Modify: `backend/internal/database/queries/roadmaps.sql`

- [ ] **Step 1: Escrever a migração**

Criar `backend/internal/database/migrations/007_roadmap_collaborators.sql`:

```sql
-- 007: colaboradores por roadmap. Permite que o dono (e quem tem can_share)
-- conceda edição/compartilhamento a outros usuários. Aditivo e idempotente:
-- não altera dados existentes.

CREATE TABLE IF NOT EXISTS roadmap_collaborators (
    roadmap_id  BIGINT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    can_edit    BOOLEAN NOT NULL DEFAULT true,
    can_share   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (roadmap_id, user_id)
);

CREATE INDEX IF NOT EXISTS roadmap_collaborators_user_idx
    ON roadmap_collaborators(user_id);
```

- [ ] **Step 2: Escrever as queries de colaboradores**

Criar `backend/internal/database/queries/collaborators.sql`:

```sql
-- name: GetCollaborator :one
SELECT roadmap_id, user_id, can_edit, can_share
FROM roadmap_collaborators
WHERE roadmap_id = $1 AND user_id = $2;

-- name: ListCollaboratorsByRoadmap :many
SELECT c.roadmap_id, c.user_id, c.can_edit, c.can_share,
       u.name AS user_name, u.email AS user_email
FROM roadmap_collaborators c
JOIN users u ON u.id = c.user_id
WHERE c.roadmap_id = $1
ORDER BY u.name ASC;

-- name: ListMyCollaborations :many
SELECT roadmap_id, can_edit, can_share
FROM roadmap_collaborators
WHERE user_id = $1;

-- UpsertCollaborator cria ou atualiza o vínculo. Reconvidar atualiza permissões.
-- name: UpsertCollaborator :one
INSERT INTO roadmap_collaborators (roadmap_id, user_id, can_edit, can_share, created_by)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (roadmap_id, user_id) DO UPDATE
SET can_edit = EXCLUDED.can_edit, can_share = EXCLUDED.can_share
RETURNING roadmap_id, user_id, can_edit, can_share;

-- name: DeleteCollaborator :exec
DELETE FROM roadmap_collaborators WHERE roadmap_id = $1 AND user_id = $2;
```

- [ ] **Step 3: Adicionar a query de roadmaps compartilhados**

Acrescentar ao final de `backend/internal/database/queries/roadmaps.sql`:

```sql
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
```

- [ ] **Step 4: Gerar o código sqlc**

Run:
```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/backend" && mise x -- sqlc generate'
```
Expected: sem erros; arquivos em `backend/internal/database/sqlc/` atualizados.

- [ ] **Step 5: Confirmar nomes gerados (LEITURA OBRIGATÓRIA)**

Ler `backend/internal/database/sqlc/collaborators.sql.go` e `roadmaps.sql.go`. Confirmar os nomes exatos antes de escrever handlers. Esperado (sqlc converte snake_case → CamelCase):
- `GetCollaboratorParams{RoadmapID, UserID}`; linha retornada com campos `RoadmapID, UserID, CanEdit, CanShare`.
- `ListCollaboratorsByRoadmapRow{RoadmapID, UserID, CanEdit, CanShare, UserName, UserEmail}`.
- `ListMyCollaborationsRow{RoadmapID, CanEdit, CanShare}`.
- `UpsertCollaboratorParams{RoadmapID, UserID, CanEdit, CanShare, CreatedBy}`; `CreatedBy` é `*int64` (anulável) ou `pgtype.Int8` — anotar o tipo real para usar no handler.
- `DeleteCollaboratorParams{RoadmapID, UserID}`.
- `ListSharedRoadmapsRow{ID, OwnerID, Name, Slug, Description, CreatedAt, UpdatedAt, OwnerName, ItemCount, CanEdit, CanShare}`.

Se algum nome divergir, usar o nome real do arquivo gerado nos próximos passos.

- [ ] **Step 6: Confirmar que a migração aplica**

Run (sobe o servidor por ~2s só para aplicar migrações; encerra com Ctrl-C ou timeout):
```bash
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && DEV_MODE=1 timeout 8 mise x -- go run ./cmd/server' 2>&1 | head -20
```
Expected: logs de migração sem erro; a tabela existe. Confirmar:
```bash
podman exec roadmap-tribo-cloud-db psql -U postgres -c "\d roadmap_collaborators"
```
Expected: descrição da tabela com colunas `roadmap_id, user_id, can_edit, can_share, created_at, created_by`.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/database/migrations/007_roadmap_collaborators.sql \
        backend/internal/database/queries/collaborators.sql \
        backend/internal/database/queries/roadmaps.sql \
        backend/internal/database/sqlc/
git commit -m "feat(db): tabela roadmap_collaborators e queries de colaboração"
```

---

## Task 2: Middlewares de autorização (editor e sharer)

**Files:**
- Modify: `backend/internal/auth/auth.go` (adicionar ao final, após `RequireRoadmapOwner`)

- [ ] **Step 1: Adicionar o helper e os dois middlewares**

Acrescentar ao final de `backend/internal/auth/auth.go` (o arquivo já importa `errors`, `net/http`, `strconv`, `pgx`, `sqlc`):

```go
// roadmapAccess carrega o roadmap pelo path {id} e a relação de colaboração do
// usuário logado, então delega a decisão a allow(). Centraliza a resolução de
// id → roadmap → colaborador usada pelos middlewares de edição e de
// compartilhamento. 401 sem sessão, 400 id inválido, 404 inexistente,
// 403 quando allow() recusa.
func roadmapAccess(
	q *sqlc.Queries,
	allow func(u *SessionUser, ownerID int64, canEdit, canShare bool) bool,
	forbidMsg string,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u := FromContext(r.Context())
			if u == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
			if err != nil {
				http.Error(w, `{"error":"id inválido"}`, http.StatusBadRequest)
				return
			}
			rm, err := q.GetRoadmapByID(r.Context(), id)
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, `{"error":"roadmap não encontrado"}`, http.StatusNotFound)
				return
			}
			if err != nil {
				http.Error(w, `{"error":"erro ao carregar roadmap"}`, http.StatusInternalServerError)
				return
			}
			var canEdit, canShare bool
			if rm.OwnerID != u.ID {
				c, err := q.GetCollaborator(r.Context(), sqlc.GetCollaboratorParams{RoadmapID: id, UserID: u.ID})
				if err == nil {
					canEdit, canShare = c.CanEdit, c.CanShare
				} else if !errors.Is(err, pgx.ErrNoRows) {
					http.Error(w, `{"error":"erro ao carregar permissões"}`, http.StatusInternalServerError)
					return
				}
			}
			if !allow(u, rm.OwnerID, canEdit, canShare) {
				http.Error(w, `{"error":"`+forbidMsg+`"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireRoadmapEditor libera mutação de conteúdo (itens) e renomear: dono OU
// colaborador com can_edit.
func RequireRoadmapEditor(q *sqlc.Queries) func(http.Handler) http.Handler {
	return roadmapAccess(q, func(u *SessionUser, ownerID int64, canEdit, canShare bool) bool {
		return ownerID == u.ID || canEdit
	}, "apenas o dono ou um colaborador com permissão de edição pode alterar este roadmap")
}

// RequireRoadmapSharer libera a gestão de colaboradores: dono OU colaborador
// com can_share.
func RequireRoadmapSharer(q *sqlc.Queries) func(http.Handler) http.Handler {
	return roadmapAccess(q, func(u *SessionUser, ownerID int64, canEdit, canShare bool) bool {
		return ownerID == u.ID || canShare
	}, "apenas o dono ou um colaborador com permissão de compartilhar pode gerenciar o acesso")
}
```

- [ ] **Step 2: Compilar**

Run:
```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/backend" && mise x -- go build ./...'
```
Expected: compila sem erros. (Se `GetCollaborator` reclamar de tipo de campo, ajustar conforme os nomes reais do Step 5 da Task 1.)

- [ ] **Step 3: Commit**

```bash
git add backend/internal/auth/auth.go
git commit -m "feat(auth): middlewares RequireRoadmapEditor e RequireRoadmapSharer"
```

---

## Task 3: Handlers de colaboradores + rotas (TDD via integração)

**Files:**
- Modify: `backend/internal/handler/handler.go`
- Create: `backend/internal/handler/collaborators_test.go`

- [ ] **Step 1: Escrever os testes de integração (falham primeiro)**

Criar `backend/internal/handler/collaborators_test.go`. Usa os helpers já existentes em `integration_test.go` (`newTestServer`, `loginAs`, `doReq`, `createRoadmap`, `itoa`):

```go
package handler

import (
	"encoding/json"
	"net/http"
	"testing"
)

// addCollab é um helper local: convida email com as permissões dadas.
func addCollab(t *testing.T, srv interface{ Client() }, _ string) {} // placeholder removido abaixo

func TestShareCollaboratorFlow(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dona@test.local", "user")
	editor := loginAs(t, q, "editor@test.local", "user")

	id, _ := createRoadmap(t, srv, owner, "Roadmap Compartilhado 2026")

	// Antes de compartilhar: editor não edita (403) e não vê em "compartilhados".
	resp, _ := doReq(t, srv, http.MethodPut, "/api/roadmaps/"+itoa(id), editor, map[string]string{"name": "X"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("editor sem convite deveria ser 403 ao renomear, veio %d", resp.StatusCode)
	}

	// Dono convida o editor com can_edit.
	resp, data := doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", owner,
		map[string]any{"email": "editor@test.local", "canEdit": true, "canShare": false})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("convite deveria ser 200/201, veio %d (%s)", resp.StatusCode, data)
	}

	// Agora o editor renomeia (200) e cria item (201).
	resp, _ = doReq(t, srv, http.MethodPut, "/api/roadmaps/"+itoa(id), editor, map[string]string{"name": "Renomeado pelo editor"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("editor convidado deveria renomear (200), veio %d", resp.StatusCode)
	}
	resp, _ = doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/items", editor,
		map[string]any{"title": "Item do editor", "status": "nao-iniciado"})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("editor convidado deveria criar item (201), veio %d", resp.StatusCode)
	}

	// Mas NÃO pode excluir o roadmap (403 — só o dono).
	resp, _ = doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id), editor, map[string]string{"confirmSlug": "renomeado-pelo-editor"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("editor convidado NÃO pode excluir o roadmap; esperava 403, veio %d", resp.StatusCode)
	}

	// O roadmap aparece em "compartilhados comigo" para o editor.
	resp, data = doReq(t, srv, http.MethodGet, "/api/roadmaps/shared", editor, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("listar compartilhados deveria ser 200, veio %d", resp.StatusCode)
	}
	var shared []roadmapDTO
	_ = json.Unmarshal(data, &shared)
	if len(shared) != 1 || shared[0].ID != id || !shared[0].CanEdit || shared[0].CanDelete {
		t.Fatalf("compartilhado esperado: 1 item id=%d canEdit=true canDelete=false; veio %+v", id, shared)
	}

	// Dono remove o colaborador → some da lista.
	editorUser := loginUserID(t, q, "editor@test.local")
	resp, _ = doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id)+"/collaborators/"+itoa(editorUser), owner, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("remoção de colaborador deveria ser 204, veio %d", resp.StatusCode)
	}
	resp, data = doReq(t, srv, http.MethodGet, "/api/roadmaps/shared", editor, nil)
	_ = json.Unmarshal(data, &shared)
	if len(shared) != 0 {
		t.Fatalf("após remoção, compartilhados deveria ser vazio, veio %d", len(shared))
	}
}

func TestShareEmailNotFound(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dona2@test.local", "user")
	id, _ := createRoadmap(t, srv, owner, "Roadmap NF 2026")

	resp, data := doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", owner,
		map[string]any{"email": "ninguem@inexistente.local", "canEdit": true})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("e-mail sem conta deveria ser 404, veio %d", resp.StatusCode)
	}
	var body map[string]string
	_ = json.Unmarshal(data, &body)
	if body["error"] == "" {
		t.Fatal("esperava mensagem de erro orientando solicitar o cadastro")
	}
}

func TestShareGate(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dona3@test.local", "user")
	editorOnly := loginAs(t, q, "soedita@test.local", "user")
	stranger := loginAs(t, q, "estranho@test.local", "user")
	id, _ := createRoadmap(t, srv, owner, "Roadmap Gate 2026")

	// Convida editorOnly só com can_edit (sem can_share).
	doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", owner,
		map[string]any{"email": "soedita@test.local", "canEdit": true, "canShare": false})

	// editorOnly NÃO pode gerenciar colaboradores (403).
	resp, _ := doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/collaborators", editorOnly, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("colaborador sem can_share não deveria listar colaboradores; esperava 403, veio %d", resp.StatusCode)
	}
	// Estranho idem.
	resp, _ = doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/collaborators", stranger, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("estranho não deveria listar colaboradores; esperava 403, veio %d", resp.StatusCode)
	}
	// Dono pode (200).
	resp, _ = doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/collaborators", owner, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("dono deveria listar colaboradores (200), veio %d", resp.StatusCode)
	}
}

func TestCannotRemoveOwnerAsCollaborator(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dona4@test.local", "user")
	id, _ := createRoadmap(t, srv, owner, "Roadmap Owner 2026")
	ownerID := loginUserID(t, q, "dona4@test.local")

	// Tentar remover o próprio dono como "colaborador" → 400.
	resp, _ := doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id)+"/collaborators/"+itoa(ownerID), owner, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("remover o dono deveria ser 400, veio %d", resp.StatusCode)
	}
}
```

Adicionar também o helper `loginUserID` ao final do arquivo (busca o id do usuário pelo e-mail):

```go
import "context" // adicionar ao bloco de imports do arquivo

func loginUserID(t *testing.T, q *sqlcQueries, email string) int64 { // ver nota de tipo abaixo
	t.Helper()
	u, err := q.GetUserByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("get user %s: %v", email, err)
	}
	return u.ID
}
```

> Nota: o tipo de `q` é `*sqlc.Queries`. Para evitar import duplicado/alias, declarar a função assim no arquivo: `func loginUserID(t *testing.T, q *sqlc.Queries, email string) int64` e importar `"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database/sqlc"` e `"context"`. **Remover o placeholder `addCollab`** mostrado no topo (era só ilustrativo) — não deve ficar no arquivo final.

- [ ] **Step 2: Rodar os testes e ver falhar**

Run:
```bash
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && mise x -- go test ./internal/handler/ -run "TestShare|TestCannotRemoveOwner" -v'
```
Expected: FALHA na compilação ou nos testes (rotas/handlers ainda não existem). Se aparecer "skipped" é porque `DATABASE_URL` não foi carregado — corrigir o ambiente antes de prosseguir.

- [ ] **Step 3: Adicionar as rotas**

Em `backend/internal/handler/handler.go`, dentro de `Routes()`, logo após a linha `ownerM := auth.RequireRoadmapOwner(h.Q)` (≈ linha 92), adicionar:

```go
	editorM := auth.RequireRoadmapEditor(h.Q)
	sharerM := auth.RequireRoadmapSharer(h.Q)
```

Trocar as rotas de itens e de renomear para usar `editorM` (a de DELETE roadmap continua com `ownerM`). Substituir o bloco atual (≈ linhas 103–111) por:

```go
	mux.Handle("PUT /api/roadmaps/{id}", authM(editorM(http.HandlerFunc(h.updateRoadmap))))
	mux.Handle("DELETE /api/roadmaps/{id}", authM(ownerM(http.HandlerFunc(h.deleteRoadmap))))

	// Roadmaps compartilhados comigo.
	mux.Handle("GET /api/roadmaps/shared", authM(http.HandlerFunc(h.listSharedRoadmaps)))

	// Itens escopados por roadmap (mutação por dono ou colaborador editor; leitura aberta).
	mux.Handle("GET /api/roadmaps/{id}/items", authM(http.HandlerFunc(h.listRoadmapItems)))
	mux.Handle("POST /api/roadmaps/{id}/items", authM(editorM(http.HandlerFunc(h.createRoadmapItem))))
	mux.Handle("PUT /api/roadmaps/{id}/items/reorder", authM(editorM(http.HandlerFunc(h.reorderRoadmapItems))))
	mux.Handle("PUT /api/roadmaps/{id}/items/{itemId}", authM(editorM(http.HandlerFunc(h.updateRoadmapItem))))
	mux.Handle("DELETE /api/roadmaps/{id}/items/{itemId}", authM(editorM(http.HandlerFunc(h.deleteRoadmapItem))))

	// Colaboradores (dono ou quem tem can_share).
	mux.Handle("GET /api/roadmaps/{id}/collaborators", authM(sharerM(http.HandlerFunc(h.listCollaborators))))
	mux.Handle("POST /api/roadmaps/{id}/collaborators", authM(sharerM(http.HandlerFunc(h.addCollaborator))))
	mux.Handle("PUT /api/roadmaps/{id}/collaborators/{userId}", authM(sharerM(http.HandlerFunc(h.updateCollaborator))))
	mux.Handle("DELETE /api/roadmaps/{id}/collaborators/{userId}", authM(sharerM(http.HandlerFunc(h.removeCollaborator))))
```

> **Ordem de rotas importa:** `GET /api/roadmaps/shared` deve ser registrada — o roteador do net/http distingue `/shared` de `/{id}` pelo padrão literal, então não há conflito, mas mantenha a rota `shared` junto às demais de roadmap.

- [ ] **Step 4: Implementar os handlers de colaboradores**

Em `handler.go`, adicionar uma nova seção (por ex., após o bloco de Roadmaps, antes da seção de Administração de contas). O arquivo já importa `encoding/json`, `errors`, `net/http`, `strconv`, `strings`, `log/slog`, `pgx`, `auth`, `sqlc`.

```go
// ──────────────────────────────────────────────────────────────
// Colaboradores (compartilhamento)
// ──────────────────────────────────────────────────────────────

type collaboratorDTO struct {
	UserID   int64  `json:"userId"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	CanEdit  bool   `json:"canEdit"`
	CanShare bool   `json:"canShare"`
}

func (h *Handler) listCollaborators(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	rows, err := h.Q.ListCollaboratorsByRoadmap(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar colaboradores")
		return
	}
	out := make([]collaboratorDTO, 0, len(rows))
	for _, c := range rows {
		out = append(out, collaboratorDTO{
			UserID: c.UserID, Name: c.UserName, Email: c.UserEmail,
			CanEdit: c.CanEdit, CanShare: c.CanShare,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

type addCollaboratorReq struct {
	Email    string `json:"email"`
	CanEdit  bool   `json:"canEdit"`
	CanShare bool   `json:"canShare"`
}

func (h *Handler) addCollaborator(w http.ResponseWriter, r *http.Request) {
	actor := auth.FromContext(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	var req addCollaboratorReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		writeErr(w, http.StatusBadRequest, "e-mail obrigatório")
		return
	}
	rm, err := h.Q.GetRoadmapByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "roadmap não encontrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao carregar roadmap")
		return
	}
	target, err := h.Q.GetUserByEmail(r.Context(), email)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "Não há conta com esse e-mail. Solicite o cadastro a marcus.januario@locaweb.com.br.")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar usuário")
		return
	}
	if target.ID == rm.OwnerID {
		writeErr(w, http.StatusBadRequest, "o dono já tem acesso total ao roadmap")
		return
	}
	createdBy := actor.ID
	row, err := h.Q.UpsertCollaborator(r.Context(), sqlc.UpsertCollaboratorParams{
		RoadmapID: id, UserID: target.ID,
		CanEdit: req.CanEdit, CanShare: req.CanShare,
		CreatedBy: &createdBy,
	})
	if err != nil {
		slog.Error("upsert collaborator", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao convidar")
		return
	}
	writeJSON(w, http.StatusCreated, collaboratorDTO{
		UserID: target.ID, Name: target.Name, Email: target.Email,
		CanEdit: row.CanEdit, CanShare: row.CanShare,
	})
}

type updateCollaboratorReq struct {
	CanEdit  bool `json:"canEdit"`
	CanShare bool `json:"canShare"`
}

func (h *Handler) updateCollaborator(w http.ResponseWriter, r *http.Request) {
	actor := auth.FromContext(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	userID, err := strconv.ParseInt(r.PathValue("userId"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "userId inválido")
		return
	}
	var req updateCollaboratorReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	createdBy := actor.ID
	row, err := h.Q.UpsertCollaborator(r.Context(), sqlc.UpsertCollaboratorParams{
		RoadmapID: id, UserID: userID,
		CanEdit: req.CanEdit, CanShare: req.CanShare,
		CreatedBy: &createdBy,
	})
	if err != nil {
		slog.Error("update collaborator", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar permissões")
		return
	}
	u, _ := h.Q.GetUserByID(r.Context(), userID)
	writeJSON(w, http.StatusOK, collaboratorDTO{
		UserID: userID, Name: u.Name, Email: u.Email,
		CanEdit: row.CanEdit, CanShare: row.CanShare,
	})
}

func (h *Handler) removeCollaborator(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	userID, err := strconv.ParseInt(r.PathValue("userId"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "userId inválido")
		return
	}
	rm, err := h.Q.GetRoadmapByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "roadmap não encontrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao carregar roadmap")
		return
	}
	if userID == rm.OwnerID {
		writeErr(w, http.StatusBadRequest, "não é possível remover o dono do roadmap")
		return
	}
	if err := h.Q.DeleteCollaborator(r.Context(), sqlc.DeleteCollaboratorParams{RoadmapID: id, UserID: userID}); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao remover colaborador")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}
```

> **Conferir o tipo de `CreatedBy`** com o arquivo gerado (Step 5 da Task 1). Se for `pgtype.Int8`, trocar `CreatedBy: &createdBy` por `CreatedBy: pgtype.Int8{Int64: actor.ID, Valid: true}` e importar `pgtype`. Se `GetUserByEmail`/`GetUserByID` não tiverem o campo `Email`/`Name` esperado, conferir `users.sql.go` (têm: `GetUserByEmail` retorna `id, email, password_hash, name, role, created_at`).

- [ ] **Step 5: Implementar `listSharedRoadmaps`**

Ainda em `handler.go`, na seção de Roadmaps (perto de `listRoadmaps`):

```go
func (h *Handler) listSharedRoadmaps(w http.ResponseWriter, r *http.Request) {
	u := auth.FromContext(r.Context())
	if u == nil {
		writeErr(w, http.StatusUnauthorized, "não autenticado")
		return
	}
	rows, err := h.Q.ListSharedRoadmaps(r.Context(), u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar compartilhados")
		return
	}
	out := make([]roadmapDTO, 0, len(rows))
	for _, rm := range rows {
		out = append(out, roadmapDTO{
			ID: rm.ID, Name: rm.Name, Slug: rm.Slug, Description: rm.Description,
			OwnerID: rm.OwnerID, OwnerName: rm.OwnerName, ItemCount: rm.ItemCount,
			CanEdit: rm.CanEdit, CanShare: rm.CanShare,
			CanDelete: false, IsOwner: false,
		})
	}
	writeJSON(w, http.StatusOK, out)
}
```

> `CanDelete`/`IsOwner`/`CanShare` são campos novos do `roadmapDTO` — serão adicionados na Task 4 Step 1. Se compilar antes da Task 4, adicione os campos agora (a ordem das tasks 3→4 toca o mesmo struct; ao implementar, fazer o Step 1 da Task 4 junto deste para o pacote compilar).

- [ ] **Step 6: Adicionar os campos novos ao DTO (necessário para compilar)**

Em `handler.go`, alterar o struct `roadmapDTO` (≈ linha 623) para:

```go
type roadmapDTO struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	OwnerID     int64  `json:"ownerId"`
	OwnerName   string `json:"ownerName"`
	ItemCount   int64  `json:"itemCount"`
	CanEdit     bool   `json:"canEdit"`
	CanShare    bool   `json:"canShare"`
	CanDelete   bool   `json:"canDelete"`
	IsOwner     bool   `json:"isOwner"`
}
```

Nos handlers existentes que criam `roadmapDTO` para o **dono** (`createRoadmap` ≈ linha 719, `updateRoadmap` ≈ linha 794), acrescentar `CanShare: true, CanDelete: true, IsOwner: true` ao literal (o dono pode tudo).

- [ ] **Step 7: Compilar e rodar os testes — ver passar**

Run:
```bash
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && mise x -- go build ./... && mise x -- go test ./internal/handler/ -run "TestShare|TestCannotRemoveOwner" -v'
```
Expected: PASS em `TestShareCollaboratorFlow`, `TestShareEmailNotFound`, `TestShareGate`, `TestCannotRemoveOwnerAsCollaborator`.

- [ ] **Step 8: Rodar a suíte de backend inteira (não quebrar nada)**

Run:
```bash
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && mise x -- go test ./...'
```
Expected: todos PASS (inclusive `TestRoadmapOwnership` etc.).

- [ ] **Step 9: Commit**

```bash
git add backend/internal/handler/handler.go backend/internal/handler/collaborators_test.go
git commit -m "feat(api): endpoints de colaboradores, rotas por editor e listagem de compartilhados"
```

---

## Task 4: Flags por colaboração nas listagens (canEdit/canShare em roadmaps de terceiros)

**Files:**
- Modify: `backend/internal/handler/handler.go` (`listRoadmaps`, `getRoadmap`)
- Modify: `backend/internal/handler/collaborators_test.go` (um teste a mais)

> Objetivo: quando o usuário abre um roadmap que **não é dele** mas é compartilhado, `getRoadmap` deve devolver `canEdit/canShare` corretos (hoje devolve sempre `canEdit=false` para não-dono). E na aba "Todos os roadmaps", um roadmap compartilhado deve sair com as flags certas.

- [ ] **Step 1: Teste — getRoadmap reflete a colaboração**

Adicionar a `collaborators_test.go`:

```go
func TestGetRoadmapReflectsCollaboration(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dona5@test.local", "user")
	editor := loginAs(t, q, "editor5@test.local", "user")
	id, _ := createRoadmap(t, srv, owner, "Roadmap Flags 2026")

	// Sem convite: canEdit=false, canShare=false, canDelete=false, isOwner=false.
	resp, data := doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id), editor, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get deveria ser 200, veio %d", resp.StatusCode)
	}
	var dto roadmapDTO
	_ = json.Unmarshal(data, &dto)
	if dto.CanEdit || dto.CanShare || dto.CanDelete || dto.IsOwner {
		t.Fatalf("sem convite todas as flags deveriam ser false; veio %+v", dto)
	}

	// Convida com can_edit + can_share.
	doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", owner,
		map[string]any{"email": "editor5@test.local", "canEdit": true, "canShare": true})

	resp, data = doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id), editor, nil)
	_ = json.Unmarshal(data, &dto)
	if !dto.CanEdit || !dto.CanShare {
		t.Fatalf("após convite canEdit e canShare deveriam ser true; veio %+v", dto)
	}
	if dto.CanDelete || dto.IsOwner {
		t.Fatalf("colaborador nunca tem canDelete/isOwner; veio %+v", dto)
	}
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && mise x -- go test ./internal/handler/ -run TestGetRoadmapReflectsCollaboration -v'
```
Expected: FAIL (hoje `getRoadmap` devolve `canEdit=false` para não-dono).

- [ ] **Step 3: Atualizar `getRoadmap`**

Substituir o trecho final de `getRoadmap` (a partir de `ownerName := u.Name`, ≈ linha 745) por:

```go
	ownerName := u.Name
	isOwner := rm.OwnerID == u.ID
	canEdit, canShare := isOwner, isOwner
	if !isOwner {
		if owner, err := h.Q.GetUserByID(r.Context(), rm.OwnerID); err == nil {
			ownerName = owner.Name
		}
		if c, err := h.Q.GetCollaborator(r.Context(), sqlc.GetCollaboratorParams{RoadmapID: id, UserID: u.ID}); err == nil {
			canEdit, canShare = c.CanEdit, c.CanShare
		}
	}
	count, _ := h.Q.CountItemsByRoadmap(r.Context(), id)
	writeJSON(w, http.StatusOK, roadmapDTO{
		ID: rm.ID, Name: rm.Name, Slug: rm.Slug, Description: rm.Description,
		OwnerID: rm.OwnerID, OwnerName: ownerName, ItemCount: count,
		CanEdit: canEdit, CanShare: canShare, CanDelete: isOwner, IsOwner: isOwner,
	})
```

- [ ] **Step 4: Atualizar `listRoadmaps` (aba "Todos") para marcar colaborações**

Substituir o corpo de `listRoadmaps` (≈ linhas 653–688) por:

```go
func (h *Handler) listRoadmaps(w http.ResponseWriter, r *http.Request) {
	u := auth.FromContext(r.Context())
	if u == nil {
		writeErr(w, http.StatusUnauthorized, "não autenticado")
		return
	}
	// Pré-carrega as colaborações do usuário para marcar flags em roadmaps de terceiros.
	collabs := map[int64]sqlc.ListMyCollaborationsRow{}
	if rows, err := h.Q.ListMyCollaborations(r.Context(), u.ID); err == nil {
		for _, c := range rows {
			collabs[c.RoadmapID] = c
		}
	}
	dto := func(id int64, name, slug, desc string, ownerID int64, ownerName string, count int64) roadmapDTO {
		isOwner := ownerID == u.ID
		canEdit, canShare := isOwner, isOwner
		if !isOwner {
			if c, ok := collabs[id]; ok {
				canEdit, canShare = c.CanEdit, c.CanShare
			}
		}
		return roadmapDTO{
			ID: id, Name: name, Slug: slug, Description: desc,
			OwnerID: ownerID, OwnerName: ownerName, ItemCount: count,
			CanEdit: canEdit, CanShare: canShare, CanDelete: isOwner, IsOwner: isOwner,
		}
	}
	out := make([]roadmapDTO, 0)
	if r.URL.Query().Get("mine") == "true" {
		rows, err := h.Q.ListMyRoadmaps(r.Context(), u.ID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao listar")
			return
		}
		for _, rm := range rows {
			out = append(out, dto(rm.ID, rm.Name, rm.Slug, rm.Description, rm.OwnerID, rm.OwnerName, rm.ItemCount))
		}
	} else {
		rows, err := h.Q.ListRoadmaps(r.Context())
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao listar")
			return
		}
		for _, rm := range rows {
			out = append(out, dto(rm.ID, rm.Name, rm.Slug, rm.Description, rm.OwnerID, rm.OwnerName, rm.ItemCount))
		}
	}
	writeJSON(w, http.StatusOK, out)
}
```

- [ ] **Step 5: Rodar os testes — ver passar**

Run:
```bash
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && mise x -- go test ./...'
```
Expected: todos PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/handler/handler.go backend/internal/handler/collaborators_test.go
git commit -m "feat(api): flags canEdit/canShare/canDelete/isOwner por colaboração nas listagens"
```

---

## Task 5: Camada de API no frontend

**Files:**
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Estender o tipo `Roadmap` e adicionar `Collaborator`**

Em `frontend/src/api.ts`, alterar o tipo `Roadmap` (linha 3) acrescentando os campos novos, e adicionar o tipo `Collaborator`:

```ts
export type Roadmap = {
  id: number;
  name: string;
  slug: string;
  description: string;
  ownerId: number;
  ownerName: string;
  itemCount: number;
  canEdit: boolean;
  canShare: boolean;
  canDelete: boolean;
  isOwner: boolean;
};

export type Collaborator = {
  userId: number;
  name: string;
  email: string;
  canEdit: boolean;
  canShare: boolean;
};
```

- [ ] **Step 2: Adicionar os métodos de API**

No objeto `api`, logo após `deleteRoadmap` (linha 81), adicionar:

```ts
  listSharedRoadmaps: () => req<Roadmap[]>("/api/roadmaps/shared"),

  // Colaboradores
  listCollaborators: (roadmapId: number) =>
    req<Collaborator[]>(`/api/roadmaps/${roadmapId}/collaborators`),
  addCollaborator: (roadmapId: number, input: { email: string; canEdit: boolean; canShare: boolean }) =>
    req<Collaborator>(`/api/roadmaps/${roadmapId}/collaborators`, { method: "POST", body: JSON.stringify(input) }),
  updateCollaborator: (roadmapId: number, userId: number, input: { canEdit: boolean; canShare: boolean }) =>
    req<Collaborator>(`/api/roadmaps/${roadmapId}/collaborators/${userId}`, { method: "PUT", body: JSON.stringify(input) }),
  removeCollaborator: (roadmapId: number, userId: number) =>
    req<void>(`/api/roadmaps/${roadmapId}/collaborators/${userId}`, { method: "DELETE" }),
```

- [ ] **Step 3: Type-check**

Run:
```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npx tsc -b'
```
Expected: sem erros de tipo. (Pode haver erros em `RoadmapList.test.tsx`/outros locais que constroem `Roadmap` sem os campos novos — corrigir nas Tasks 6/7. Se `tsc -b` falhar só por isso, prosseguir e resolver nas próximas tasks; não commitar ainda.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat(web): tipos e métodos de API para compartilhamento"
```

---

## Task 6: Aba "Compartilhados comigo" na lista

**Files:**
- Modify: `frontend/src/pages/RoadmapList.tsx`
- Modify: `frontend/src/pages/RoadmapList.test.tsx`

- [ ] **Step 1: Atualizar o teste (falha primeiro)**

Em `frontend/src/pages/RoadmapList.test.tsx`, ampliar o mock e adicionar um teste da nova aba. Substituir o mock de `../api` (linha 8) e o `sample` (linhas 13–15) por:

```ts
const listRoadmaps = vi.fn();
const listSharedRoadmaps = vi.fn();
vi.mock("../api", () => ({ api: {
  listRoadmaps: (mine: boolean) => listRoadmaps(mine),
  listSharedRoadmaps: () => listSharedRoadmaps(),
} }));
vi.mock("../auth", () => ({ useAuth: () => ({ user: { id: 1, name: "Fagner", role: "user" }, logout: vi.fn() }) }));

import RoadmapList from "./RoadmapList";

const sample: Roadmap[] = [
  { id: 3, name: "Roadmap VPS 2026", slug: "roadmap-vps-2026", description: "", ownerId: 1, ownerName: "Fagner", itemCount: 4, canEdit: true, canShare: true, canDelete: true, isOwner: true },
];
const shared: Roadmap[] = [
  { id: 9, name: "Roadmap da Eduarda", slug: "roadmap-da-eduarda", description: "", ownerId: 2, ownerName: "Eduarda", itemCount: 7, canEdit: true, canShare: false, canDelete: false, isOwner: false },
];
```

Atualizar o `beforeEach` e adicionar o teste novo:

```ts
describe("RoadmapList", () => {
  beforeEach(() => {
    listRoadmaps.mockReset(); listRoadmaps.mockResolvedValue(sample);
    listSharedRoadmaps.mockReset(); listSharedRoadmaps.mockResolvedValue(shared);
  });

  it('inicia na aba "Meus roadmaps" (carrega mine=true)', async () => {
    renderList();
    await waitFor(() => expect(listRoadmaps).toHaveBeenCalledWith(true));
    expect(screen.getByText("Roadmap VPS 2026")).toBeInTheDocument();
  });

  it('troca para "Todos os roadmaps" (carrega mine=false)', async () => {
    renderList();
    await waitFor(() => expect(listRoadmaps).toHaveBeenCalledWith(true));
    await userEvent.click(screen.getByText("Todos os roadmaps"));
    await waitFor(() => expect(listRoadmaps).toHaveBeenCalledWith(false));
  });

  it('mostra "Compartilhados comigo" ao trocar de aba', async () => {
    renderList();
    await waitFor(() => expect(listRoadmaps).toHaveBeenCalledWith(true));
    await userEvent.click(screen.getByText("Compartilhados comigo"));
    await waitFor(() => expect(listSharedRoadmaps).toHaveBeenCalled());
    expect(screen.getByText("Roadmap da Eduarda")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npx vitest run src/pages/RoadmapList.test.tsx'
```
Expected: FAIL (não existe aba "Compartilhados comigo" nem `listSharedRoadmaps` no componente).

- [ ] **Step 3: Implementar a aba no componente**

Em `frontend/src/pages/RoadmapList.tsx`:

Trocar o tipo `Tab` (linha 9):
```ts
type Tab = "mine" | "shared" | "all";
```

Trocar a função `load` (linhas 21–28) por uma que escolhe a fonte conforme a aba:
```ts
  const load = useCallback((t: Tab) => {
    setLoading(true);
    setErr(null);
    const source =
      t === "shared" ? api.listSharedRoadmaps() : api.listRoadmaps(t === "mine");
    source
      .then(setRoadmaps)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);
```

Adicionar o botão da aba entre "Meus roadmaps" e "Todos os roadmaps" (no bloco de tabs, ≈ linha 47):
```tsx
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>Meus roadmaps</TabButton>
        <TabButton active={tab === "shared"} onClick={() => setTab("shared")}>Compartilhados comigo</TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>Todos os roadmaps</TabButton>
```

Atualizar a mensagem de lista vazia (≈ linhas 56–60) para cobrir a aba nova:
```tsx
            {tab === "mine"
              ? 'Você ainda não criou nenhum roadmap. Clique em "+ Novo roadmap".'
              : tab === "shared"
              ? "Ninguém compartilhou um roadmap com você ainda."
              : "Nenhum roadmap cadastrado."}
```

Trocar o selo do card: hoje mostra "seu" quando `canEdit`. Passar a distinguir dono de compartilhado (≈ linha 67):
```tsx
                {rm.isOwner
                  ? <span style={ownerBadge}>seu</span>
                  : rm.canEdit
                  ? <span style={sharedBadge}>compartilhado</span>
                  : null}
```

Adicionar o estilo `sharedBadge` junto de `ownerBadge` (≈ linha 140):
```ts
const sharedBadge: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#166534",
  padding: "2px 7px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.05em",
};
```

- [ ] **Step 4: Rodar e ver passar**

Run:
```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npx vitest run src/pages/RoadmapList.test.tsx'
```
Expected: 3 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/RoadmapList.tsx frontend/src/pages/RoadmapList.test.tsx
git commit -m "feat(web): aba 'Compartilhados comigo' na lista de roadmaps"
```

---

## Task 7: Diálogo de compartilhamento + botão na tela do roadmap

**Files:**
- Create: `frontend/src/components/ShareDialog.tsx`
- Create: `frontend/src/components/ShareDialog.test.tsx`
- Modify: `frontend/src/pages/RoadmapView.tsx`

- [ ] **Step 1: Escrever o teste do diálogo (falha primeiro)**

Criar `frontend/src/components/ShareDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Collaborator } from "../api";

const listCollaborators = vi.fn();
const addCollaborator = vi.fn();
const removeCollaborator = vi.fn();
vi.mock("../api", () => ({ api: {
  listCollaborators: (id: number) => listCollaborators(id),
  addCollaborator: (id: number, input: any) => addCollaborator(id, input),
  removeCollaborator: (id: number, uid: number) => removeCollaborator(id, uid),
  updateCollaborator: vi.fn(),
} }));

import ShareDialog from "./ShareDialog";

const existing: Collaborator[] = [
  { userId: 2, name: "Marcus Januário", email: "marcus.januario@locaweb.com.br", canEdit: true, canShare: false },
];

describe("ShareDialog", () => {
  beforeEach(() => {
    listCollaborators.mockReset(); listCollaborators.mockResolvedValue(existing);
    addCollaborator.mockReset();
    removeCollaborator.mockReset(); removeCollaborator.mockResolvedValue(undefined);
  });

  it("lista os colaboradores atuais", async () => {
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalledWith(9));
    expect(screen.getByText("Marcus Januário")).toBeInTheDocument();
  });

  it("convida por e-mail com a permissão escolhida", async () => {
    addCollaborator.mockResolvedValue({ userId: 3, name: "Novo", email: "novo@x.com", canEdit: true, canShare: false });
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText("e-mail do convidado"), "novo@x.com");
    await userEvent.click(screen.getByRole("button", { name: /convidar/i }));
    await waitFor(() => expect(addCollaborator).toHaveBeenCalledWith(9, { email: "novo@x.com", canEdit: true, canShare: false }));
  });

  it("mostra o aviso quando o e-mail não tem conta", async () => {
    addCollaborator.mockRejectedValue(new Error("Não há conta com esse e-mail. Solicite o cadastro a marcus.januario@locaweb.com.br."));
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(listCollaborators).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText("e-mail do convidado"), "ninguem@x.com");
    await userEvent.click(screen.getByRole("button", { name: /convidar/i }));
    await waitFor(() => expect(screen.getByText(/Solicite o cadastro a marcus\.januario@locaweb\.com\.br/i)).toBeInTheDocument());
  });

  it("remove um colaborador", async () => {
    render(<ShareDialog roadmapId={9} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Marcus Januário")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /remover Marcus/i }));
    await waitFor(() => expect(removeCollaborator).toHaveBeenCalledWith(9, 2));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npx vitest run src/components/ShareDialog.test.tsx'
```
Expected: FAIL (componente não existe).

- [ ] **Step 3: Implementar o `ShareDialog`**

Criar `frontend/src/components/ShareDialog.tsx`:

```tsx
import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import type { Collaborator } from "../api";

export default function ShareDialog({ roadmapId, onClose }: { roadmapId: number; onClose: () => void }) {
  const [collabs, setCollabs] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [canShare, setCanShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.listCollaborators(roadmapId)
      .then(setCollabs)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [roadmapId]);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    const e = email.trim().toLowerCase();
    if (!e) { setErr("Informe um e-mail"); return; }
    setBusy(true); setErr(null);
    try {
      const created = await api.addCollaborator(roadmapId, { email: e, canEdit, canShare });
      setCollabs(prev => {
        const others = prev.filter(c => c.userId !== created.userId);
        return [...others, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setEmail("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Collaborator) {
    try {
      await api.removeCollaborator(roadmapId, c.userId);
      setCollabs(prev => prev.filter(x => x.userId !== c.userId));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Compartilhar roadmap</h2>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          Convide pessoas por e-mail e escolha o que elas podem fazer.
        </div>

        <label style={lbl}>E-mail do convidado</label>
        <input
          aria-label="e-mail do convidado"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="pessoa@empresa.com.br"
          style={input}
        />

        <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
          <label style={chk}>
            <input type="checkbox" checked={canEdit} onChange={e => setCanEdit(e.target.checked)} />
            Pode editar
          </label>
          <label style={chk}>
            <input type="checkbox" checked={canShare} onChange={e => setCanShare(e.target.checked)} />
            Pode compartilhar
          </label>
        </div>

        {err && <div style={errBox}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={invite} disabled={busy} style={btnAccent}>{busy ? "Convidando…" : "Convidar"}</button>
        </div>

        <div style={{ marginTop: 20, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
          <div style={{ ...lbl, marginBottom: 10 }}>Pessoas com acesso</div>
          {loading && <div style={{ color: "#94a3b8", fontSize: 13 }}>Carregando…</div>}
          {!loading && collabs.length === 0 && (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Ninguém além do dono tem acesso de edição.</div>
          )}
          {collabs.map(c => (
            <div key={c.userId} style={row}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{c.email}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {c.canEdit ? "Edita" : "Leitura"}{c.canShare ? " · Compartilha" : ""}
                </div>
              </div>
              <button aria-label={`remover ${c.name}`} onClick={() => remove(c)} style={btnGhostDanger}>Remover</button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhostDark}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex",
  alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000,
};
const modalCard: React.CSSProperties = {
  background: "#fff", borderRadius: 14, padding: 28, width: 480, maxWidth: "100%",
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#64748b",
  letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
  fontSize: 14, outline: "none", background: "#f8fafc", color: "#0f172a", boxSizing: "border-box",
};
const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#0f172a", cursor: "pointer" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" };
const errBox: React.CSSProperties = { marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, borderRadius: 6 };
const btnAccent: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhostDark: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhostDanger: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" };
```

- [ ] **Step 4: Rodar o teste do diálogo — ver passar**

Run:
```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npx vitest run src/components/ShareDialog.test.tsx'
```
Expected: 4 testes PASS.

- [ ] **Step 5: Ligar o diálogo na tela do roadmap**

Em `frontend/src/pages/RoadmapView.tsx`:

Importar o diálogo (após a linha 7):
```tsx
import ShareDialog from "../components/ShareDialog";
```

Adicionar estado (junto dos outros `useState`, ≈ linha 34):
```tsx
  const [sharing, setSharing] = useState(false);
```

Adicionar derivados ao lado de `canEdit` (≈ linha 38):
```tsx
  const canShare = !!roadmap?.canShare;
  const canDelete = !!roadmap?.canDelete;
```

No bloco de `actions` do `AppHeader` (≈ linhas 174–182), passar a usar `canDelete` para o botão de excluir e adicionar o botão "Compartilhar" para quem tem `canShare`. Substituir o bloco `{canEdit ? (...) : (...)}` por:
```tsx
            {canEdit ? (
              <>
                <button onClick={() => setCreating(true)} style={btnAccent}>+ Nova iniciativa</button>
                <button onClick={() => setRenaming(true)} style={btnLight}>Renomear</button>
                {canShare && <button onClick={() => setSharing(true)} style={btnLight}>Compartilhar</button>}
                {canDelete && <button onClick={() => setDeleting(true)} style={btnDanger}>Excluir roadmap</button>}
              </>
            ) : (
              <>
                <span style={readOnlyBadge}>🔒 Somente leitura — roadmap de {roadmap?.ownerName}</span>
                {canShare && <button onClick={() => setSharing(true)} style={btnLight}>Compartilhar</button>}
              </>
            )}
```

Renderizar o diálogo junto dos outros modais (após o bloco `{deleting && ...}`, ≈ linha 250):
```tsx
      {sharing && roadmap && (
        <ShareDialog roadmapId={roadmap.id} onClose={() => setSharing(false)} />
      )}
```

- [ ] **Step 6: Type-check + suíte de frontend inteira**

Run:
```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npx tsc -b && mise x -- npx vitest run'
```
Expected: type-check limpo e todos os testes PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ShareDialog.tsx frontend/src/components/ShareDialog.test.tsx frontend/src/pages/RoadmapView.tsx
git commit -m "feat(web): diálogo de compartilhamento e botão Compartilhar no roadmap"
```

---

## Task 8: Documentação (PRD, ADR, TASKS)

**Files:**
- Modify: `docs/PRD.md`
- Create: `docs/adr/010-compartilhamento-colaboradores.md`
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Atualizar o PRD**

Em `docs/PRD.md`, no "Modelo de propriedade", acrescentar a noção de colaboradores; ajustar o item que diz "Somente o dono edita/apaga/reordena" para refletir que **colaboradores com permissão também editam/renomeiam**, mas **só o dono exclui**. Acrescentar à seção "Lista de roadmaps" a aba **"Compartilhados comigo"** e, na "Visualização do roadmap", o botão **"Compartilhar"** e o diálogo de colaboradores. Remover de "Fora de escopo (versão 1)" o trecho "compartilhamento granular" (passa a estar no escopo).

- [ ] **Step 2: Criar o ADR**

Criar `docs/adr/010-compartilhamento-colaboradores.md`:

```markdown
# 010 - Compartilhamento por colaboradores com permissões granulares

**Status:** Accepted

## Context
O modelo do ADR 007 (autorização por propriedade) só permite que o dono edite o
roadmap. Surgiu a necessidade de o dono permitir que outras pessoas editem o
roadmap dele (ex.: Eduarda compartilha com Marcus).

## Decision
Introduzir a tabela `roadmap_collaborators (roadmap_id, user_id, can_edit,
can_share, created_by)`. A autorização de mutação passa a considerar
colaboradores: `RequireRoadmapEditor` (dono OU can_edit) libera itens e
renomear; `RequireRoadmapSharer` (dono OU can_share) libera a gestão de
colaboradores; `RequireRoadmapOwner` continua exigido só para excluir o
roadmap. Convite é por e-mail de conta existente; e-mail sem conta retorna 404
com orientação para solicitar o cadastro a um admin.

## Rationale
Permissões independentes (`can_edit`, `can_share`) cobrem os casos pedidos sem
introduzir papéis rígidos. Manter a exclusão exclusiva do dono evita perda de
trabalho por engano. Reaproveitar contas existentes respeita o "sem
auto-cadastro" do ADR 002.

## Trade-offs
**Pros:**
- Colaboração real mantendo o dono no controle do que é destrutivo.
- Aditivo: nenhuma mudança em dados existentes.

**Cons:**
- Mais um eixo de autorização para cobrir em testes.
- `can_share` permite a um colaborador convidar/remover outros (menos o dono).

## Alternatives Considered
- Papéis fixos por roadmap (viewer/editor/admin): mais rígido que duas flags.
- Transferência de propriedade: fora de escopo nesta fase.
```

- [ ] **Step 3: Atualizar TASKS**

Em `docs/TASKS.md`, registrar a fase de compartilhamento como concluída (tabela `roadmap_collaborators`, middlewares, endpoints de colaboradores, aba "Compartilhados comigo", diálogo de compartilhamento) com status `Done`.

- [ ] **Step 4: Commit**

```bash
git add docs/PRD.md docs/adr/010-compartilhamento-colaboradores.md docs/TASKS.md
git commit -m "docs: PRD, ADR 010 e TASKS do compartilhamento de roadmaps"
```

---

## Task 9: Verificação visual e fechamento

**Files:** nenhum (verificação)

- [ ] **Step 1: Subir os serviços**

Banco (já deve estar de pé), backend e Vite, em background:
```bash
# Backend
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && DEV_MODE=1 mise x -- go run ./cmd/server'
# Frontend (outro terminal/back-ground)
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npm install && mise x -- npm run dev'
```
Descobrir a porta do Vite na saída (linha `Local:`).

- [ ] **Step 2: Setup do Playwright (se ainda não feito)**

```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/e2e" && mise x -- npm install && mise x -- npx playwright install chromium'
```

- [ ] **Step 3: Screenshot da lista (com a aba nova) e do diálogo**

Para rota autenticada, usar um script que faz `POST /api/dev/login` e navega. Capturar:
1. A tela inicial `/` mostrando as três abas (incluindo "Compartilhados comigo").
2. A tela de um roadmap próprio com o botão "Compartilhar".
3. O diálogo de compartilhamento aberto.

Ler cada screenshot com a ferramenta Read e revisar alinhamento, espaçamento, contraste e legibilidade. Corrigir o que destoar e repetir.

- [ ] **Step 4: Rodar as duas camadas de teste de novo (gate final)**

```bash
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && mise x -- go test ./...'
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npx tsc -b && mise x -- npx vitest run'
```
Expected: tudo PASS.

- [ ] **Step 5: Commit final (se a verificação visual gerou ajustes) e push**

```bash
git add -A
git commit -m "chore: ajustes de verificação visual do compartilhamento" # se houver mudanças
git push
```

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura da spec:** modelo de permissões (Tasks 2–4), excluir só dono (rota mantém `ownerM`, testado na Task 3), convite por e-mail + aviso 404 (Task 3), aba "Compartilhados comigo" (Task 6), tabela `roadmap_collaborators` (Task 1), endpoints (Task 3), flags do DTO (Tasks 3–4), frontend/diálogo (Task 7), testes (Tasks 3,4,6,7), docs (Task 8). Sem lacunas.
- **Regra "can_share não remove o dono":** coberta por `TestCannotRemoveOwnerAsCollaborator` e pela checagem em `removeCollaborator`.
- **Consistência de nomes:** `roadmapDTO` ganha `CanShare/CanDelete/IsOwner` na Task 3 Step 6 e é usado assim em todas as tasks seguintes; tipos de frontend `Roadmap`/`Collaborator` definidos na Task 5 e usados nas Tasks 6–7. Métodos de API (`listSharedRoadmaps`, `listCollaborators`, `addCollaborator`, `updateCollaborator`, `removeCollaborator`) consistentes entre api.ts e os componentes.
- **Placeholders:** o `addCollab` ilustrativo no Task 3 Step 1 está marcado para remoção; nota explícita sobre `CreatedBy` (`*int64` vs `pgtype.Int8`) a confirmar no código gerado.
```
