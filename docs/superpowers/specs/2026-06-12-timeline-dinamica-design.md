# Timeline dinâmica e arrastável

**Data:** 2026-06-12
**Status:** Aprovado

## Problema

A linha do tempo do Gantt começa fixa em **maio/2026**. A constante
`base = (2026 - 1) * 12 + 5` (repetida em `fractionalForDate`,
`dateToFractional` e `endDateToFractional`), o array `MONTHS` (13 meses fixos),
`TOTAL_MONTHS = 13` e a lista `QUARTERS` engessam o intervalo. Iniciativas com
datas anteriores a maio/2026 têm fração negativa e são "grudadas" na borda
esquerda (`Math.max(0, startFrac)`), ou seja, não são exibidas no período
correto.

## Objetivo

Calcular o intervalo da timeline dinamicamente a partir das datas das
iniciativas, exibindo qualquer período (inclusive antes de maio), e permitir
navegar arrastando a timeline com o mouse.

## Decisões (confirmadas com o usuário)

1. **Intervalo:** derivado das datas das iniciativas, arredondado para
   trimestres com 1 mês de folga em cada ponta.
2. **Navegação:** arrastar com o mouse (pan) na área do gráfico, mantendo
   também a barra de rolagem horizontal.
3. **Posição inicial:** ao abrir, rolagem centralizada no marcador "Hoje".
4. **Trimestres (Q1–Q4):** permanecem, gerados dinamicamente para cobrir o
   intervalo; rótulo `Qn AAAA`.

## Design

### `buildTimeline(items)` — núcleo

Nova função em `frontend/src/roadmap-utils.ts` que recebe a lista de iniciativas
e devolve um objeto `Timeline` imutável:

```
type Timeline = {
  baseAbsMonth: number;     // índice absoluto de mês da coluna 0  ((ano-1)*12 + mês)
  totalMonths: number;      // nº de colunas de mês
  months: string[];         // rótulos: "Mai", "Jun", ..., "Jan'27" (ano no Jan e na 1ª coluna)
  quarters: { label: string; start: number; span: number }[];  // "Qn AAAA"
  todayFrac: number;        // posição fracionária de hoje (pode ficar fora de [0, totalMonths])
  todayInRange: boolean;    // se o marcador "Hoje" deve ser desenhado
  todayLabel: string;       // "12 Jun 2026"
  dateToFractional(d: string | null): number | null;     // relativo a baseAbsMonth
  endDateToFractional(d: string | null): number | null;  // idem, +1 dia no fim
};
```

**Cálculo do intervalo:**

1. Coletar todas as datas relevantes de todos os itens: `startDate`, `endDate`,
   `extMilestone`.
2. Se não houver nenhuma data, usar a data de hoje como mín. e máx. (padrão
   sensato em torno de hoje).
3. `min` = data mais antiga; `max` = data mais recente.
4. Recuar `min` em 1 mês e arredondar para o **início do trimestre**
   (mês ∈ {jan, abr, jul, out}). Esse mês vira `baseAbsMonth` (coluna 0).
5. Avançar `max` em 1 mês e arredondar para o **fim do trimestre**.
6. `totalMonths` = nº de meses de `base` até o fim (múltiplo de 3, garantindo
   trimestres inteiros no cabeçalho).

**Meses e trimestres** são gerados a partir de `baseAbsMonth`/`totalMonths`. O
rótulo de mês mostra o ano (`'AA`) em todo janeiro e na primeira coluna.

As funções `dateToFractional`/`endDateToFractional` deixam de usar a constante
fixa e passam a calcular a fração relativa a `baseAbsMonth`.

### `Gantt.tsx`

- Recebe `timeline: Timeline` por prop (em vez de importar `MONTHS`,
  `TOTAL_MONTHS`, `QUARTERS`, `TODAY_FRAC`, `TODAY_LABEL` do módulo).
- Usa `timeline.months`, `timeline.quarters`, `timeline.totalMonths`,
  `timeline.dateToFractional`, etc.
- O marcador/badge "Hoje" só é renderizado quando `timeline.todayInRange`.
- **Pan:** handlers de ponteiro no contêiner com `overflowX:auto`. Ao apontar e
  mover além de um limiar (~5px), entra em modo pan (cursor "grabbing"),
  ajustando `scrollLeft`; ao soltar, suprime o clique seguinte para não
  selecionar a iniciativa por engano. Pan não inicia sobre elementos
  interativos (links/botões) nem sobre o "puxador" de reordenação.
- **Reordenação:** o `draggable` (HTML5 drag) migra da linha inteira para a
  **célula do nome da iniciativa** (coluna da esquerda), que vira o puxador.
  Isso libera a área do gráfico para o pan sem que o drag nativo intercepte.
- **Rolagem inicial:** via `innerRef`/ref do contêiner, ao montar e quando a
  timeline muda, posiciona `scrollLeft` para centralizar `todayFrac`
  (com clamp nas bordas quando hoje está fora do intervalo).

### `RoadmapView.tsx`

- Calcula `timeline = useMemo(() => buildTimeline(items), [items])` a partir de
  **todas** as iniciativas (não das filtradas), para o intervalo ser estável ao
  filtrar.
- Passa `timeline` ao `<Gantt>` (renderizando os itens `filtered`).
- O dropdown "Trimestre" e o filtro passam a usar `timeline.quarters` e
  `timeline.dateToFractional`.

## Fora de escopo

- Zoom (mudar a granularidade de mês para semana/trimestre).
- Persistir a posição de rolagem entre sessões.
- Mudanças no backend ou no modelo de dados (as datas já existem).

## Testes

- **Unitários (`roadmap-utils.test.ts`):**
  - intervalo derivado de itens que cruzam trimestres;
  - **caso do bug:** iniciativa com início antes de maio/2026 gera fração ≥ 0 e
    `baseAbsMonth` anterior a maio;
  - fallback sem datas (em torno de hoje);
  - `dateToFractional`/`endDateToFractional` relativos ao `baseAbsMonth`;
  - `quarters` cobrindo o intervalo com `span` somando `totalMonths`.
- **Visual:** captura de tela de um roadmap com iniciativa anterior a maio,
  confirmando que a barra aparece no período correto e o pan funciona.
