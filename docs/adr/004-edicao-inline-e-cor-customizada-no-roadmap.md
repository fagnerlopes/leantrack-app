# 004 - Edição inline, drag-and-drop e cor customizada na visão Roadmap

**Status:** Accepted

## Context

A versão inicial separava completamente "visualização" (`/`) de "edição" (`/admin`).
Para iterar mais rápido o roadmap, surgiram quatro pedidos:

1. Permitir customizar a cor de um card (sobrescrevendo a cor do status).
2. Permitir reordenar iniciativas dentro de cada status via drag-and-drop.
3. Permitir editar um item clicando direto na visão Roadmap (sem ir pro `/admin`).
4. Corrigir bug visual em que tarefas curtas "invadiam" o calendário do
   próximo item, fazendo cards parecerem sobrepostos quando uma iniciativa
   terminava e outra começava em data posterior.

## Decision

- Adicionada coluna `color TEXT NULL` em `roadmap_items` (migração `002_color.sql`).
  Cor vazia/`NULL` mantém a cor do status (comportamento atual).
- Endpoint dedicado `PUT /api/items/reorder` aceitando uma lista
  `[{id, sortOrder}]`. Mais simples e idempotente que reusar o `PUT /items/:id`
  para um cenário de atualização em lote de `sort_order`.
- Componente `ItemModal` extraído para `frontend/src/ItemModal.tsx`,
  reutilizado por `Admin.tsx` e `Roadmap.tsx`. Edição inline aparece apenas
  quando `user.role === "admin"`.
- DnD implementado com a API HTML5 nativa (`draggable`, `onDragOver`, `onDrop`),
  evitando adicionar `react-dnd` / `dnd-kit` ao bundle. Reordenação é
  restrita ao mesmo grupo de status para não introduzir mudanças de status
  como efeito colateral de um arraste.
- Correção do bug visual em `roadmap-utils.ts`:
  - Nova função `endDateToFractional` trata o `endDate` como **inclusivo**
    (fim do dia `D`, i.e. `d/daysInMonth`), enquanto `dateToFractional`
    continua representando início do dia para `startDate`.
  - Removido o piso de `0.5` mês (~15 dias) na largura mínima da barra em
    `Gantt.tsx`. A visibilidade mínima passa a ser controlada apenas pelo
    `minWidth: 8px` em pixels. Antes, tarefas curtas eram esticadas para
    meio mês inteiro de largura e visualmente invadiam o calendário do
    próximo item.

## Rationale

- Cor opcional (NULL fallback) mantém retrocompatibilidade total — itens
  existentes não mudam de aparência.
- Sanitização no backend (`#RRGGBB` via regex) impede injeção via campo
  `color`, mesmo com o front passando valor confiável.
- Endpoint de reorder em lote evita N round-trips quando o usuário arrasta
  uma linha que muda muitos `sort_order` na sequência.
- DnD nativo é suficiente para o caso de uso (reordenar linhas em uma lista
  pequena) e não impõe nova dependência.
- Edição inline reaproveitando o mesmo `ItemModal` garante consistência
  visual e comportamental entre `/` e `/admin`.

## Trade-offs

**Pros:**
- Workflow muito mais rápido — admin não precisa alternar para `/admin`
  para uma edição pontual.
- Reordenação visual direta no Gantt; sem campo "ordem" manual.
- Bug das datas corrigido para todos os usuários e todos os cards.
- Zero dependências novas no frontend.

**Cons:**
- DnD nativo HTML5 não tem animação suave de reordenação; a UX é funcional
  mas menos polida que `dnd-kit`. Aceitável para um app interno.
- O Gantt agora tem dois "modos" implícitos (read-only vs. interativo)
  baseado em props (`onSelect`, `onReorder`). Para crescer mais, considerar
  extrair um wrapper `EditableGantt`.

## Alternatives Considered

- **Editar via duplo-clique no card** vez de click simples: descartado por
  ser menos descobrível para usuários da diretoria que esporadicamente
  precisam editar.
- **dnd-kit / react-dnd**: descartado para evitar nova dependência;
  HTML5 DnD nativo cobre o cenário.
- **Reorder via campo `position` baseado em float (LexoRank)**: descartado
  por excesso de engenharia para listas com ~10–50 itens.
- **Misturar `color` em `BAR_COLORS`** (mutar globalmente): descartado,
  por-item via prop é mais limpo.
