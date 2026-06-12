# 014 - Timeline dinâmica derivada das datas das iniciativas

**Status:** Accepted

## Context

O Gantt tinha o início da linha do tempo fixo em **maio/2026**: a constante
`base = (2026 - 1) * 12 + 5` (repetida em três funções de conversão de data), o
array `MONTHS` (13 meses fixos), `TOTAL_MONTHS = 13` e a lista `QUARTERS`. Como
consequência, iniciativas com datas anteriores a maio/2026 produziam fração
negativa e eram "grudadas" na borda esquerda (`Math.max(0, startFrac)`), ou seja,
não apareciam no período correto. Roadmaps com trabalho iniciado antes de maio
ficavam ilegíveis.

## Decision

Calcular o intervalo da timeline dinamicamente a partir das datas cadastradas.
Uma única função `buildTimeline(items)` em `roadmap-utils.ts` devolve um objeto
`Timeline` imutável com `baseAbsMonth`, `totalMonths`, `months`, `quarters`,
`todayFrac`/`todayInRange`/`todayLabel` e os conversores
`dateToFractional`/`endDateToFractional` já fechados sobre a base.

- **Intervalo:** menor e maior data entre `startDate`, `endDate` e `extMilestone`
  de todos os itens; recua/avança 1 mês de folga e arredonda para trimestre cheio
  (início do trimestre vira a coluna 0; fim do trimestre fecha o último). Assim
  `totalMonths` é múltiplo de 3 e o cabeçalho de trimestres fica inteiro.
- **Sem datas:** fallback para um intervalo em torno de hoje.
- **Navegação:** "arrastar com o mouse" (pan via pointer events) na área do
  gráfico, além da barra de rolagem. O puxador de reordenação migrou da linha
  inteira para um ícone (`GripVertical`) na coluna do nome, liberando a área do
  gráfico para o pan sem conflitar com o drag nativo do HTML5.
- **Posição inicial:** rolagem centralizada no "Hoje" (clamp nas bordas); o
  marcador "Hoje" só é desenhado quando está dentro do intervalo.
- **Coluna de nomes fixa:** as células da coluna "Iniciativa" viraram
  `position: sticky; left: 0`, para os nomes não sumirem ao rolar/arrastar.
- **Filtro "Trimestre":** o dropdown e o filtro em `RoadmapView` passam a usar
  `timeline.quarters`/`timeline.dateToFractional`. A timeline é calculada de
  **todas** as iniciativas (não das filtradas) para o intervalo ser estável ao
  filtrar.

## Rationale

Centralizar todo o cálculo de datas numa função pura e testável elimina a base
fixa e mantém Gantt e filtro de trimestre sempre coerentes. Arredondar para
trimestres preserva o cabeçalho `Q1–Q4` alinhado e legível. A coluna fixa era
necessária porque a rolagem inicial (centralizar no "Hoje") passou a cortar os
nomes.

## Trade-offs

**Pros:**
- Qualquer período aparece, inclusive antes de maio.
- Trimestres e filtro acompanham o período real.
- Cálculo de datas isolado e coberto por testes unitários.

**Cons:**
- Largura de coluna fixa por mês: períodos longos exigem rolar/arrastar (decisão
  consciente — alternativa "encaixar tudo" deixaria as barras estreitas demais).
- A timeline recalcula ao mudar a lista de itens (re-render do `useMemo`).

## Alternatives Considered

- **Manter base fixa e só ampliar a janela:** continuaria engessado e quebraria
  de novo com datas fora da nova janela. Descartado.
- **Encaixar todo o período na largura da tela (sem rolagem):** barras ficariam
  ilegíveis em roadmaps longos. Descartado em favor de largura fixa + pan.
- **Zoom (semana/mês/trimestre):** maior do que o necessário agora; fora de
  escopo.
