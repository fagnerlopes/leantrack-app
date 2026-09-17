# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- cofounder:begin -->
The cofounder operating instructions are maintained in @AGENTS.md — read and follow them.
<!-- cofounder:end -->

## Nomes herdados — não "corrigir"

O diretório e o repositório GitHub se chamam **leantrack-app**, mas nomes antigos
continuam válidos em três lugares e **não devem ser renomeados**:

| Onde | Nome atual | Por quê não mudar |
|------|-----------|-------------------|
| Módulo Go (`backend/go.mod`) | `github.com/fagnerlopes/roadmap-tribo-cloud/backend` | Renomear quebra todos os imports internos |
| Container Postgres local | `roadmap-tribo-cloud-db` (porta 5432) | Container já existe com os dados de dev |
| Ambiente Kamal / GHA | `roadmap` (`config/deploy.roadmap.yml`, `.kamal/secrets.roadmap`) | O nome identifica a infra já provisionada na Locaweb Cloud |

Existe também um `roadmap-tribo-cloud-db-local` na porta 5433 (banco secundário
de experimentos). O banco padrão é o da 5432.

## Comandos

Todas as ferramentas são invocadas via `mise x` (versões fixadas em `mise.toml`).
**`go.mod` está em `backend/`, não na raiz** — todo comando Go/sqlc precisa rodar
de dentro de `backend/`.

### Subir o ambiente local

```bash
# 1. Banco (o container já existe; `start` é idempotente)
podman start roadmap-tribo-cloud-db

# 2. Backend Go (porta 8080) — DEV_MODE habilita POST /api/dev/login
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && DEV_MODE=1 mise x -- go run ./cmd/server'

# 3. Frontend Vite (porta 5173, proxy /api → :8080) — é a URL de acesso do usuário
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npm run dev'
```

`.env` não é versionado. Variáveis lidas por `backend/internal/config/config.go`:

- **Obrigatórias:** `DATABASE_URL`, `JWT_SECRET` (o server aborta sem elas)
- **Com default:** `PORT` (8080), `BASE_URL` (`http://localhost:5173`), `SEED_ADMIN_EMAIL` (`admin@kinghost.com.br`), `SEED_ADMIN_PASSWORD` (`admin123`)
- **Opcionais:** `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (sem a secret key a verificação anti-bot é desativada; em dev use as chaves de teste do Cloudflare listadas em `docs/INFRASTRUCTURE.md`), `DEV_MODE`

Para popular o banco local a partir do backup mais recente em `backups/`:
`bash scripts/seed_dev.sh` (precisa de `DATABASE_URL` no ambiente).

### Testes

```bash
# Go — unitários + integração
bash -c 'cd "$(git rev-parse --show-toplevel)/backend" && mise x -- go test ./...'

# Um único teste Go
bash -c 'cd "$(git rev-parse --show-toplevel)/backend" && mise x -- go test ./internal/handler -run TestLoginWithTurnstile -v'

# Frontend (Vitest + jsdom)
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npm test'

# Um único arquivo / um único caso
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npm test -- src/pages/Login.test.tsx'
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npm test -- -t "nome do caso"'

