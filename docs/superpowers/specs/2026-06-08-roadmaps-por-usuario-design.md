# Design — Roadmaps por usuário (propriedade e visualização compartilhada)

**Data:** 2026-06-08
**Status:** Aprovado (aguardando revisão do spec escrito)

## 1. Objetivo

Evoluir a aplicação de **um único roadmap compartilhado** para **vários roadmaps, cada um
com um dono**, permitindo que outros setores da empresa usem a ferramenta.

Regras de negócio centrais:

- Cada usuário pode criar **vários** roadmaps (cada um com um nome no padrão
  `Roadmap [Produto] [Ano]`, ex.: "Roadmap VPS 2026").
- **Todos os usuários logados** podem **ver** todos os roadmaps (modo leitura).
- **Somente o dono** edita/apaga/reordena o seu próprio roadmap e os itens dele.
- **Admins** (3 e-mails fixos) só **gerenciam contas** (criar/remover usuários, definir
  papel). Quanto a roadmaps, admins são iguais a qualquer usuário: editam apenas os que
  eles mesmos criaram.
- Não é um SaaS multitenant pleno: todos pertencem à mesma empresa; a leitura é aberta a
  todos. O controle é de **propriedade** (ownership), não de isolamento entre organizações.

Admins iniciais:
- `fagner.lopes@kinghost.com.br`
- `marcus.januario@locaweb.com.br`
- `eduarda.moraes@kinghost.com.br`

## 2. Decisão de arquitetura: autorização no nível da aplicação (Opção A)

A regra "só o dono edita" é aplicada por uma **camada única de autorização no servidor**
(Go), não por Row-Level Security do Postgres.

Justificativa: simplicidade, encaixe direto na stack atual (Go + `net/http` ServeMux +
sqlc), facilidade de teste, e — principal — **não atrapalha a futura migração para SSO
(Keycloak)**. RLS exigiria modelo de conexão por usuário ou `SET ROLE`, o que conflita com
a migração planejada e é exagero para o cenário (mesma empresa, leitura aberta).

Registrar como ADR: `docs/adr/004-autorizacao-por-propriedade.md`.

## 3. Modelo de dados

### 3.1 Nova tabela `roadmaps`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | BIGSERIAL PK | identificador interno |
| `owner_id` | BIGINT NOT NULL FK → users(id) ON DELETE CASCADE | dono |
| `name` | TEXT NOT NULL | identificador humano (padrão `Roadmap [Produto] [Ano]`) |
| `slug` | TEXT NOT NULL | rótulo URL-friendly do nome; usado no modal de exclusão e como enfeite na URL. **Não é chave** (ver 3.1.1) |
| `description` | TEXT NOT NULL DEFAULT '' | opcional |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

- Restrição: `UNIQUE (owner_id, name)` — a mesma pessoa não pode ter dois roadmaps com
  nome idêntico. Nomes iguais entre donos diferentes são permitidos (a listagem mostra
  "nome — dono").
- Índice: `roadmaps_owner_idx` em `owner_id`.

### 3.1.1 Chave de endereçamento: ID, não slug

O **`id`** (interno, imutável) é a chave de endereçamento de roadmaps — em URLs e na API.
O **`slug`** é apenas um rótulo legível, **não é único** globalmente e **não é usado para
rotear**. Decisão tomada em conjunto com o usuário (2026-06-08):

- URLs no formato `/roadmaps/{id}-{slug}` (estilo Stack Overflow): o `{id}` determina o
  destino; o `{slug}` é enfeite legível e pode ser ignorado pelo backend.
- Vantagens: sem sufixos `-2` em colisão de nomes entre donos; renomear o roadmap **não
  quebra** URLs antigas (o ID não muda); o slug sempre combina com o nome.
- `slug` é gerado deterministicamente do `name` (minúsculo, sem acento, espaços→hífen).
  Como `name` já é único por dono, o slug é naturalmente único por dono — sem necessidade
  de sufixo numérico.
- **Confirmação de exclusão:** o alvo é sempre o roadmap pelo `id`; o backend apenas checa
  se o texto digitado (`confirm_slug`) bate com o slug **daquele** roadmap. Unicidade
  global é irrelevante para isso.

### 3.2 Alteração em `roadmap_items`

- Adicionar `roadmap_id BIGINT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE`.
- Índice: `roadmap_items_roadmap_idx` em `roadmap_id`.
- Demais colunas inalteradas. Apagar um roadmap apaga seus itens (CASCADE).

### 3.3 Alterações em `users` (preparação para Keycloak)

