# PRD — Roadmap da Squad Cloud

## Visão geral

Aplicação web interna que apresenta roadmaps de iniciativas em formato Gantt, com visualização temporal por trimestres, sinalização automática de riscos e dependências externas.

A aplicação está evoluindo de **um único roadmap compartilhado** para **vários roadmaps, cada um com um dono** — permitindo que diferentes setores da empresa usem a ferramenta. Esta evolução é faseada (ver `docs/superpowers/specs/2026-06-08-roadmaps-por-usuario-design.md`):

- **Fase 1 (concluída):** fundação de dados — tabela `roadmaps`, vínculo `roadmap_items.roadmap_id`, e migração dos dados atuais para o roadmap institucional **"Roadmap Squad Cloud 2026"** (dono: Eduarda Moraes). Sem mudança visível na aplicação.
- **Fase 2 (concluída):** backend — endpoints por roadmap (`/api/roadmaps*`) e itens escopados (`/api/roadmaps/{id}/items*`), autorização por propriedade (`RequireRoadmapOwner`), gestão de contas por admin (`/api/admin/users*`), autenticação desacoplada (interface `Authenticator` — preparação SSO), `roadmap_id` agora obrigatório. As rotas legadas `/api/items*` seguem ativas em compatibilidade até a Fase 3 (ver ADR 009); o frontend ainda não mudou.
- **Fase 3 (pendente):** frontend — telas "Meus roadmaps" / "Todos os roadmaps", modo leitura para não-donos, criação/exclusão de roadmaps, painel de usuários.

### Modelo de propriedade (alvo das Fases 2–3)

- Cada usuário pode criar **vários** roadmaps (padrão de nome `Roadmap [Produto] [Ano]`, ex.: "Roadmap VPS 2026").
- **Todos os usuários logados veem** todos os roadmaps (modo leitura).
- **Somente o dono** edita/apaga/reordena o próprio roadmap e seus itens.
- **Admins** (3 e-mails fixos) gerenciam **contas**; quanto a roadmaps, são iguais a qualquer usuário (editam só os que criaram).
- Não é multitenant: todos pertencem à mesma empresa; o controle é de **propriedade**, não de isolamento entre organizações.

## Público-alvo

- **Usuários (leitura + donos):** consultam qualquer roadmap, filtram por status/trimestre, exportam PDF/PNG; editam apenas os roadmaps que criaram.
- **Diretoria (leitura):** consultam roadmaps e exportam visualizações para slides e relatórios.
- **Administradores:** além do acima, gerenciam contas de usuários (criar/remover, definir papel).

Tudo é protegido por autenticação; nada é público.

## Funcionalidades principais

### Visualização do roadmap (`/`)
- Gantt horizontal Mai/26 → Mai/27 com cabeçalho por trimestre (Q2/26 ... Q2/27).
- Itens agrupados por status: Em andamento, Não iniciado, Concluído, Pausado.
- Barras com cores por status; barra tracejada vermelha/amarela para itens em risco.
- Indicador "Hoje" (25 Mai 2026 — data de referência do roadmap).
- Marcos externos como losangos coloridos no track temporal.
- Cálculo automático de risco: **Crítico** (marco depois do início → bloqueio), **Alerta** (marco até 14 dias antes do início), **No prazo** (marco com folga).
- Filtros: por status, por trimestre, apenas em risco.
- Exportar como PNG (alta resolução, 2× pixel ratio) e como PDF (paisagem) para uso em apresentações.

### Dashboard de gestão (`/admin`) — apenas role `admin`
- Tabela com todas as iniciativas, status, datas, progresso, dependência externa, risco e ações.
- Modal de criação/edição com todos os campos da iniciativa, incluindo dependência interna (outra iniciativa) e bloco de dependência externa (time, descrição, marco).
- Remoção com confirmação.

### Login (`/login`)
- Email + senha.
- Usuários criados via seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` no `.env`).
- Sessão por cookie HttpOnly, válida por 7 dias.

## Fluxos do usuário

1. **Diretoria entra para apresentar o roadmap:** abre `/`, faz login → vê Gantt completo → filtra por trimestre → clica "Exportar PDF" → cola no deck.
2. **PM/Tech Lead atualiza o roadmap:** entra em `/admin` → edita item → ajusta progresso, datas, marca dependência externa → salva → diretoria vê atualização ao recarregar.

## Requisitos não funcionais

- **Stack:** Go + React (SPA) + Postgres, container único, porta 80.
- **Performance:** Gantt renderiza em <500ms com até 200 iniciativas.
- **Segurança:** rotas autenticadas; CRUD restrito a admins; senhas em bcrypt; cookies HttpOnly + SameSite Lax.
- **Acessibilidade básica:** contraste adequado, formulários com labels.
- **Idioma:** Português (pt-BR).

## Fora de escopo (versão 1)

- Auto-registro de usuários (admin cria contas).
- Integração efetiva com Keycloak (apenas o "encaixe" é preparado — ver ADR 008).
- Cor/área por roadmap, compartilhamento granular, comentários, histórico de versões.
- Isolamento multitenant entre organizações distintas.
- Histórico de alterações (audit log).
- Notificações por email.
- Integração com Jira/Linear.
- Granularidade abaixo de dia (horas/sprints).
