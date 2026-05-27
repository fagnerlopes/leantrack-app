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