- `password_hash` passa a ser **NULLABLE** (usuários SSO não terão senha local).
- Adicionar `auth_provider TEXT NOT NULL DEFAULT 'local'` (futuro: `'keycloak'`).
- Adicionar `external_id TEXT` (NULL hoje; futuro: subject/ID do Keycloak).
- Restrição: `UNIQUE (auth_provider, external_id)` quando `external_id` não for NULL.
- `role` permanece: `'admin'` ou `'user'` (hoje há `'admin'`/`'viewer'`; ver migração).

## 4. Migração e seed (sem perder dados)

Migração `004_roadmaps.sql` (idempotente, roda no startup do container, single web VM):

1. Cria tabela `roadmaps` e adiciona `roadmap_id` em `roadmap_items` (inicialmente NULL).
2. Adiciona colunas novas em `users` (`auth_provider`, `external_id`, torna
   `password_hash` nullable).
3. Garante a existência da usuária `eduarda.moraes@kinghost.com.br` (cria se faltar, papel
   `user`).
4. Cria o roadmap **"Roadmap Squad Cloud 2026"** (slug `roadmap-squad-cloud-2026`),
   `owner_id` = Eduarda.
5. Faz **UPDATE** em todos os `roadmap_items` existentes com `roadmap_id` NULL, atribuindo
   ao roadmap recém-criado.
6. Após o backfill, aplica `ALTER TABLE roadmap_items ALTER COLUMN roadmap_id SET NOT NULL`.
7. Garante os 3 admins com `role = 'admin'`.
8. Normaliza papéis legados: `'viewer'` → `'user'` (mantém `'admin'`).

**Seed a partir do backup:** gerar um seed reproduzível com os dados reais salvos em
`backups/roadmap_2026-06-08_*.sql`, para que **dev e preview** reflitam o conteúdo de
produção. O seed cria os usuários (admins + Eduarda), o roadmap "Roadmap Squad Cloud 2026"
e seus itens. Senhas de seed apenas para dev/preview (nunca em produção).

## 5. API (backend Go)

Padrão atual: `net/http` ServeMux (Go 1.22) com middlewares `auth.Middleware` (sessão) e
`auth.RequireAdmin`. Sessão via cookie + tabela `sessions`. `SessionUser` no contexto.

### 5.1 Nova camada de autorização

Adicionar helper de propriedade em `backend/internal/auth/` (ou pacote `authz`):

- `RequireRoadmapOwner` — middleware/func que, dado o `roadmap_id` (`{id}`) da rota,
  carrega o roadmap e exige `roadmap.owner_id == SessionUser.ID`; caso contrário responde
  **403 Forbidden**. Leitura não passa por essa trava.

### 5.2 Endpoints

Roadmaps (endereçados por `id`; ver 3.1.1):
- `GET  /api/roadmaps` — lista todos (auth). Suporta `?mine=true` para "Meus roadmaps".
  Retorna id, nome, slug, dono (id+nome), contagem de itens.
- `POST /api/roadmaps` — cria (auth; vira dono). Gera slug; valida `UNIQUE(owner_id,name)`.
- `GET  /api/roadmaps/{id}` — detalhe (auth). Inclui flag `can_edit` (dono == eu).
- `PUT  /api/roadmaps/{id}` — edita nome/descrição (auth + owner). Renomear regenera o slug.
- `DELETE /api/roadmaps/{id}` — apaga (auth + owner). Corpo exige `confirm_slug` igual ao
  slug **daquele** roadmap; caso contrário 400.

Itens (escopados por roadmap, via `roadmap_id` = `{id}`):
- `GET    /api/roadmaps/{id}/items` — lista itens do roadmap (auth).
- `POST   /api/roadmaps/{id}/items` — cria item (auth + owner).
- `PUT    /api/roadmaps/{id}/items/reorder` — reordena (auth + owner).
- `PUT    /api/roadmaps/{id}/items/{itemId}` — edita item (auth + owner).
- `DELETE /api/roadmaps/{id}/items/{itemId}` — apaga item (auth + owner).

Administração de contas (auth + RequireAdmin):
- `GET    /api/admin/users` — lista usuários.
- `POST   /api/admin/users` — cria usuário (nome, e-mail, senha inicial, papel).
- `DELETE /api/admin/users/{id}` — remove usuário (CASCADE remove roadmaps/itens dele).
- `PUT    /api/admin/users/{id}/role` — define papel (`user`/`admin`).

Observações:
- As rotas antigas `/api/items*` são **substituídas** pelas escopadas por roadmap. O
  frontend é atualizado junto. (Sem necessidade de compatibilidade retroativa: app interno.)
- `RequireAdmin` deixa de proteger itens (passa a usar `RequireRoadmapOwner`); continua
  protegendo `/api/admin/*`.