# Lint e type-check do frontend
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npm run lint && mise x -- npm run build'
```

**Os testes de integração Go pulam silenciosamente sem `DATABASE_URL`**
(`TestMain` em `backend/internal/handler/integration_test.go`). Exporte a variável
antes de rodar `go test`, senão uma suíte inteira passa sem executar nada. Cada
teste de integração roda dentro de uma transação revertida no `Cleanup` — os dados
nunca persistem.

### sqlc (obrigatório após mexer em SQL)

```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/backend" && mise x -- sqlc generate'
```

Ordem: editar `internal/database/queries/*.sql` → `sqlc generate` → **ler os
arquivos gerados** em `internal/database/sqlc/` para conferir os nomes reais dos
structs/campos → escrever os handlers. Nunca escreva SQL como string em Go.

### Visual check (Playwright)

Os scripts em `e2e/` apontam para `http://localhost:5173` e autenticam via
`POST /api/dev/login` (só existe com `DEV_MODE`), então **os dois servidores
precisam estar rodando**. Cada script cobre uma feature e salva PNGs em `/tmp`:

```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/e2e" && mise x -- node screenshot.mjs'
```

Ao adicionar uma feature visível, crie um `e2e/screenshot-<feature>.mjs` seguindo
o padrão dos existentes.

## Arquitetura

### Um binário, um container

O Go serve tudo em produção: `/up`, `/api/*` e os arquivos estáticos do SPA.
`backend/cmd/server/main.go` monta o handler de topo em duas formas:

- **`DEV_MODE` ligado:** só o `apiMux`. O Vite serve o frontend e faz proxy de `/api`.
- **Produção:** um wrapper em volta do `apiMux` que delega `/api/*`, `/auth/*` e
  `/up` para a API, serve arquivos reais de `frontend/dist` e cai em
  `index.html` para as rotas do SPA.

Detalhes que já causaram bug e devem ser preservados nesse wrapper:

- `frontendDist` é a string literal `"frontend/dist"` — o `WORKDIR` do container
  é `/app`, com o binário e `frontend/dist` como irmãos (ver `Dockerfile`).
  Um `../frontend/dist` parece certo no repo local e dá 404 no container.
- Assets sob `/assets/` têm hash no nome → `Cache-Control: immutable` por 1 ano.
  `index.html` recebe `no-cache`, senão o deploy novo continua servindo o app antigo.

### Ciclo de vida do startup (`main.go`)

Retry de conexão ao Postgres (6 tentativas, backoff 1→32s) → `database.RunMigrations`
→ seed do admin (`UpsertSeedUser`) → `SetInitialAdminPasswords` (define a senha
inicial dos 3 admins fixos da migração 006, idempotente) → servidor escuta.
Tudo antes de aceitar tráfego.

### Migrations

`backend/internal/database/migrations/NNN_*.sql`, embutidas por `go:embed` em
`migrate.go` (o `go:embed` só aceita caminhos abaixo do próprio arquivo — por isso
o embed vive ali, não no `main.go`). O runner registra cada arquivo aplicado em
`schema_migrations` e aplica os pendentes em ordem alfabética. **Forward-only e
idempotentes** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).

### Modelo de dados

- `users` — `role` é `admin` ou `viewer`; `must_change_password` força a troca de senha temporária.
- `sessions` — token opaco em tabela, TTL 7 dias, entregue em cookie `session` HttpOnly.
- `roadmaps` — dono (`owner_id`), `name` + `slug`, único por `(owner_id, name)`.
- `roadmap_items` — tabela **flat**: a dependência externa são três colunas
  opcionais (`ext_team`, `ext_description`, `ext_milestone`) em vez de uma tabela
  1-N, e a dependência interna é o auto-relacionamento `dependency_id` (ADR 003).
- `roadmap_collaborators` — `(roadmap_id, user_id)` com duas permissões
  **independentes**: `can_edit` e `can_share`.

### Autorização — em camadas, não só no middleware

`backend/internal/auth/auth.go` define a matriz de permissões da aplicação. Os
middlewares são compostos na tabela de rotas (`handler.Routes()`), e cada nível
libera um conjunto diferente:

| Middleware | Quem passa | Para quê |
|-----------|-----------|----------|
| `Middleware` (`authM`) | qualquer logado | injeta `SessionUser` no contexto; leitura de roadmaps e itens |
| `RequireRoadmapEditor` | dono **ou** `can_edit` | mutação de itens, reordenar, renomear |
| `RequireRoadmapSharer` | dono, `can_share` **ou** admin | gestão de colaboradores (ADR 016) |
| `RequireRoadmapOwner` | só o dono | excluir o roadmap |
| `RequireAdmin` | `role == "admin"` | `/api/admin/*` (contas e transferência de propriedade) |

A assimetria é intencional: um admin gerencia o **acesso** a qualquer roadmap
(para destravar roadmaps órfãos) mas **não** edita conteúdo nem exclui roadmaps
alheios. `RequireRoadmapEditor` e `RequireRoadmapSharer` compartilham o helper
`roadmapAccess`, que resolve id → roadmap → colaborador e delega a decisão a um
predicado — adicione novos níveis por ali.

`Authenticator` é uma interface (`LocalAuthenticator` hoje) justamente para que um
`KeycloakAuthenticator` OIDC entre sem tocar no resto (ADR 008).

Política de senha única em `auth.ValidatePassword`: ≥12 caracteres com maiúscula,
minúscula, número e símbolo; máximo 72 bytes (limite do bcrypt). O frontend espelha
a regra em `frontend/src/lib/password.ts` — mude os dois juntos.

### Frontend — SPA Vite puro, estilos inline

Não é React Router framework mode, **não tem Tailwind e não tem shadcn/ui**. É um
Vite + React 19 clássico (`index.html` + `src/main.tsx`) com `react-router-dom` em
`BrowserRouter`, e a estilização é feita com **estilos inline** (fidelidade ao
protótipo original `roadmap-colaborativo.jsx`, mantido na raiz como referência
visual). Ícones: `lucide-react` (ADR 013). Não introduza um framework de CSS sem ADR.

- `src/api.ts` — cliente único: todos os tipos e o objeto `api` com os fetches.
- `src/auth.tsx` — `AuthProvider` + `useAuth`; `App.tsx` usa `<Protected>` para
  exigir sessão, redirecionar quem tem `mustChangePassword` para `/trocar-senha` e
  barrar não-admins das rotas `/admin/*`.
- `src/Gantt.tsx` — o componente central (timeline, barras, arrasto de datas).
- `src/roadmap-utils.ts` — lógica pura extraída do Gantt (`buildTimeline`,
  `calcRisk`, `computeDragDates`, `applyReorder`, paletas `STATUS_META`/`BAR_COLORS`).
  **É onde a lógica de timeline deve morar** — é testável sem DOM e tem a suíte
  mais densa do frontend. Não coloque cálculo de datas dentro do componente.
- `src/roadmap-path.ts` — URLs `/roadmaps/{id}-{slug}` estilo Stack Overflow: o
  **id** decide o destino, o slug é enfeite e não quebra ao renomear.

A janela temporal do Gantt é **derivada das datas cadastradas** (`buildTimeline`),
não uma grade fixa de trimestres (ADR 014).

### Deploy

Push na `main` → `.github/workflows/deploy-roadmap.yml`: provisiona a infra
(workflow reutilizável `gmautner/locaweb-cloud-provision`, zona ZP02, accessory
`db`) → faz backup do banco → `kamal setup -d roadmap`. Config em
`config/deploy.yml` (comum) + `config/deploy.roadmap.yml` (ambiente).
Produção: <https://roadmaplwsa.kinghost.net>. Health check: `GET /up` → 200.

## Documentação do projeto

`docs/PRD.md` (o quê), `docs/TASKS.md` (progresso), `docs/adr/NNN-*.md` (o porquê
de cada decisão técnica — 19 ADRs, leia o relevante antes de mudar comportamento),
`docs/INFRASTRUCTURE.md` (serviços), `docs/superpowers/{specs,plans}` (designs de
features maiores).

## Regras do projeto

- **Backup antes de publicar (automático):** o workflow de deploy
  (`.github/workflows/deploy-roadmap.yml`, passo *"Backup database before deploy"*)
  faz `pg_dump` do banco de produção ANTES de aplicar a nova versão. O dump é
  salvo em `/data/backups` na VM do banco (disco com snapshot diário) e anexado
  como artefato do run (`db-backup-<timestamp>`, retenção 90 dias). Se o backup
  falhar num ambiente que já tem banco, o deploy é abortado. Ver ADR 012.
  - Ao alterar o pipeline de deploy, **preserve esse passo** — é a trava que
    garante um ponto de restauração antes de cada publicação.
