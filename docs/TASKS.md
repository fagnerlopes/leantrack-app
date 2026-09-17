# Tasks

| Task | Status | Notas |
|------|--------|-------|
| Configurar repositório, mise.toml, .env, .gitignore | Done | JWT_SECRET gerado, admin seed configurado |
| Container Postgres (supabase/postgres) via podman | Done | `leantrack-app-db` na porta 5432 |
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
| Deploy preview Locaweb Cloud | Done | Ambiente `leantrack` (zona ZP02); deploy automático a cada push na `main`. A URL é o `<IP-da-VM>.nip.io` do ambiente publicado (`/up` → 200). |

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
| Migração 005 — backfill (DML idempotente) | Done | Garante Ana, cria "Roadmap Plataforma 2026", move itens; verificado: 0 órfãos |
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

| Senha inicial para admins fixos (acesso ao ambiente publicado) | Done | `SetInitialAdminPasswords` no startup preenche `password_hash` dos admins sem senha local (os admins fixos) com o segredo `SEED_ADMIN_PASSWORD`; idempotente; teste de integração `TestSetInitialAdminPasswords`. Ver nota no ADR 008 |
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
| Endpoints de colaboradores | Done | GET/POST `/api/roadmaps/{id}/collaborators`, PUT/DELETE `/api/roadmaps/{id}/collaborators/{userId}`; convite por e-mail de conta existente (404 amigável se não houver conta → solicitar a um administrador); upsert de permissões; remoção nunca atinge o dono |
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
| Deploy das melhorias | Done | Publicado no `<IP-da-VM>.nip.io` do ambiente; `GET /up` 200. Backup manual pré-deploy validado (`/data/backups/predeploy-20260612-153710.dump`, 12 tabelas) |
| Backup automático no pipeline de deploy | Done | Passo "Backup database before deploy" em `deploy-roadmap.yml`: `pg_dump -Fc` antes do `kamal setup`, salvo em `/data/backups` + artefato `db-backup-<ts>` (90 dias); pulado no 1º deploy, bloqueante se falhar com banco existente. ADR 012; CLAUDE.md atualizado |

## Sessão 12/06/2026 (tarde) — Ícones lucide-react e menu de ações do roadmap

ADR: 013 (biblioteca de ícones lucide-react + menu de ações em dropdown)

| Task | Status | Notas |
|------|--------|-------|
| Instalar `lucide-react` | Done | `lucide-react@1.18.0` em `frontend/package.json` |
| Substituir todos os emojis/glyphs por ícones lucide | Done | `⚠`→`AlertTriangle`, `⚡`→`Zap`, `✓`→`Check`, `🔗`→`ExternalLink`, `🔒`→`Lock`, `←`→`ArrowLeft`, `→`→`ArrowRight`, `↳`→`CornerDownRight`, `×`→`X`. `RISK_META.icon` (string) virou `RISK_META.Icon` (componente `LucideIcon`) em `roadmap-utils.ts`; afeta `Gantt.tsx`. `+ Nova iniciativa` mantém o `+` ASCII (não é emoji) |
| Componente `Toast` com ícone de check | Done | `components/Toast.tsx`; substitui os `<div>` de toast duplicados em `RoadmapView`, `Profile` e `Users` e o `✓` textual das mensagens |
| Menu de ações em dropdown (Renomear/Compartilhar/Excluir) | Done | `components/ActionMenu.tsx`; disparado por botão de **9 pontos** (grade 3×3 em SVG — o lucide não tem equivalente exato), à direita de "Exportar PDF". Fecha por clique-fora e Esc. Itens montados conforme permissões (`canEdit`/`canShare`/`canDelete`); some quando não há nenhuma ação. Removidos os botões soltos do `AppHeader` |
| Ajuste dos testes do RoadmapView | Done | `RoadmapView.test.tsx` agora abre o menu "Ações" antes de buscar os itens (`menuitem` Renomear/Compartilhar/Excluir roadmap); modo leitura verifica ausência do botão "Ações" |
| Type-check + testes | Done | `tsc -b` limpo; 32/32 Vitest verdes; `go build`/`go test ./...` verdes (backend inalterado) |
| Verificação visual (Playwright) | Done | 3 screenshots revisadas: visão geral (ícones de risco, chips, setas, link de épico), menu de 9 pontos aberto, modal com X de fechar |

