# 006 - Link do épico (Jira / Azure DevOps) por iniciativa

**Status:** Accepted

## Context
Diretoria/PMs precisam saltar do roadmap para o épico correspondente no Jira ou Azure DevOps Boards sem ter que pesquisar manualmente. Cada iniciativa tem (geralmente) um épico associado em uma dessas ferramentas.

## Decision
Adicionar campo opcional `epic_url` (TEXT) na tabela `roadmap_items`. Exibido como botão 🔗 ao lado do título do card no Gantt e na tabela do dashboard — abre em nova aba (`target="_blank" rel="noopener noreferrer"`).

## Rationale
- Campo único `epic_url` ao invés de campos separados (Jira vs ADO) — agnóstico de ferramenta, simples de manter.
- Validação no backend: apenas `http://` ou `https://`, máximo 2000 caracteres; URLs inválidas são silenciosamente descartadas (vira `NULL`).
- Botão no card (não em hover/menu) para acesso de 1 clique durante apresentações.
- `stopPropagation` no clique evita disparar a edição do card.

## Trade-offs
**Pros:**
- UX direta — 1 clique para abrir o épico.
- Não acopla o sistema a Jira ou ADO.
- Visível também no admin para validação rápida.

**Cons:**
- Sem preview/metadados do épico (status, assignee). Aceitável — o link já resolve o caso de uso.
- Sem validação ativa do destino (link pode estar quebrado).

## Alternatives Considered
- **Campos separados `jira_url` e `ado_url`:** mais rígido, sem ganho real.
- **Tabela `external_links` 1:N:** overkill para o caso atual (1 épico por iniciativa).
- **Tooltip ao invés de botão:** reduz descoberta — botão é mais explícito.
