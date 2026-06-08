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
| Deploy preview Locaweb Cloud | Done | Ambiente `roadmap` (zona ZP02) no ar; deploy automático a cada push na `main`. URL: https://187.45.201.251.nip.io (`/up` → 200). Fases 1, 2 e 3 publicadas com sucesso. |

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

## Sessão 08/06/2026 (Fase 2) — Backend de roadmaps por usuário

Spec: `docs/superpowers/specs/2026-06-08-roadmaps-por-usuario-design.md` · ADRs: 007 (propriedade), 008 (auth desacoplada), 009 (rotas legadas em compat)

| Task | Status | Notas |
|------|--------|-------|
| Migração 006 — `users` SSO-ready + papéis + NOT NULL | Done | `password_hash` anulável; `auth_provider`/`external_id` + índice único parcial; `viewer`→`user` e default `user`; garante 3 admins fixos; `roadmap_items.roadmap_id` SET NOT NULL |
| Ajuste de login para senha anulável | Done | `GetUserByEmail` agora retorna `password_hash *string`; login rejeita usuário sem senha local |
| Interface `Authenticator` + `LocalAuthenticator` | Done | `auth.NewMiddleware(Authenticator, require)`; `Middleware` legado mantém a assinatura. Encaixe para `KeycloakAuthenticator` (ADR 008) |
| Middleware `RequireRoadmapOwner` (403 a não-donos) | Done | Lê `{id}`, carrega roadmap, exige `owner_id == sessão`; leitura não passa pela trava |
| Endpoints `/api/roadmaps*` (id; `?mine=true`; `can_edit`) | Done | List/Create/Get/Update/Delete; slug regenerado no rename; DELETE exige `confirmSlug` |
| Itens escopados `/api/roadmaps/{id}/items*` | Done | List/Create/Reorder/Update/Delete; mutação só do dono via `ownerM` |
| `/api/admin/users*` protegidos por `RequireAdmin` | Done | List/Create/Delete/UpdateRole; trava de "último admin" e auto-remoção |
| Queries sqlc (users admin, itens por roadmap, count, slug) | Done | `ListUsers/CreateUser/DeleteUser/UpdateUserRole/CountAdmins`, `ListItemsByRoadmap`, `CountItemsByRoadmap`, `GetRoadmapBySlug` |
| Rotas legadas `/api/items*` em compatibilidade | Done | Apontam para o roadmap institucional (ADR 009); removidas na Fase 3 |
| Testes Go: validação, gate admin, propriedade 403, slug, confirm_slug | Done | Unitários puros + integração (tx com rollback, guardada por `DATABASE_URL`); `go test ./...` e `go vet ./...` verdes |
| Verificação visual (Playwright: login, roadmap, admin) | Done | App segue funcional via rotas de compat; 17 itens renderizam |

> **Nota:** o frontend permanece inalterado nesta fase e continua consumindo
> `/api/items*` (compat). A migração para as rotas escopadas é a Fase 3.

## Sessão 08/06/2026 (Fase 3) — Frontend de roadmaps por usuário

Spec: `docs/superpowers/specs/2026-06-08-roadmaps-por-usuario-design.md` · ADRs: 007 (propriedade), 008 (auth desacoplada), 009 (rotas legadas — encerrado nesta fase)

| Task | Status | Notas |
|------|--------|-------|
| Setup Vitest + Testing Library + jsdom | Done | `vitest@4` (alinhado ao Vite 8/rolldown), `@testing-library/react`, setup em `src/test/setup.ts`; script `npm test`; types em `tsconfig.app.json` |
| `api.ts` reescrito (roadmaps + itens escopados + admin/users) | Done | Removidas as chamadas a `/api/items*`; tipos `Roadmap`, `AdminUser`, `RoadmapInput` |
| Helper de URL `/roadmaps/{id}-{slug}` (roteia pelo id) | Done | `roadmap-path.ts` (`roadmapPath`/`parseRoadmapId`); slug é só enfeite |
| Tela inicial "Meus roadmaps" / "Todos os roadmaps" | Done | `RoadmapList.tsx`; abas, cards "nome — dono · N iniciativas", selo "SEU", "+ Novo roadmap" + modal |
| Visão do roadmap: modo edição (dono) e leitura (não-dono) | Done | `RoadmapView.tsx`; Gantt + filtros + export reaproveitados; selo "🔒 Somente leitura — roadmap de {dono}" quando `canEdit=false` |
| Criar/renomear/excluir roadmap | Done | Criar abre em modo edição; renomear regenera slug no backend; exclusão por modal que só libera com o slug exato (`confirmSlug`) |
| Painel "Usuários" (somente admin) | Done | `Users.tsx`; listar/criar/remover/alterar papel; "Remover" desabilitado para a própria conta; guard de rota em `App.tsx` (`Protected adminOnly`) |
| Remoção das rotas legadas `/api/items*` no backend | Done | Removidos handlers legados, `institutionalRoadmapID` e `institutionalSlug`; `go vet`/`go test ./...` verdes (ADR 009 encerrado) |
| Testes frontend (Vitest) | Done | 15 testes / 5 arquivos: rota inicial "Meus roadmaps", modo leitura sem controles, modal de exclusão só com slug exato, painel de usuários só admin, helper de URL |
| Type-check + build de produção | Done | `tsc -b` e `vite build` passam |
| Verificação visual (Playwright) | Done | 7 screenshots: login, meus/todos roadmaps, modo leitura, painel de usuários, modo edição da dona — revisadas |

> **Nota:** com a Fase 3 concluída, o frontend consome exclusivamente as rotas
> escopadas por roadmap; as rotas de compatibilidade `/api/items*` deixaram de
> existir.

| Senha inicial para admins fixos (acesso ao ambiente publicado) | Done | `SetInitialAdminPasswords` no startup preenche `password_hash` dos admins sem senha local (fagner/marcus/eduarda) com o segredo `SEED_ADMIN_PASSWORD`; idempotente; teste de integração `TestSetInitialAdminPasswords`. Ver nota no ADR 008 |
| Cache-Control correto para SPA (evita app antigo após deploy) | Done | `index.html` servido com `no-cache` (sempre revalida); assets hasheados em `/assets/*` com `public, max-age=31536000, immutable`. Sintoma corrigido: navegador servia o frontend da Fase 2 em cache, que chamava `/api/items` (removido) → HTTP 404 |