## Sessão 12/06/2026 (tarde) — Timeline dinâmica e arrastável

ADR: 014 (timeline dinâmica derivada das datas das iniciativas)

| Task | Status | Notas |
|------|--------|-------|
| `buildTimeline(items)` substitui a base fixa de maio/2026 | Done | `roadmap-utils.ts`: removidos `MONTHS`/`TOTAL_MONTHS`/`QUARTERS`/`TODAY_FRAC`/`base=(2026-1)*12+5`. Intervalo = min/max de `startDate`/`endDate`/`extMilestone`, 1 mês de folga, arredondado para trimestre cheio; fallback em torno de hoje sem datas |
| Gantt recebe `timeline` por prop | Done | meses/trimestres/conversores e marcador "Hoje" vêm do objeto `Timeline`; "Hoje" só desenhado quando `todayInRange` |
| Arrastar a timeline (pan) + coluna de nomes fixa | Done | Pan via pointer events no contêiner com clamp e supressão do clique pós-pan; reordenação migrou para o puxador `GripVertical` na coluna do nome; células da coluna "Iniciativa" viraram `position: sticky; left: 0` para não sumirem ao rolar |
| Rolagem inicial centralizada no "Hoje" | Done | `useLayoutEffect` posiciona `scrollLeft` no `todayFrac` (clamp nas bordas) ao montar/mudar a timeline |
| Filtro "Trimestre" dinâmico em `RoadmapView` | Done | dropdown e filtro usam `timeline.quarters`/`dateToFractional`; timeline calculada de todas as iniciativas (não das filtradas) para o intervalo ser estável |
| Testes Vitest | Done | `roadmap-utils.test.ts` reescrito p/ `buildTimeline` (9 casos, incl. o bug: iniciativa antes de maio fica visível); 36/36 Vitest verdes; `tsc -b` limpo; `go test ./...` verde (backend inalterado) |
| Verificação visual (Playwright) | Done | Roadmap de teste com iniciativa de jan/2026: timeline começa em Out'25 (antes de maio), trimestres dinâmicos, "Hoje" centralizado, pan e coluna de nomes fixa validados em 2 screenshots |

### Ajustes pós-verificação (mesma sessão)

