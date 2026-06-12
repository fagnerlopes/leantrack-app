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

## Sessão 09/06/2026 — Perfil do usuário (menu + troca de senha)

| Task | Status | Notas |
|------|--------|-------|
| Endpoint `PUT /api/auth/me` (atualizar perfil) | Done | Handler `updateProfile` (autenticado): valida nome (obrigatório, ≤200) e senha opcional (mín. 8). Senha em branco mantém a atual; preenchida regrava o `password_hash` (bcrypt) |
| Queries sqlc `UpdateOwnName` / `UpdateOwnPassword` | Done | Atualizam apenas a própria conta (por `id` da sessão) |
| `api.updateProfile` + `useAuth().updateUser` | Done | Método na `api.ts`; contexto de auth expõe `updateUser` para refletir o nome alterado na UI sem recarregar |
| Componente `UserMenu` (avatar de iniciais) | Done | `components/UserMenu.tsx`; avatar com iniciais do nome, menu suspenso (nome, e-mail, **Perfil**, **Sair**); fecha por clique-fora e Esc. Substitui "nome + Sair" nos cabeçalhos de RoadmapList e Users |
| Página `/perfil` | Done | `pages/Profile.tsx`; nome editável, e-mail somente leitura, nova senha + confirmar com botão Mostrar/Ocultar; mín. 8 e confirmação no cliente; toast de sucesso. Rota protegida (sem `adminOnly`) |
| Testes Go (`TestUpdateProfile`, `TestUpdateProfileRequiresAuth`) | Done | Cobrem: só nome (senha antiga preservada), nome vazio 400, senha curta 400, nova senha válida (antiga deixa de valer), 401 sem sessão. `go test ./...` verde |
| Testes Vitest (`Profile.test.tsx`) | Done | 5 testes: salva só o nome (password undefined), envia nova senha, bloqueia <8, bloqueia senhas diferentes, alterna mostrar/ocultar. 20 testes / 6 arquivos verdes; `tsc -b` ok |
| Verificação visual (Playwright) | Done | 3 screenshots revisadas: menu do usuário aberto, página de perfil, senha visível |

## Sessão 09/06/2026 — Header padronizado (avatar/menu em todas as rotas + botão voltar)

| Task | Status | Notas |
|------|--------|-------|
| Componente `AppHeader` compartilhado | Done | `components/AppHeader.tsx`; props `title`, `subtitle`, `back` e `actions`; sempre renderiza o `UserMenu` à direita. Consolida o cabeçalho slate (`#0f172a`) antes duplicado em cada página |
| Menu do usuário no RoadmapView | Done | A página de visualização/edição era a única sem `UserMenu` (mostrava só "nome + Sair"). Agora usa `AppHeader`, exibindo avatar + dropdown (Perfil/Sair) como nas demais rotas |
| Botão "voltar" mais intuitivo | Done | `BackButton` no `AppHeader`: pílula com borda e fundo (`#1e293b`/`#334155`), seta + rótulo "Roadmaps", realce e leve deslocamento da seta no hover. Substitui o link cinza-claro (`#94a3b8`) quase imperceptível do RoadmapView |
| Migração das 4 páginas para `AppHeader` | Done | `RoadmapList` (home, sem voltar), `RoadmapView`, `Profile` e `Users`; removidos `headerStyle`/`btnLight`/imports órfãos. `tsc -b` limpo |
| Testes + verificação visual | Done | 20 testes / 6 arquivos Vitest verdes (sem alterações de teste necessárias). 4 screenshots revisadas: lista, roadmap, menu aberto no roadmap, perfil — header idêntico em todas |

## Sessão 10/06/2026 — Compartilhamento de roadmaps com colaboradores

Spec: `docs/superpowers/specs/2026-06-10-compartilhamento-de-roadmaps-design.md` · ADR: 010 (compartilhamento por colaboradores — estende o 007)

