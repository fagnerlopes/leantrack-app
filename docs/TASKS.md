# Tasks

| Task | Status | Notas |
|------|--------|-------|
| Configurar repositório, mise.toml, .env, .gitignore | Done | JWT_SECRET gerado, admin seed configurado |
| Container Postgres (supabase/postgres) via podman | Done | `roadmap-tribo-cloud-db` na porta 5432 |
| Migrations (users, sessions, roadmap_items) | Done | `001_init.sql`, embedded e idempotente |
| sqlc queries: users + items | Done | `internal/database/sqlc/` gerado |
| Auth: bcrypt + sessões em DB + cookie HttpOnly | Done | TTL 7 dias |
| Handlers: login, logout, /me, items CRUD | Done | RequireAdmin para CRUD |
| Dev login `/api/dev/login` (apenas DEV_MODE) | Done | Para testes Playwright |
| Frontend scaffold Vite+React+TS | Done | Sem template defaults |
| Componente Gantt reaproveitando design do JSX original | Done | Inline styles, fiel ao original |
| Página `/login` | Done | Email + senha |
| Página `/` Roadmap com filtros (status, trimestre, risco) | Done | Filtros funcionais |
| Exportar PDF/PNG | Done | html-to-image + jspdf |
| Dashboard `/admin` com tabela + modal CRUD | Done | Apenas role admin |
| Proteção de rotas no client | Done | Componente `<Protected>` |
| Testes Go (auth + validação handler) | Done | `go test ./...` passa |
| Visual check Playwright (login, roadmap, admin) | Done | 3 screenshots revisadas |
| Dockerfile multi-stage | Done | Pronto para Locaweb Cloud |
| Documentação (PRD, TASKS, ADRs, INFRASTRUCTURE) | Done | — |
| Commit + push | Done | — |
| Deploy preview Locaweb Cloud | In Progress | Primeira tentativa falhou (orquestrador Locaweb retornou erro 530 ao criar VM web — estado parcial). Teardown executado, redisparando deploy. |
# Retry deploy attempt 19:31:45

## Sessão 27/05/2026 — novas features no roadmap

| Task | Status | Notas |
|------|--------|-------|
| Cor customizada por card (coluna `color` + color picker no modal) | Done | Migração 002, sanitização hex no backend, picker + paleta + botão "usar cor do status" no modal |
| Drag-and-drop para reordenar dentro do mesmo status | Done | Endpoint `PUT /api/items/reorder` (admin), HTML5 DnD nativo no Gantt, update otimista |
| Editar item clicando no card da visão Roadmap (somente admin) | Done | `ItemModal` extraído para `frontend/src/ItemModal.tsx`, reaproveitado em Roadmap e Admin |
| Bug visual: cards "invadindo" a próxima data | Done | `endDateToFractional` (end inclusivo) + remoção do piso de 0.5 mês na largura — barras curtas agora respeitam o calendário do próximo item |
| Testes Go (validação + sanitização de cor) | Done | `TestSanitizeColor` adicionado, `go test ./...` passa |
| Visual check Playwright (login, roadmap, admin, modal de edição via roadmap) | Done | 4 screenshots revisadas |

## Sessão 27/05/2026 (tarde) — link do épico

| Task | Status | Notas |
|------|--------|-------|
| Coluna `epic_url` em `roadmap_items` | Done | Migração 003, validação http(s) e tamanho no backend |
| Campo "Link do épico" no modal de cadastro | Done | `ItemModal.tsx` — input URL com placeholder |
| Botão 🔗 no card do Gantt (abre em nova aba) | Done | Ao lado do título, com `target="_blank"` e `rel="noopener noreferrer"` |
| Botão 🔗 também na coluna "Iniciativa" do dashboard admin | Done | Acesso rápido pela tabela |
| Build Go + tsc + go test | Done | Todos passam |
| Visual check Playwright (roadmap com botão visível) | Done | Screenshot revisado |

## Sessão 08/06/2026 — Roadmaps por usuário (Fase 1: fundação de dados)

Spec: `docs/superpowers/specs/2026-06-08-roadmaps-por-usuario-design.md` · Plano: `docs/superpowers/plans/2026-06-08-roadmaps-fase1-fundacao-dados.md`

| Task | Status | Notas |
|------|--------|-------|
| Helper `Slugify` (função pura, TDD) | Done | `internal/slugutil/`; dep `golang.org/x/text` direta |
| Migração 004 — tabela `roadmaps` + coluna `roadmap_id` (nullable) | Done | DDL aditivo/idempotente; índices `roadmaps_owner_idx`, `roadmap_items_roadmap_idx` |
| Queries sqlc de roadmaps (uso na Fase 2) | Done | `queries/roadmaps.sql` → List/ListMy/GetByID/Create/Update/Delete |
| Migração 005 — backfill (DML idempotente) | Done | Garante Eduarda, cria "Roadmap Squad Cloud 2026", move itens; verificado: 0 órfãos |
| Script de seed dev/preview a partir do backup | Done | `scripts/seed_dev.sh`; psql do PATH ou container `<repo>-db`. Testado: 17 itens do backup → vinculados |
| Suíte completa do backend | Done | `go test ./...` e `go vet ./...` verdes |
| ADR 007 (autorização por propriedade) + 008 (auth desacoplada p/ SSO) | Done | Numerados 007/008 (004 e 006 já existiam); spec os chama de 004/005 |
| Atualizar PRD e TASKS | Done | Modelo de roadmaps por usuário documentado |

> **Nota:** a Fase 1 é puramente aditiva no banco; a aplicação se comporta exatamente como antes (rotas e frontend inalterados — a coluna `roadmap_id` segue nullable até a Fase 2).

### Fase 2 — Backend (pendente)
- `users`: tornar `password_hash` anulável; adicionar `auth_provider`/`external_id` (migração — usar próximo número livre); ajustar login.
- Endpoints `/api/roadmaps*` e itens escopados `/api/roadmaps/{id}/items*`.
- Middleware `RequireRoadmapOwner` (403 a não-donos); leitura aberta.
- `/api/admin/users*` protegidos por `RequireAdmin`; seed dos 3 admins.
- Interface `Authenticator` (encaixe Keycloak).
- `SET NOT NULL` em `roadmap_items.roadmap_id`.
- Testes Go: slug→criação, propriedade (403), gate de admin.

### Fase 3 — Frontend (pendente)
- Setup Vitest + Testing Library.
- "Meus roadmaps" / "Todos os roadmaps"; criar roadmap.
- Roteamento por ID (`/roadmaps/{id}-{slug}`); modo leitura (flag `can_edit`) e modo edição.
- Modal de exclusão com confirmação por slug.
- Painel "Usuários" só para admins.
- Atualizar `frontend/src/api.ts`; remover chamadas a `/api/items*`.
- Verificação visual com Playwright.
