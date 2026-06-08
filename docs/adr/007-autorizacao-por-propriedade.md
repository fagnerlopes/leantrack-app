# 007 - Autorização por propriedade (ownership) no nível da aplicação

**Status:** Accepted

> Nota de numeração: o spec/plano referem-se a este ADR como "004"; os números
> 004 e 006 já estavam em uso no repositório, então este foi registrado como 007
> (e o de auth desacoplada como 008). O conteúdo é o descrito na seção 2 do spec
> `docs/superpowers/specs/2026-06-08-roadmaps-por-usuario-design.md`.

## Context
A aplicação evolui de **um único roadmap compartilhado** para **vários roadmaps, cada um com um dono**. As regras de negócio:

- Qualquer usuário logado **vê** todos os roadmaps (leitura aberta).
- **Somente o dono** edita/apaga/reordena o próprio roadmap e seus itens.
- **Admins** (3 e-mails fixos) gerenciam apenas contas; quanto a roadmaps, são iguais a qualquer usuário (editam só os que criaram).
- Todos pertencem à mesma empresa — não é multitenant com isolamento entre organizações.

Precisamos decidir **onde** essa regra de "só o dono edita" é aplicada.

## Decision
Aplicar a autorização por uma **camada única no servidor (Go)**, não por Row-Level Security (RLS) do Postgres. Um helper `RequireRoadmapOwner` carrega o roadmap pelo `id` da rota e exige `roadmap.owner_id == SessionUser.ID`, respondendo **403** caso contrário. Leitura não passa por essa trava. `RequireAdmin` protege apenas `/api/admin/*`.

## Rationale
- Simplicidade e encaixe direto na stack atual (Go + `net/http` ServeMux + sqlc).
- Fácil de testar (testes Go cobrindo dono/não-dono/admin).
- **Não atrapalha a futura migração para SSO (Keycloak):** RLS exigiria conexão por usuário ou `SET ROLE`, o que conflita com a auth desacoplada planejada (ver ADR 008).
- Cenário (mesma empresa, leitura aberta) não justifica o custo do RLS.

## Trade-offs
**Pros:**
- Lógica de autorização concentrada e legível em Go.
- Independente do mecanismo de autenticação — sobrevive à troca para Keycloak.
- Testável sem infraestrutura de banco por usuário.

**Cons:**
- A garantia não é "defense in depth" no nível do banco: um bug em handler poderia, em tese, escapar da checagem. Mitigado por testes e pela checagem obrigatória em cada handler de escrita.

## Alternatives Considered
- **Row-Level Security (Postgres):** descartado — exige modelo de conexão por usuário / `SET ROLE`, conflita com SSO planejado e é exagero para leitura aberta na mesma empresa.
- **Apenas middleware de rota sem checagem por recurso:** insuficiente — a propriedade depende do `owner_id` do recurso concreto, não só do papel.