| Task | Status | Notas |
|------|--------|-------|
| Migração — tabela `roadmap_collaborators` | Done | Aditiva e idempotente; PK composta `(roadmap_id, user_id)`, flags `can_edit`/`can_share`, `created_at`/`created_by`, índice por `user_id`; não cria linha para o dono |
| Middlewares de autorização (editor/sharer) | Done | `RequireRoadmapEditor` (dono OU `can_edit`) libera itens + renomear; `RequireRoadmapSharer` (dono OU `can_share`) libera gestão de colaboradores; `RequireRoadmapOwner` mantido só para excluir o roadmap |
| Endpoints de colaboradores | Done | GET/POST `/api/roadmaps/{id}/collaborators`, PUT/DELETE `/api/roadmaps/{id}/collaborators/{userId}`; convite por e-mail de conta existente (404 amigável se não houver conta → solicitar a marcus.januario@locaweb.com.br); upsert de permissões; remoção nunca atinge o dono |
| Listagem "Compartilhados comigo" | Done | GET `/api/roadmaps/shared` (autenticado) — roadmaps em que o usuário é colaborador, sem os próprios |
| Flags do DTO de roadmap | Done | `canEdit` (semântica ampliada: dono ou `can_edit`), `canShare`, `canDelete` (só dono), `isOwner` — em listagens e no `GET /api/roadmaps/{id}` |
| Aba "Compartilhados comigo" (`RoadmapList`) | Done | Terceira aba ao lado de "Meus roadmaps"/"Todos os roadmaps"; selo "COMPARTILHADO" no cartão |
| Diálogo de compartilhamento (`RoadmapView`) | Done | Botão "Compartilhar" (visível ao dono e a quem tem `can_share`); convidar por e-mail com chaves "Pode editar"/"Pode compartilhar", lista de acesso (dono marcado, sem remover) e remoção; exclusão gated por `canDelete`; colaborador `can_edit` entra em modo edição |
| Testes Go + Vitest | Done | Matriz de autorização (dono/editor/sharer/leitor/estranho), convite com e-mail inexistente, bloqueio de remoção do dono, upsert, listagem "compartilhados comigo"; Vitest: aba, diálogo, botão excluir oculto p/ não-dono, modo edição p/ colaborador |
| Documentação (PRD, ADR 010, TASKS) | Done | PRD: modelo de propriedade + permissões editar/compartilhar, aba "Compartilhados comigo" + selo, botão "Compartilhar" e diálogo, removido "compartilhamento granular" do fora de escopo |

## Sessão 12/06/2026 — Marcador "Hoje" dinâmico, legenda no rodapé e autocomplete de e-mail

ADR: 011 (busca de usuários para autocomplete do compartilhamento)

| Task | Status | Notas |
|------|--------|-------|
| Marcador "Hoje" calculado em runtime | Done | `roadmap-utils.ts`: `fractionalForDate`/`labelForDate` (puras) + `TODAY_FRAC`/`TODAY_LABEL`; antes o badge estava fixo em "25 Mai 2026". `Gantt.tsx` usa `TODAY_LABEL`. Verificado: badge mostra "Hoje · 12 Jun 2026" com a linha vermelha em junho |
| Legenda fixa no rodapé da página | Done | Extraída para `components/RoadmapLegend.tsx`; `RoadmapView` virou coluna flex (`minHeight:100vh`), conteúdo `flex:1` empurra a legenda para a base. Resolve a legenda "no meio da tela" em roadmaps com poucas/nenhuma iniciativa. Observação: como saiu do card do Gantt, a legenda não vai mais no PNG/PDF exportado |
| Autocomplete no campo de e-mail (compartilhamento) | Done | Busca a partir de 4 caracteres (debounce 250ms) por e-mail **ou** nome; oculta dono e colaboradores atuais. Backend: query `SearchUsersForRoadmap` + `GET /api/roadmaps/{id}/user-search?q=` (gated por `can_share`), curingas LIKE escapados. Frontend: dropdown nome+e-mail no `ShareDialog`, clique preenche o campo |
| Testes Go + Vitest | Done | Go `TestSearchUsersForRoadmap`: 403 sem `can_share`, vazio com <4 chars, casa e-mail/nome, exclui dono e colaboradores. Vitest: não busca com <4 chars, sugere a partir de 4 e preenche ao escolher. `go test` verde; `tsc -b` ok; 32+ testes Vitest verdes |
| Verificação visual (Playwright) | Done | 3 screenshots revisadas: badge "Hoje" dinâmico, legenda no rodapé com 0 iniciativas, dropdown de autocomplete |
| Regra de backup antes de publicar (CLAUDE.md) | Done | Adicionada a regra: sempre fazer backup do banco de produção antes de qualquer deploy |
