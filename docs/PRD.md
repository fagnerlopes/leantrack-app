# PRD — Roadmap da Squad Cloud

## Visão geral

Aplicação web interna que apresenta roadmaps de iniciativas em formato Gantt, com visualização temporal por trimestres, sinalização automática de riscos e dependências externas.

A aplicação está evoluindo de **um único roadmap compartilhado** para **vários roadmaps, cada um com um dono** — permitindo que diferentes setores da empresa usem a ferramenta. Esta evolução é faseada (ver `docs/superpowers/specs/2026-06-08-roadmaps-por-usuario-design.md`):

- **Fase 1 (concluída):** fundação de dados — tabela `roadmaps`, vínculo `roadmap_items.roadmap_id`, e migração dos dados atuais para o roadmap institucional **"Roadmap Squad Cloud 2026"** (dono: Eduarda Moraes). Sem mudança visível na aplicação.
- **Fase 2 (concluída):** backend — endpoints por roadmap (`/api/roadmaps*`) e itens escopados (`/api/roadmaps/{id}/items*`), autorização por propriedade (`RequireRoadmapOwner`), gestão de contas por admin (`/api/admin/users*`), autenticação desacoplada (interface `Authenticator` — preparação SSO), `roadmap_id` agora obrigatório. As rotas legadas `/api/items*` seguem ativas em compatibilidade até a Fase 3 (ver ADR 009); o frontend ainda não mudou.
- **Fase 3 (concluída):** frontend — telas "Meus roadmaps" / "Todos os roadmaps", roteamento por id (`/roadmaps/{id}-{slug}`), modo leitura para não-donos (selo "Somente leitura"), criação/renomeação/exclusão de roadmaps (exclusão confirmada por slug), e painel "Usuários" só para admins. O frontend passou a consumir exclusivamente as rotas escopadas por roadmap; as rotas legadas `/api/items*` foram removidas (ver ADR 009).

### Modelo de propriedade (alvo das Fases 2–3)

- Cada usuário pode criar **vários** roadmaps (padrão de nome `Roadmap [Produto] [Ano]`, ex.: "Roadmap VPS 2026").
- **Todos os usuários logados veem** todos os roadmaps (modo leitura).
- **Somente o dono** edita/apaga/reordena o próprio roadmap e seus itens.
- **Compartilhamento com colaboradores:** o dono pode conceder a outras pessoas duas permissões **independentes** — **editar** (mexer no conteúdo: criar/alterar/reordenar/excluir iniciativas, **e renomear** o roadmap) e **compartilhar** (convidar/remover outros colaboradores e ajustar as permissões deles). É possível conceder só uma ou ambas. **Excluir o roadmap inteiro continua exclusivo do dono** — nenhum colaborador pode excluí-lo. Um colaborador com "compartilhar" pode convidar/remover colaboradores, **mas nunca o dono** (a propriedade só muda pelo dono; transferência de propriedade está fora de escopo).
- **Admins** (3 e-mails fixos) gerenciam **contas**; quanto a roadmaps, são iguais a qualquer usuário (editam só os que criaram).
- Não é multitenant: todos pertencem à mesma empresa; o controle é de **propriedade**, não de isolamento entre organizações.

## Público-alvo

- **Usuários (leitura + donos):** consultam qualquer roadmap, filtram por status/trimestre, exportam PDF/PNG; editam apenas os roadmaps que criaram.
- **Diretoria (leitura):** consultam roadmaps e exportam visualizações para slides e relatórios.
- **Administradores:** além do acima, gerenciam contas de usuários (criar/remover, definir papel, resetar senha).

Tudo é protegido por autenticação; nada é público.

## Funcionalidades principais

### Lista de roadmaps (`/`)
- Tela inicial após o login, com abas **"Meus roadmaps"** (os que você criou), **"Compartilhados comigo"** (roadmaps em que você é colaborador) e **"Todos os roadmaps"** (todos da empresa, em leitura).
- Cada roadmap aparece como um cartão com nome, dono e número de iniciativas; um selo "SEU" marca os seus e um selo "COMPARTILHADO" marca os que outra pessoa compartilhou com você.
- Botão **"+ Novo roadmap"** (padrão de nome `Roadmap [Produto] [Ano]`); ao criar, abre direto em modo edição.
- Acesso ao painel **"Usuários"** apenas para administradores.

### Visualização do roadmap (`/roadmaps/{id}-{slug}`)
- Endereçado pelo **id** (imutável); o slug é apenas enfeite legível e não quebra ao renomear.
- **Dono:** modo edição completo — criar/editar iniciativas, arrastar para reordenar, cores, datas, link do épico, além de **renomear** e **excluir** o roadmap (exclusão confirmada digitando o slug exato).
- **Colaborador com permissão de editar:** abre o roadmap em **modo edição** (sem o selo "Somente leitura"), podendo mexer no conteúdo e renomear; **não vê o botão de excluir** (exclusão é só do dono).
- **Não-dono sem permissão de editar:** modo **somente leitura**, com selo "🔒 Somente leitura — roadmap de {dono}" e sem controles de edição.
- **Botão "Compartilhar":** visível ao **dono** e a quem tem permissão de compartilhar. Abre o **diálogo de colaboradores**: convidar por **e-mail** (de conta existente) definindo as permissões "Pode editar" e "Pode compartilhar"; **aviso** quando o e-mail não tem conta, orientando solicitar o cadastro a `marcus.januario@locaweb.com.br` (sem auto-cadastro); e a **lista de pessoas com acesso** (o dono aparece marcado como "Dono", sem opção de remover) com botão para **remover** colaboradores.
  - **Autocomplete do convite:** ao digitar **4 ou mais caracteres** no campo de e-mail, o sistema sugere usuários cujo **e-mail ou nome** casam com o texto, exibindo nome + e-mail. Quem já tem acesso (o dono e colaboradores atuais) **não aparece** nas sugestões. Escolher uma sugestão preenche o campo automaticamente.
