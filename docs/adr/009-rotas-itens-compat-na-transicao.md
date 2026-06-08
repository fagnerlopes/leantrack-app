# 009 - Rotas de itens em compatibilidade durante a transição Fase 2 → Fase 3

**Status:** Accepted — encerrado na Fase 3 (2026-06-08): as rotas legadas
`/api/items*`, o helper `institutionalRoadmapID` e a constante
`institutionalSlug` foram **removidos** do backend após o frontend migrar para as
rotas escopadas (`/api/roadmaps/{id}/items*`). O roadmap institucional continua
existindo normalmente; apenas o atalho de compatibilidade deixou de existir.

## Context

A Fase 2 (backend) introduz roadmaps endereçados por id, autorização por
propriedade e itens **escopados por roadmap** (`/api/roadmaps/{id}/items*`),
tornando `roadmap_items.roadmap_id` obrigatório (NOT NULL). O spec
(`docs/superpowers/specs/2026-06-08-roadmaps-por-usuario-design.md`, seção 5.2)
prevê que as rotas antigas `/api/items*` sejam **substituídas** pelas escopadas,
com o frontend atualizado junto.

Porém o planejamento em `docs/TASKS.md` separa deliberadamente **Fase 2 =
backend** e **Fase 3 = frontend**. Se as rotas `/api/items*` fossem removidas já
na Fase 2, o frontend atual (que só migra na Fase 3) deixaria as telas de
Roadmap e `/admin` sem dados — o app ficaria quebrado no intervalo entre as
fases, inviabilizando inclusive o gate de verificação visual da Fase 2.

## Decision

Manter as rotas legadas `/api/items*` funcionando durante a Fase 2, **apontando
para o roadmap institucional** ("Roadmap Squad Cloud 2026", slug
`roadmap-squad-cloud-2026`), em paralelo com as novas rotas escopadas:

- `GET /api/items` → lista os itens do roadmap institucional.
- `POST/PUT/DELETE /api/items*` → criam/editam/removem itens do roadmap
  institucional, restritos a `RequireAdmin` (comportamento atual preservado).
- Internamente, os handlers legados resolvem o id institucional via
  `GetRoadmapBySlug` e delegam aos mesmos handlers escopados
  (`createItemInRoadmap`, `updateItemInRoadmap`, etc.).

As rotas escopadas (`/api/roadmaps/{id}/items*`) já usam autorização por
propriedade (`RequireRoadmapOwner`). A remoção das rotas legadas fica para a
**Fase 3**, quando o frontend passa a consumir as rotas escopadas.

## Rationale

- O app permanece 100% utilizável entre as fases — decisão tomada com o usuário
  em 2026-06-08.
- Reaproveita os handlers escopados (sem duplicar lógica): os legados são apenas
  um "adaptador" que injeta o roadmap institucional.
- A coluna `roadmap_id` já pode ser NOT NULL porque o handler legado de criação
  passa o id institucional explicitamente.

## Trade-offs

**Pros:**
- Zero downtime funcional na transição; gate de verificação visual da Fase 2
  passa sem mexer no frontend.
- Caminho de remoção claro e localizado (cinco rotas + um helper) na Fase 3.

**Cons:**
- Convivência temporária de dois conjuntos de rotas para itens.
- O `GET /api/items` legado enxerga apenas o roadmap institucional; itens de
  roadmaps criados por outros donos não aparecem ali (intencional — a tela
  antiga representa o roadmap institucional).

## Alternatives Considered

- **Substituição limpa imediata (remover `/api/items*` na Fase 2):** mais fiel à
  letra do spec, mas deixaria o app quebrado até a Fase 3. Descartada.
- **Fazer Fase 2 + Fase 3 na mesma sessão:** entregaria tudo de uma vez, mas
  contraria a recomendação de "uma unidade de trabalho por sessão" (degradação de
  contexto em sessões longas). Descartada.
