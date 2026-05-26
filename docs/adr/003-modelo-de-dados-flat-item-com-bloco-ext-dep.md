# 003 - Modelo de dados: tabela única `roadmap_items` com colunas `ext_*` opcionais

**Status:** Accepted

## Context
O JSX original modela cada item como um objeto com um sub-objeto opcional `extDep: { team, description, milestoneDate }`. Precisamos persistir isso em Postgres.

## Decision
Manter uma única tabela `roadmap_items` com três colunas opcionais (`ext_team TEXT`, `ext_description TEXT`, `ext_milestone DATE`). Quando todas são nulas, não há dependência externa. Quando preenchidas, o frontend reconstitui o bloco visual.

## Rationale
- Cada item tem **no máximo uma** dependência externa (modelo do JSX). Não há necessidade de tabela 1-N.
- Queries triviais — um único `SELECT` traz tudo, sem joins.
- Dependência interna (entre itens) é modelada por `dependency_id BIGINT REFERENCES roadmap_items(id)` na própria tabela (auto-relacionamento).

## Trade-offs
**Pros:** modelo simples, queries baratas, fácil de evoluir.
**Cons:** se no futuro um item precisar bloquear-se em múltiplos times externos, será necessário migration para uma tabela `roadmap_item_ext_deps`.

## Alternatives Considered
- Tabela separada `roadmap_item_ext_deps`: complexidade desnecessária para 1-1.
- Coluna JSONB `ext_dep`: perderia consultas SQL diretas e a possibilidade de filtrar/ordenar por marco.
