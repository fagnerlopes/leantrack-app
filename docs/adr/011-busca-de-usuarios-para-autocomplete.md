# 011 - Busca de usuários para o autocomplete do compartilhamento

**Status:** Accepted

## Context

O diálogo de compartilhamento (ADR 010) só aceitava o e-mail exato de uma conta
existente — quem convidava precisava saber o endereço de cor, e errar uma letra
resultava em "Não há conta com esse e-mail". Para facilitar, o campo de e-mail
passa a oferecer um autocomplete que sugere usuários conforme se digita.

Isso exige um endpoint de busca de usuários, mas até então a única forma de
listar contas era `GET /api/admin/users`, restrita a administradores. Precisávamos
de uma busca utilizável por qualquer pessoa que possa compartilhar um roadmap, sem
expor o diretório inteiro de usuários de forma ampla.

## Decision

Criar `GET /api/roadmaps/{id}/user-search?q=<termo>`, escopado ao roadmap e
protegido pelo mesmo middleware `RequireRoadmapSharer` dos endpoints de
colaboradores (dono ou `can_share`).

- A busca casa o termo em **e-mail OU nome** (`ILIKE %termo%`), retornando no
  máximo 10 resultados (`SearchUsersForRoadmap`).
- A query **exclui o dono e quem já é colaborador** do roadmap, para não sugerir
  convites redundantes.
- O backend só executa a busca a partir de **4 caracteres** (espelhando o gatilho
  do frontend) e escapa os curingas de LIKE (`% _ \`) do termo digitado.
- O frontend dispara a busca com debounce de 250 ms e mostra um dropdown com
  nome + e-mail; ao escolher, preenche o campo de e-mail.

## Rationale

- Reaproveitar o gate `can_share` mantém a regra de autorização consistente com o
  resto do compartilhamento: quem pode convidar pode procurar candidatos.
- Escopar por roadmap permite filtrar dono/colaboradores na própria query e evita
  um endpoint global de diretório de usuários.
- Limite de 10 + mínimo de 4 caracteres reduzem o custo da busca e a exposição de
  dados (não é possível "varrer" a base com termos curtos).

## Trade-offs

**Pros:**
- Convidar fica muito mais rápido e à prova de erro de digitação.
- Nenhuma rota nova de listagem global; a autorização já existente é reaproveitada.
- Filtragem de dono/colaboradores feita no banco, sem lógica extra no cliente.

**Cons:**
- Qualquer pessoa com `can_share` em algum roadmap pode descobrir nome/e-mail de
  outras contas via prefixos de 4+ caracteres. Aceitável para uma ferramenta
  interna de equipe; não seria adequado para um produto público.
- O termo precisa ter ao menos 4 caracteres, então buscas muito curtas não
  retornam nada (decisão consciente de custo/privacidade).

## Alternatives Considered

- **Endpoint global `GET /api/users/search`:** descartado por não ter contexto de
  roadmap (não dá para excluir dono/colaboradores) e por ampliar a superfície de
  exposição do diretório além de quem compartilha.
- **Liberar `GET /api/admin/users` para não-admins:** descartado — quebraria a
  fronteira de administração e devolveria campos sensíveis (papel, provider).
- **Buscar só por e-mail:** descartado a pedido do produto; casar também pelo nome
  cobre quem lembra o nome da pessoa mas não o e-mail exato.