| Task | Status | Notas |
|------|--------|-------|
| Pan não tinha o que arrastar em telas largas | Done | Largura mínima da coluna de mês 64px→110px (`COL_MIN_PX` no `Gantt.tsx`): períodos longos transbordam e ficam arrastáveis; curtos continuam preenchendo a largura (flex). Verificado em 1920px: scrollWidth 2540 > 1870, arrastar revela o início (Out'25) |
| Reordenar por arrastar não refletia na tela (bug pré-existente) | Done | `handleReorder` só trocava `sortOrder` sem reordenar o array; como o Gantt renderiza na ordem do array, só mudava após recarregar. Extraída `applyReorder()` (pura, reordena + reatribui sort_order em passos de 10, espelha `ORDER BY sort_order, id` do backend) com 3 testes; verificado via DnD nativo: "Lançamento GA" sobe acima de "Nova arquitetura" na hora |

### Conflito pan × reordenar (mesma sessão)

| Task | Status | Notas |
|------|--------|-------|
| Reordenar só pela célula do título (sem conflito com o pan) | Done | A célula do título virou o puxador (`draggable` + `data-reorder-handle`), excluída do pan via `isInteractive`; o ícone ⋮⋮ ficou só como pista visual. Arrastar o título reordena; arrastar o gráfico navega no tempo. Verificado por DnD nativo: ordem do grupo "Não iniciado" muda na hora; pan segue funcionando (scrollLeft 215→0) |

## Sessão 23/06/2026 — Reset de senha pelo admin e troca obrigatória

ADR: 015 (reset de senha pelo admin, política única e troca obrigatória no 1º acesso)

| Task | Status | Notas |
|------|--------|-------|
| Migração `008_must_change_password.sql` | Done | `users.must_change_password BOOLEAN NOT NULL DEFAULT false`; aditiva e idempotente — usuários/admins existentes seguem usando a senha atual |
| Política única de senha (12+ com complexidade) | Done | `auth.ValidatePassword` (back) e `lib/password.ts` (front): mín. 12 + maiúscula/minúscula/número/símbolo, teto 72 bytes (bcrypt). Substitui as regras divergentes de 8 (perfil) e 6 (criação) |
| Endpoint admin de reset | Done | `PUT /api/admin/users/{id}/password` (RequireAdmin): define senha temporária, sem senha antiga, e marca `must_change_password=true`. Query `ResetUserPassword` |
| Endpoint de troca própria | Done | `POST /api/auth/change-password` (autenticado): define nova senha e limpa a marca. `UpdateOwnName`/`UpdateOwnPassword` ajustados — `UpdateOwnPassword` agora zera a marca |
| Criação já força troca | Done | `CreateUser` insere `must_change_password=true`; criação passou a usar a política forte |
| Marca na sessão | Done | `SessionUser.mustChangePassword`; `GetUserByEmail` e `GetSession` retornam a coluna; login e `me` carregam o valor |
| Gerador de senha temporária + UI | Done | `lib/password.ts:generatePassword` (Fisher–Yates com `crypto.getRandomValues`, sem 0/1/I/O/l). Botão "Resetar senha" por linha em `Users.tsx` + `ResetPasswordModal` (copiar/gerar-outra/Keeper); gerador também no modal de criação |
| Tela bloqueante `/trocar-senha` | Done | `ForcePasswordChange.tsx` + guard no `App.tsx`: enquanto `mustChangePassword`, qualquer rota redireciona para lá; só libera o app após definir a senha. Alerta de Keeper em destaque |
| Alerta de Keeper nas trocas | Done | Tela de 1º acesso, modais de reset/criação e seção de senha do Perfil orientam salvar a senha no Keeper (não há recuperação por e-mail) |
| Testes | Done | Back: `auth.ValidatePassword` (tabela) + integração `TestAdminResetPasswordFlow`/`TestResetPasswordRequiresAdmin`; `TestUpdateProfile` migrado p/ a política nova. Front: `lib/password.test.ts`, `ForcePasswordChange.test.tsx`, reset em `Users.test.tsx`, `Profile.test.tsx` migrado. `go test ./...` verde; 50/50 Vitest; `tsc -b` limpo |
| Verificação visual (Playwright) | Done | 5 screenshots: lista com "Resetar senha", modal de reset (senha gerada + Keeper), modal de criação, Perfil com alerta Keeper, e a tela bloqueante `/trocar-senha` (login do alvo redireciona corretamente) |

## Sessão 11/08/2026 — Admin transfere propriedade e gerencia compartilhamento

ADR: 016 (admin transfere a propriedade de roadmaps e gerencia o compartilhamento)

Motivação: colaboradores saíram da empresa e os roadmaps de que eram donos ficaram
órfãos — ninguém consegue editá-los nem conceder acesso a um substituto.

| Task | Status | Notas |
|------|--------|-------|
| Queries `AdminListRoadmaps` / `TransferRoadmapOwner` / `CountRoadmapsByOwnerAndName` | Done | `queries/roadmaps.sql`; a listagem traz nome + **e-mail** do dono (identifica a conta de quem saiu) e as contagens de iniciativas e colaboradores. Sem migração — nenhuma coluna nova |
| `GET /api/admin/roadmaps` | Done | RequireAdmin; lista todos os roadmaps ordenados por dono e nome |
| `PUT /api/admin/roadmaps/{id}/owner` | Done | RequireAdmin; body `{newOwnerId, keepPreviousAsCollaborator}`. Remove o vínculo de colaborador do novo dono (evita duplicidade em "pessoas com acesso"); mantém o dono anterior como colaborador (edita, não compartilha) quando pedido |
| Conflito `UNIQUE (owner_id, name)` tratado como 409 | Done | Checagem **antes** do UPDATE (`CountRoadmapsByOwnerAndName`): mensagem legível em vez do 23505 — que, além de mensagem ruim, aborta a transação em curso. Tratamento de 23505 mantido como rede contra corrida. O vínculo do dono anterior é criado antes do UPDATE e desfeito se ele falhar |
| `RequireRoadmapSharer` aceita admin | Done | `auth.go`: dono OU `can_share` OU `role == "admin"`. `RequireRoadmapEditor` e `RequireRoadmapOwner` **inalterados** — o admin não ganha edição de conteúdo nem exclusão |
| `canShare = true` para admin nos DTOs | Done | `listRoadmaps`, `getRoadmap` e `listSharedRoadmaps`: o botão "Compartilhar" aparece ao admin em qualquer roadmap |
| Tela `/admin/roadmaps` | Done | `pages/AdminRoadmaps.tsx`: tabela (roadmap, dono + e-mail, iniciativas, colaboradores), filtro por texto, modal de transferência (select de pessoas sem o dono atual + caixa "manter como colaborador") e reúso do `ShareDialog` em "Gerenciar acesso" |
| Navegação | Done | Botão "Administrar roadmaps" no cabeçalho da lista de roadmaps e da tela de Usuários (só para admin); rota `adminOnly` no `App.tsx` |
| Testes backend | Done | `admin_roadmaps_test.go`: 8 casos — exige admin (403/401), listagem com e-mail e contagens, transferência derrubando o dono anterior, transferência mantendo-o como colaborador, remoção do vínculo do novo dono, validações (404/400 em tabela), conflito de nome 409 sem deixar rastro, e admin gerencia acesso **sem** poder renomear/excluir. `go test ./...` verde |
| Testes frontend | Done | `AdminRoadmaps.test.tsx`: 8 casos (listagem, filtro por dono, transferência com e sem manter o anterior, dono atual ausente das opções, validação de campo obrigatório, erro 409 do servidor exibido, abertura do ShareDialog do roadmap certo). 58/58 Vitest verdes; `npm run build` (tsc -b + vite) limpo |
| Verificação visual (Playwright) | Done | `e2e/screenshot-admin-roadmaps.mjs`; 4 screenshots revisadas: cabeçalho com o novo botão, painel, modal de transferência e diálogo de acesso aberto pelo admin |
| Teste funcional ponta a ponta | Done | Contra o app rodando: transferência ida e volta no banco local (dono e colaboradores conferidos via psql), e 409 real ao mandar um roadmap homônimo para quem já tem um. Estado do banco local restaurado |
| Aviso no PRD sobre remoção de conta | Done | Remover usuário apaga os roadmaps dele (`ON DELETE CASCADE`) — o PRD agora orienta transferir antes de remover, e o fluxo de offboarding foi documentado |

## Sessão 24/08/2026 — Régua de datas fixa ao rolar

ADR: 017 (régua de datas fixa: a tela do roadmap vira um "app shell")

Motivação: pedido dos usuários — em roadmaps longos, rolar até o meio da lista
fazia o cabeçalho de trimestres/meses sair de vista e as barras perdiam
referência temporal. Pediram que só a lista de iniciativas se movesse.

| Task | Status | Notas |
|------|--------|-------|
| Análise de viabilidade | Done | Três bloqueios mapeados: `overflow: hidden` do card, `overflowX: auto` (que torna o eixo Y `auto` por regra do CSS) e a rolagem estar na **página**, não no quadro. Conclusão: não dá para resolver com `sticky` solto — é troca do modelo de rolagem |
| `RoadmapView` como app shell | Done | Raiz `.rm-shell` (`100dvh` + `overflow: hidden`); cabeçalho, filtros, dica e legenda como faixas fixas; área do Gantt em `.rm-main` (`flex: 1; min-height: 0`). A dica saiu de dentro da área que rola para o rodapé |
| Quadro do Gantt como único scroller | Done | `.rm-gantt-card` (coluna flex, altura cheia) + `.rm-gantt-scroll` (`overflow: auto`), marcados com `data-gantt-scroll` / `data-gantt-content` |
| Régua fixa no topo | Done | Trimestres e meses num wrapper `sticky; top: 0; z-index: 30` — juntos, para não medir a altura de uma faixa para posicionar a outra. z-index abaixo do menu de ações (50) |
| Selo "Hoje" fixo na base | Done | Rodapé do quadro virou `sticky; bottom: 0` |
| `AppHeader` fixo | Done | `position: sticky; top: 0; z-index: 80` — vale para lista de roadmaps e usuários, que continuam rolando a página |
| Contingência em telas pequenas | Done | Media query `(max-height: 600px), (max-width: 700px)` desfaz o shell: a página volta a rolar por inteiro. Piso de ~320px de área útil para a lista |
| Exportação PNG/PDF sem corte | Done | `captureGantt` solta altura/largura/`flex` do card **e** da área de rolagem antes de fotografar e restaura tudo depois (inclusive `scrollLeft`/`scrollTop`). O `flex: none` era o que faltava: sem ele o flex comprimia o card de volta ao tamanho visível e a foto saía cortada na vertical |
| Testes | Done | Novo `Gantt.test.tsx` (4 casos: um único scroller, régua `sticky` no topo com as duas faixas juntas, ganchos do export, z-index < 50) + caso de estrutura do shell em `RoadmapView.test.tsx`. 63/63 Vitest; `tsc -b` limpo; `go test -count=1 ./...` verde; lint sem erro novo |
| Verificação visual (Playwright) | Done | `e2e/screenshot-regua-fixa.mjs` **mede** a posição da régua antes/depois de rolar 700px: 1280×720 e 1440×900 → régua 0px, lista 700px, rolagem interna; 375×812 e 1280×560 → contingência (página rola). `e2e/screenshot-export-completo.mjs`: PNG 2540×1493 (visível era 1230×470), quadro restaurado, régua ainda fixa depois. `e2e/screenshot-header-fixo.mjs`: header fixo na lista com a página rolando |
| PRD atualizado | Done | Comportamento da régua fixa documentado; corrigidas duas referências obsoletas à janela fixa "Mai/26 → Mai/27" (o período é dinâmico desde o ADR 014) |

## Sessão 24/08/2026 — Ajuste de datas arrastando a barra

ADR: 018 (ajuste de datas arrastando a barra da iniciativa)

Motivação: pedido dos usuários — mudar datas exigia abrir a iniciativa e digitar
nos dois campos. Como início e fim mudam com frequência, replanejar um roadmap de
20 iniciativas virava dezenas de cliques. Pediram o gesto do monday.com: puxar as
alças do retângulo.

| Task | Status | Notas |
|------|--------|-------|
| Avaliação de biblioteca | Done | `dnd-kit`/`react-dnd` resolvem mover itens, não redimensionar pelas pontas; `interact.js`/`react-moveable` trabalham em pixels e brigariam com a captura de ponteiro do pan (ADR 017); Gantts prontos substituiriam o quadro inteiro. Decisão: Pointer Events nativos, reusando o padrão que o pan já usa. Zero dependência nova |
| Aritmética de datas em `roadmap-utils` | Done | `addDays`, `daysBetween`, `durationInDays` — tudo em **UTC**, senão um dia de horário de verão (23h ou 25h) faria o arrasto errar por um dia |
| Conversores inversos da timeline | Done | `fractionalToStartDate` / `fractionalToEndDate` no `Timeline`: posição fracionária → data. `Date.UTC` normaliza o estouro de dia (32 de julho vira 1º de agosto), então não há caso de borda |
| Regras do arrasto como funções puras | Done | `computeDragDates` (mouse) e `shiftDatesByDays` (teclado): duração preservada no modo "mover", pontas que nunca se cruzam (mínimo 1 dia) e nada escapa do intervalo da timeline. Fora do componente — testáveis sem navegador |
| Alças na barra | Done | `BarHandle` é `<button>` de verdade, com `aria-label` que nomeia a iniciativa. Envelope `rm-bar-wrap` posiciona no tempo e deixa as alças transbordarem 8px para continuarem pegáveis em barras estreitas; o visual foi para uma camada interna com `overflow: hidden` |
| Arrastar o corpo da barra | Done | Desloca início e fim juntos preservando a duração exata em dias — o caso mais comum ("a iniciativa toda escorregou duas semanas") |
| Robustez do gesto | Done | `setPointerCapture` (o arrasto sobrevive a sair da barra e da janela); limiar de 3px para distinguir clique de arrasto; clique pós-arrasto engolido no `onClickCapture`; origem fixa a cada quadro (o arredondamento para dia não se acumula); `Esc` desiste |
| Convivência com os gestos existentes | Done | Alças e barra marcadas com `data-bar-drag`, que o pan da timeline já ignora; `stopPropagation` no `pointerdown`. Reordenação pelo título e clique-para-editar inalterados |
| Rolagem automática nas bordas | Done | 56px de folga, 16px por quadro em `requestAnimationFrame`; o deslocamento da rolagem entra na conta da data, senão a barra escorregaria enquanto o quadro anda. É o que permite empurrar uma iniciativa para um trimestre fora da tela |
| Ajuste pelo teclado | Done | `←`/`→` na alça focada ajustam 1 dia, `Shift` 7. A sequência acumula no rascunho e sai numa **única** gravação (500ms) |
| Feedback visual | Done | Alças aparecem no hover por CSS (sem estado no React — e ficam fora das exportações PNG/PDF); durante o arrasto a barra ganha anel, a linha é tingida e um selo no topo do quadro mostra "início → fim · N dias". Em telas de toque as alças ficam sempre visíveis (`@media (hover: none)`) |
| Salvamento otimista | Done | `handleDatesChange` no `RoadmapView`: a lista muda na hora e é desfeita se o `PUT` falhar, com aviso. O rascunho só é descartado quando a gravação termina — a barra não pisca de volta. Sem mudança no backend (reusa `PUT /items/{id}`) |
| Testes | Done | 20 casos novos em `roadmap-utils.test.ts` (ida e volta posição↔data, ano bissexto, virada de ano, duração preservada, pontas que não se cruzam, limites da timeline) e 12 em `Gantt.test.tsx` (alças presentes/ausentes conforme permissão e datas, rótulos acessíveis, marcação anti-pan, ajuste por teclado, debounce, selo de leitura). 92/92 Vitest; `tsc -b` limpo; `go test ./...` verde; lint sem erro novo |
| Verificação visual e funcional (Playwright) | Done | `e2e/screenshot-arrastar-datas.mjs` faz o arrasto **de verdade** com o mouse e confere o resultado no banco pela API: 14 verificações — alças escondidas/visíveis, cada alça mexendo só na sua ponta, corpo preservando a duração, clique ainda abrindo a edição, arrasto **não** abrindo, seta do teclado, rolagem automática na borda e restauração das datas originais (o script é repetível). 7 screenshots revisadas |
| PRD atualizado | Done | Gesto documentado na visualização do roadmap e na edição de iniciativas |

## Sessão 01/09/2026 — Cloudflare Turnstile no login

ADR: 019 (Cloudflare Turnstile no login)

Motivação: o login é o único endpoint público e estava exposto a força bruta e
automação de credenciais.

| Task | Status | Notas |
|------|--------|-------|
| Config Turnstile (`TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`) | Done | `config.go`; secret key ausente desativa a verificação (dev/testes) |
| Endpoint público `GET /api/config/public` | Done | Expõe só a site key ao navegador (nunca segredos) |
| Verificação `siteverify` no login | Done | `turnstile.go` (`defaultTurnstileVerify` + `verifyLoginTurnstile`); token vazio/ausente com secret configurada → 403 antes de consultar o banco; `remoteip` via `X-Forwarded-For` |
| Widget Turnstile no `Login.tsx` (modo managed) | Done | `components/Turnstile.tsx` (carrega script `render=explicit`, callbacks de sucesso/expiração/erro, remove widget no unmount); token enviado em `turnstileToken`; submit bloqueado até o desafio resolver quando há site key; sem site key o login segue direto |
| Testes backend | Done | `turnstile_test.go`: no-op sem secret, token vazio reprova sem chamar o verificador, aprovado/reprovado/falha de infra + integração HTTP `TestLoginWithTurnstile` (sem token 403, aprovado 200, reprovado 403 com senha correta) + `TestPublicConfig`. `go test ./...` verde |
| Testes frontend | Done | `Login.test.tsx`: widget visível com site key, login direto sem site key, bloqueio até resolver o desafio, token enviado no login. 96/96 Vitest verdes; `tsc -b` limpo; lint sem erro novo (42 problemas pré-existentes) |
| Verificação visual e funcional (Playwright) | Done | `e2e/screenshot-turnstile.mjs`: widget renderiza e gera token (chaves de teste Cloudflare), `POST /api/auth/login` sem token → 403, com token de teste → 200 e redireciona. Screenshot 1440×900 revisado |
| Documentação (PRD, ADR 019, TASKS, INFRASTRUCTURE) | Done | Chaves de teste documentadas em INFRASTRUCTURE; `.env` local com as chaves de teste |

> **Nota para o deploy:** definir `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` reais
> (do painel Cloudflare) nos ambientes publicados. Enquanto não existirem, o login
> segue funcionando sem verificação (comportamento proposital — ver ADR 019).

## Sessão 17/09/2026 — repositório preparado como template de workshop

| Task | Status | Notas |
|------|--------|-------|
| Módulo Go renomeado para caminho neutro | Done | `leantrack/backend`; container local `leantrack-app-db` |
| `.env.example` criado | Done | Não existia; sem ele um clone não subia (`DATABASE_URL` e `JWT_SECRET` são obrigatórios) |
| Migrações contendo apenas esquema | Done | 005 removida (backfill do projeto original); 006 perdeu os INSERT de pessoas. Travado por `TestMigrationsCreateNoData` |
| `EnsureSeedUser` não sobrescreve senha | Done | `UpsertSeedUser` regravava `password_hash` em todo boot, desfazendo a troca de senha no deploy seguinte. `SetInitialAdminPasswords` removida |
| Conta inicial com troca de senha obrigatória | Done | Marcada apenas na criação |
| Dev login com consulta própria (`EnsureDevUser`) | Done | Sem senha e sem troca obrigatória, senão toda captura de tela cairia em `/trocar-senha`. Coberto por `TestDevLoginDoesNotForcePasswordChange` |
| Semeador de demonstração idempotente | Done | `seed.Demo`: 2 roadmaps, 10 iniciativas, 4 status, 3 estados de risco, cor, épico e dependência interna; só carrega em banco sem roadmaps |
| Identidades reais removidas do código e dos testes | Done | Marca, mensagem de erro voltada ao usuário, fixtures e scripts Playwright |
| Deploy parametrizado por participante | Done | Ambiente `leantrack`, sem domínio fixo: cada VM publica no próprio `<IP>.nip.io` |
| Turnstile mantido, desligado por padrão | Done | Verificado com `kamal secrets print` que os secrets ausentes resolvem para string vazia sem erro. Adendo no ADR 019 |
| `README.md` na raiz | Done | Não existia; é o contrato do template |
| Documentação despersonalizada | Done | PRD, TASKS, ADRs 001/002/008/009/010/012/019 |
| `docs/superpowers/` fora do versionamento | Done | Specs e planos são artefatos de processo |