- Gantt horizontal Mai/26 → Mai/27 com cabeçalho por trimestre (Q2/26 ... Q2/27).
- Itens agrupados por status: Em andamento, Não iniciado, Concluído, Pausado.
- Barras com cores por status; barra tracejada vermelha/amarela para itens em risco.
- Indicador "Hoje": linha vermelha e badge posicionados pela **data atual** (calculada em tempo de execução), enquanto a data cair dentro da janela Mai/26 → Mai/27.
- Marcos externos como losangos coloridos no track temporal.
- Cálculo automático de risco: **Crítico** (marco depois do início → bloqueio), **Alerta** (marco até 14 dias antes do início), **No prazo** (marco com folga).
- Filtros: por status, por trimestre, apenas em risco.
- Exportar como PNG (alta resolução, 2× pixel ratio) e como PDF (paisagem) para uso em apresentações.

### Edição de iniciativas (dentro do roadmap, para o dono)
- Modal de criação/edição com todos os campos da iniciativa, incluindo dependência interna (outra iniciativa) e bloco de dependência externa (time, descrição, marco), cor do card e link do épico.
- Reordenação por arrastar dentro do mesmo status; remoção com confirmação.

### Painel de usuários (`/admin/users`) — apenas role `admin`
- Listar contas, criar usuário (nome, e-mail, senha temporária, papel), alterar papel (`user`/`admin`), **resetar senha** e remover.
- **Resetar senha** (ver ADR 015): como não há "Esqueci minha senha" por e-mail, o admin redefine a senha de qualquer usuário **sem informar a senha antiga**. Há um **gerador de senha temporária forte** (copiar/gerar-outra) e um alerta para salvar a senha no **Keeper**. A senha definida pelo admin (no reset ou na criação) é **temporária**: o usuário é **obrigado a trocá-la no primeiro acesso**.
- Proteções: não é possível remover a própria conta nem rebaixar/remover o último admin.

### Login (`/login`)
- Email + senha.
- Usuários criados via seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` no `.env`).
- Sessão por cookie HttpOnly, válida por 7 dias.
- **Não há fluxo de "Esqueci minha senha"** (decisão consciente — evita contratar SMTP); a recuperação de acesso é feita pelo admin via reset de senha.

### Troca obrigatória de senha (`/trocar-senha`)
- No primeiro acesso após o admin definir/resetar a senha, o usuário cai numa **tela bloqueante**: não navega no app até escolher uma nova senha. Exibe alerta para salvar a senha no **Keeper**.

### Política de senha (toda a aplicação)
- Mínimo de **12 caracteres**, com **maiúscula, minúscula, número e símbolo**. Validada no servidor e no cliente.

### Perfil (`/perfil`) — qualquer usuário autenticado
- Acessível pelo **menu do usuário** (avatar com as iniciais do nome) no canto superior direito, com atalhos para **Perfil** e **Sair**.
- O usuário altera o **próprio nome** e, opcionalmente, define uma **nova senha** (conforme a política acima, com campo de confirmação, botão mostrar/ocultar e alerta de Keeper). Campo de senha em branco mantém a senha atual.
- O e-mail é somente leitura.

## Fluxos do usuário

1. **Diretoria entra para apresentar o roadmap:** faz login → escolhe o roadmap em "Todos os roadmaps" → abre o Gantt (modo leitura) → filtra por trimestre → clica "Exportar PDF" → cola no deck.
2. **PM/Tech Lead atualiza o próprio roadmap:** em "Meus roadmaps" abre o seu roadmap (modo edição) → clica numa iniciativa → ajusta progresso, datas, dependência externa → salva; ou cria uma nova iniciativa. Quem consultar o roadmap vê a atualização ao recarregar.
3. **Novo setor começa a usar:** cria "+ Novo roadmap" (ex.: "Roadmap VPS 2026"), que abre em modo edição para cadastrar as iniciativas.
4. **Admin gerencia acesso:** abre "Usuários", cria a conta do novo PM com papel `user`, gera uma senha temporária e a repassa pelo Keeper; no primeiro login o PM é obrigado a trocá-la. Se alguém esquece a senha, o admin usa "Resetar senha".

## Requisitos não funcionais

- **Stack:** Go + React (SPA) + Postgres, container único, porta 80.
- **Performance:** Gantt renderiza em <500ms com até 200 iniciativas.
- **Segurança:** rotas autenticadas; CRUD restrito a admins; senhas em bcrypt; cookies HttpOnly + SameSite Lax.
- **Acessibilidade básica:** contraste adequado, formulários com labels.
- **Idioma:** Português (pt-BR).

## Fora de escopo (versão 1)

- Auto-registro de usuários (admin cria contas).
- Integração efetiva com Keycloak (apenas o "encaixe" é preparado — ver ADR 008).
- Cor/área por roadmap, comentários, histórico de versões.
- Isolamento multitenant entre organizações distintas.
- Histórico de alterações (audit log).
- Notificações por email.
- Integração com Jira/Linear.
- Granularidade abaixo de dia (horas/sprints).
