# 017 - Régua de datas fixa: a tela do roadmap vira um "app shell"

**Status:** Accepted

## Context

Os usuários pediram que a **régua de datas** (cabeçalho de trimestres e meses do
Gantt) fique parada ao rolar a página, com apenas a lista de iniciativas se
movendo — o comportamento de planilha, em que o cabeçalho é referência fixa.
Em roadmaps com muitas iniciativas, rolar até o meio da lista fazia a régua sair
de vista e as barras perdiam significado: não dava para saber em que mês cada
barra começava sem voltar ao topo.

Três obstáculos impediam resolver com um `position: sticky` no cabeçalho:

1. O card do Gantt tem `overflow: hidden` (arredondamento das bordas), o que
   cria um *scrollport* e anula o `sticky` ancorado na janela.
2. A div interna tem `overflowX: auto`; pela regra do CSS, quando um eixo deixa
   de ser `visible` o outro vira `auto` — ou seja, ela já era contêiner de
   rolagem nos dois eixos, e um `sticky` ali dentro se ancora nela.
3. Quem rolava verticalmente era a **página**, e a régua estava dentro de um
   contêiner de rolagem próprio — não há como prender um ao outro.

O travamento **horizontal** já existia desde o ADR 014 (coluna "Iniciativa" com
`position: sticky; left: 0`). Faltava o eixo vertical.

## Decision

Trocar o modelo de rolagem da tela do roadmap: a **página deixa de rolar** e o
quadro do Gantt passa a ser o único elemento com rolagem.

- `RoadmapView` vira um *app shell*: raiz com `height: 100dvh` e
  `overflow: hidden`; cabeçalho, barra de filtros, dica e legenda são faixas
  fixas (`flex-shrink: 0`); a área do Gantt ocupa a altura restante
  (`flex: 1; min-height: 0` — sem o `min-height: 0` o item flex não encolhe e
  nada rola).
- No `Gantt`, a div de rolagem ganha `overflow-y: auto` e altura vinda do flex.
  As duas faixas da régua (trimestres e meses) ficam num **wrapper `sticky`
  único** (`top: 0`) — juntas, para não ser preciso medir a altura de uma para
  posicionar a outra. O rodapé com o selo "Hoje" vira `sticky; bottom: 0`.
- O cabeçalho do app (`AppHeader`) ganha `position: sticky; top: 0`, o que vale
  para as telas que continuam rolando (lista de roadmaps, usuários).
- As regras de layout ficam em classes CSS no `index.html` (`.rm-shell`,
  `.rm-main`, `.rm-gantt-card`, `.rm-gantt-scroll`) porque precisam de
  *media query* — o resto do projeto usa estilos inline, que não suportam isso.
- **Telas pequenas:** com altura ≤ 600px **ou** largura ≤ 700px (onde cabeçalho
  e filtros quebram em várias linhas e comem a altura útil), a área da lista
  cairia abaixo de ~320px. Nesses casos a media query desfaz o shell e a página
  volta a rolar por inteiro, como antes.
- **Exportação PNG/PDF:** com o quadro virando uma janela com rolagem, fotografar
  o nó como ele está na tela cortaria o roadmap. Antes de capturar, `captureGantt`
  solta as amarras (`height: auto`, largura igual ao conteúdo, `flex: none` no
  card **e** na área de rolagem, `overflow: visible`) e restaura tudo depois,
  inclusive a posição da rolagem. O `flex: none` é indispensável: como itens de
  um contêiner flex de altura definida, card e área de rolagem seriam
  comprimidos de volta ao tamanho visível e a foto sairia cortada na vertical.

## Rationale

Enquanto quem rola é a página, não existe âncora para a régua: `sticky` se
resolve contra o contêiner de rolagem mais próximo, e o do Gantt não rolava
verticalmente. Inverter o modelo — uma janela fixa com uma lista rolando dentro —
é o que o usuário descreveu e resolve o problema sem medir alturas em JavaScript,
sem `ResizeObserver` e sem biblioteca nova. De quebra, cabeçalho, filtros,
marcador "Hoje" e legenda passam a ficar sempre visíveis.

A alternativa (manter a rolagem da página e aplicar `sticky` em cada faixa)
exigiria conhecer em tempo real a altura do cabeçalho — que muda quando ele
quebra em telas estreitas — para posicionar a faixa seguinte. Mais peças móveis
para o mesmo resultado.

## Trade-offs

**Pros:**
- Régua, cabeçalho, filtros e legenda sempre visíveis; a lista rola sozinha.
- Sem JavaScript de layout: só CSS, verificado por medição no Playwright.
- A exportação melhorou — antes já saía cortada na largura visível, agora sai o
  roadmap inteiro (2540×1493 no roadmap de teste, contra 1230×470 visíveis).
- O `AppHeader` fixo beneficia também as telas de lista.

**Cons:**
- A área útil da lista fica limitada à altura da janela: em telas de 720px sobram
  ~350px (4 a 5 iniciativas por vez). Antes, a rolagem da página mostrava tudo.
- Duas fontes de estilo na tela do roadmap: classes no `index.html` (layout) e
  inline (aparência). Necessário por causa da media query.
- O comportamento passa a depender do tamanho da janela (shell x rolagem de
  página), o que é mais difícil de prever ao dar suporte a alguém.

## Alternatives Considered

- **`sticky` em cada faixa com a página rolando:** exige medir a altura do
  cabeçalho em tempo real (ele quebra em telas estreitas) para empilhar as
  faixas. Mais frágil, mesmo resultado.
- **Fixar só o cabeçalho do app:** uma linha de CSS, mas não atende o pedido — a
  régua continuaria saindo de vista.
- **Duplicar a régua num cabeçalho flutuante sincronizado por JavaScript:**
  usado por algumas bibliotecas de Gantt; traz dessincronização em zoom, custo
  de manutenção e outra fonte de verdade para as colunas.