### 5.3 Queries (sqlc)

Novos arquivos/queries em `backend/internal/database/queries/`:
- `roadmaps.sql`: ListRoadmaps, ListMyRoadmaps, GetRoadmapByID, CreateRoadmap,
  UpdateRoadmap, DeleteRoadmap, CountItemsByRoadmap.
- `items.sql`: adicionar `roadmap_id` em CreateItem; escopar ListItems/Get/Update/Delete/
  Reorder por `roadmap_id`; checagens garantem que o item pertence ao roadmap informado.
- `users.sql`: ListUsers, CreateUser (com auth_provider/external_id), DeleteUser,
  UpdateUserRole.

## 6. Autenticação desacoplada (preparação Keycloak)

Introduzir uma interface de identidade para isolar o resto do sistema do mecanismo de
login:

```
type Authenticator interface {
    // resolve o usuário logado a partir da requisição (cookie hoje; token OIDC amanhã)
    UserFromRequest(r *http.Request) (*SessionUser, error)
}
```

- Implementação atual: `LocalAuthenticator` (cookie de sessão + senha local) — mantém o
  comportamento de hoje.
- Futuro: `KeycloakAuthenticator` (valida token OIDC, mapeia claims→SessionUser, usa
  `external_id`/`auth_provider`). A troca não afeta handlers de roadmap nem a autorização
  por propriedade.
- Mapeamento de papéis no futuro pode vir de grupos/roles do Keycloak; hoje fica no campo
  `users.role`.

## 7. Frontend (React)

- **Tela inicial = "Meus roadmaps"** após login. Aba/atalho para "Todos os roadmaps".
- **Roteamento por ID**: a URL de um roadmap é `/roadmaps/{id}-{slug}` (ver 3.1.1); o `{id}`
  resolve o destino e o `{slug}` é só legibilidade.
- **Lista de roadmaps**: cartões/linhas "nome — dono" + contagem de itens. Botão
  "+ Novo roadmap".
- **Criar roadmap**: formulário com `name` (placeholder *Ex.: Roadmap VPS 2026*) e
  descrição opcional. Após salvar, abre em modo edição.
- **Visualizar roadmap**:
  - Dono → modo edição completa (UI atual: arrastar, editar, criar, cores, datas, epic_url).
  - Não-dono → **modo leitura**: sem botões de editar/arrastar/excluir; selo
    "Somente leitura — roadmap de {dono}". Controlado pela flag `can_edit` da API.
- **Excluir roadmap**: modal de confirmação exibindo o **slug**; botão "Excluir" só habilita
  quando o usuário digita o slug exato (envia `confirm_slug`).
- **Painel "Usuários"** (visível só para admins): listar, criar (nome/e-mail/senha/papel),
  remover, alterar papel.

## 8. Testes (escritos junto com o código)

Backend (Go):
- Dono edita o próprio roadmap/itens → OK.
- Não-dono tenta editar → 403 (mesmo forçando direto na API).
- Qualquer usuário logado lista e vê qualquer roadmap → OK.
- Apenas admin acessa `/api/admin/*` → não-admin recebe 403.
- DELETE de roadmap sem `confirm_slug` correto → 400.
- Geração de slug: normalização (minúsculo, sem acento, espaços→hífen).
- Roteamento por ID: URL com slug "errado" mas ID certo ainda resolve o roadmap; renomear
  não quebra acesso pelo ID.
- Migração: itens existentes ficam atribuídos ao roadmap da Eduarda; `roadmap_id` NOT NULL
  ao final; papéis `viewer`→`user`.

Frontend (Vitest):
- "Meus roadmaps" é a rota inicial após login.
- Roadmap de outro usuário renderiza em modo leitura (sem controles de edição).
- Modal de exclusão habilita o botão somente quando o slug digitado confere.
- Painel de usuários aparece só para admin.

## 9. Documentação a atualizar

- `docs/PRD.md` — novo modelo de roadmaps por usuário, papéis, fluxo de uso.
- `docs/TASKS.md` — tarefas da implementação.
- `docs/adr/004-autorizacao-por-propriedade.md` — decisão da Opção A.
- `docs/adr/005-auth-desacoplada-para-sso.md` — interface de autenticação p/ Keycloak.
- `docs/INFRASTRUCTURE.md` — sem mudança de serviços (Postgres continua o único accessory).

## 10. Fora de escopo (YAGNI)

- Auto-registro de usuários (hoje: admin cria contas).
- Integração efetiva com Keycloak (apenas preparado o "encaixe").
- Cor/área por roadmap, compartilhamento granular, comentários, histórico de versões.
- Isolamento multitenant entre organizações distintas.
