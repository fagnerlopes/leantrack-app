# Design — Compartilhamento de roadmaps com permissão de edição

**Data:** 2026-06-10
**Status:** Aprovado (aguardando revisão da spec antes do plano)

## Problema

Hoje cada roadmap tem **um dono**, que é o único que pode editar; todos os demais
usuários logados veem em modo leitura. Não há como uma pessoa permitir que outra
edite o roadmap dela. Exemplo concreto: a Eduarda (`eduarda.moraes@kinghost.com.br`)
quer compartilhar o roadmap dela com o Marcus (`marcus.januario@locaweb.com.br`)
para que ele possa editá-lo.

## Objetivo

Adicionar uma camada de **colaboradores** por roadmap. O dono (e, se autorizado,
um colaborador) pode convidar outras pessoas e conceder permissões granulares de
edição e de compartilhamento, sem abrir mão do controle sobre a exclusão do
roadmap.

## Modelo de permissões

Ao convidar (e depois editar) cada colaborador, quem compartilha define duas
permissões **independentes**:

- **Pode editar** (`can_edit`): criar, alterar, reordenar e excluir iniciativas,
  **e renomear** o roadmap.
- **Pode compartilhar** (`can_share`): convidar/remover colaboradores e ajustar
  as permissões deles.

Regras invariantes (não configuráveis):

- **Excluir o roadmap inteiro:** exclusivo do **dono**. Nenhum colaborador,
  mesmo com ambas as permissões, pode excluir o roadmap.
- O **dono** sempre tem todas as permissões e pode remover qualquer colaborador.
- Quem tem `can_share` pode convidar/remover **colaboradores** e editar as
  permissões deles, **mas nunca pode remover o dono** (a propriedade só muda
  pelo dono — e transferência de propriedade está fora de escopo). Como o dono
  é sempre preservado, não há risco de o roadmap ficar sem ninguém com controle.
- `can_edit` e `can_share` são independentes: é possível conceder só uma, ou
  ambas. Conceder apenas `can_share` (sem editar) é permitido, ainda que
  incomum — mantém o modelo simples e previsível.

### Resumo de quem pode o quê

| Ação                              | Dono | Colaborador `can_edit` | Colaborador `can_share` | Leitor |
|-----------------------------------|:----:|:----------------------:|:-----------------------:|:------:|
| Ver o roadmap                     |  ✅  |          ✅            |           ✅            |   ✅   |
| Editar/reordenar/excluir itens    |  ✅  |          ✅            |           —             |   —    |
| Renomear o roadmap                |  ✅  |          ✅            |           —             |   —    |
| Convidar/remover colaboradores    |  ✅  |          —             |           ✅            |   —    |
| Excluir o roadmap inteiro         |  ✅  |          —             |           —             |   —    |

(Um colaborador pode ter `can_edit` **e** `can_share` ao mesmo tempo.)

## Convite pela interface

Botão **"Compartilhar"** na tela do roadmap, visível ao **dono** e a quem tem
`can_share`. Abre um diálogo com:

- Campo de **e-mail** + duas chavinhas: **Pode editar** e **Pode compartilhar**.
- Lista dos **colaboradores atuais**, mostrando nome/e-mail, permissões e um
  botão **remover**. O dono aparece na lista marcado como "Dono" (sem botão de
  remover).
- Tratamento do e-mail sem conta: como não há auto-cadastro, se o e-mail digitado
  **não corresponder a uma conta existente**, exibir o aviso:
  *"Não há conta com esse e-mail. Solicite o cadastro a
  marcus.januario@locaweb.com.br."* — sem criar nada.

## Onde os roadmaps compartilhados aparecem

- Nova aba **"Compartilhados comigo"** na tela inicial (`/`), ao lado de
  "Meus roadmaps" e "Todos os roadmaps". Lista os roadmaps em que o usuário é
  colaborador (não inclui os que ele mesmo é dono).
- Ao abrir um roadmap em que o usuário tem `can_edit`, ele entra em **modo
  edição** (sem o selo "🔒 Somente leitura"). Sem `can_edit`, segue em leitura.

## Modelo de dados

Nova tabela (migração **aditiva e idempotente**, não altera dados existentes):

```sql
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

Observações:
- A chave primária composta garante **um vínculo por (roadmap, usuário)**;
  convidar de novo atualiza as permissões (upsert).
- Não se cria linha para o dono — a propriedade já está em `roadmaps.owner_id`.

## Autorização (backend)

A checagem atual `RequireRoadmapOwner` é dividida conforme a ação:

- **Editar conteúdo + renomear** → nova checagem `RequireRoadmapEditor`:
  passa se for **dono** OU colaborador com `can_edit`.
- **Excluir o roadmap** → continua exigindo **dono** (`RequireRoadmapOwner`).
- **Gerenciar colaboradores** → nova checagem `RequireRoadmapSharer`:
  passa se for **dono** OU colaborador com `can_share`.

Rotas afetadas:
- `PUT /api/roadmaps/{id}` (renomear) → editor.
- `PUT/POST/DELETE /api/roadmaps/{id}/items*` → editor.
- `DELETE /api/roadmaps/{id}` → **dono** (inalterado).

## Endpoints novos

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET    | `/api/roadmaps/{id}/collaborators` | dono ou `can_share` | Lista colaboradores |
| POST   | `/api/roadmaps/{id}/collaborators` | dono ou `can_share` | Convida por e-mail (`{email, canEdit, canShare}`); 404 amigável se e-mail sem conta |
| PUT    | `/api/roadmaps/{id}/collaborators/{userId}` | dono ou `can_share` | Atualiza permissões |
| DELETE | `/api/roadmaps/{id}/collaborators/{userId}` | dono ou `can_share` | Remove colaborador (nunca o dono) |
| GET    | `/api/roadmaps/shared` | autenticado | Roadmaps compartilhados comigo |

Regras de borda:
- Não permitir convidar o próprio **dono** como colaborador (já é dono).
- Não permitir que um `can_share` (não-dono) remova o dono.
- Validar e normalizar e-mail (trim + lowercase), igual ao login.

## Resposta da API — flags por roadmap

O JSON de roadmap (em listagens e no `GET /api/roadmaps/{id}`) passa a carregar,
além do `canEdit` atual:

- `canEdit` — dono ou colaborador `can_edit` (já existe; semântica ampliada).
- `canShare` — dono ou colaborador `can_share` (novo).
- `canDelete` — apenas dono (novo; o frontend usa para mostrar/ocultar excluir).
- `isOwner` — conveniência para o frontend (novo).

## Frontend

- **`RoadmapList.tsx`**: terceira aba "Compartilhados comigo" consumindo
  `GET /api/roadmaps/shared`; selo distinto (ex.: "COMPARTILHADO").
- **`RoadmapView.tsx`**: botão "Compartilhar" (se `canShare`); diálogo de
  colaboradores; usar `canDelete` para o controle de exclusão e `canEdit` para
  os controles de edição/renomear (substituindo a checagem antiga baseada só em
  propriedade).
- Novo componente de diálogo de compartilhamento (shadcn `Dialog` + `Switch`/
  `Checkbox` + `Input`), seguindo a skill **frontend-design**.

## Testes

- **Go (handlers/integração):** matriz de autorização — dono, editor, sharer,
  leitor, estranho — para cada rota nova e para as rotas de item/renomear/excluir;
  convite com e-mail inexistente; bloqueio de remoção do dono; upsert de
  permissões; listagem "compartilhados comigo".
- **Vitest:** aba "Compartilhados comigo" rendeiriza; diálogo de compartilhamento
  (adicionar, erro de e-mail sem conta, remover, alternar permissões); botão de
  excluir oculto para não-dono; modo edição para colaborador `can_edit`.

## Fora de escopo

- Notificação por e-mail ao convidar (a pessoa simplesmente passa a ver na aba).
- Compartilhamento público/por link.
- Histórico/auditoria de quem editou o quê.
- Transferência de propriedade do roadmap.

## Impacto na documentação

- Atualizar `docs/PRD.md` (modelo de propriedade + nova aba + permissões).
- Novo ADR: "Compartilhamento por colaboradores com permissões granulares"
  (estende o ADR 007 — autorização por propriedade).
- `docs/TASKS.md`: tarefas desta fase.
