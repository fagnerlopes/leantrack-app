# 018 - Ajuste de datas arrastando a barra da iniciativa

**Status:** Accepted

## Context

Mudar datas era caro. Cada ajuste exigia abrir a iniciativa, encontrar os dois
campos de data, digitar e salvar — quatro passos para mover uma barra duas
semanas. Num roadmap com 20 iniciativas, replanejar um trimestre virava um
trabalho de dezenas de cliques, e datas de início e fim mudam com frequência.

O pedido foi explícito: mexer nas datas **pelas alças do retângulo**, como no
monday.com — puxar a ponta esquerda muda o início, a direita muda o fim.

O ponto delicado é a convivência de gestos sobre a mesma superfície. A área do
Gantt já responde a três interações com o ponteiro:

1. **Pan da timeline** — arrastar qualquer ponto vazio rola o quadro no tempo
   (ADR 017).
2. **Reordenação** — arrastar o título move a iniciativa dentro do status
   (HTML5 drag and drop).
3. **Clique na linha** — abre a iniciativa para edição.

Um quarto gesto sobre a barra precisa não roubar nem ser roubado por esses três.

## Decision

Implementar o arrasto com **Pointer Events nativos**, sem biblioteca nova, e
manter toda a conversão "posição → data" em **funções puras** em
`roadmap-utils.ts`, separadas do componente.

**Três gestos sobre a barra:**

| Gesto | Efeito |
|-------|--------|
| Alça esquerda | Muda só a data de início |
| Alça direita | Muda só a data de fim |
| Corpo da barra | Desloca as duas datas preservando a duração exata em dias |

**O que faz o gesto ser confiável:**

- **Captura de ponteiro** (`setPointerCapture`) na alça: o arrasto sobrevive a
  sair da barra, da linha e até da janela — a alça continua recebendo os
  eventos até soltar o botão.
- **Limiar de 3px** antes de virar arrasto. Abaixo disso o gesto ainda é um
  clique e abre a edição, como antes. Ao soltar depois de um arrasto, o clique
  seguinte é engolido (`onClickCapture`) para a janela não abrir sozinha.
- **Origem fixa:** cada quadro recalcula as datas a partir de onde o gesto
  começou, nunca a partir do quadro anterior — assim o arredondamento para dia
  não se acumula ao longo do movimento.
- **Rolagem automática** junto às bordas (56px, 16px por quadro, em
  `requestAnimationFrame`): permite empurrar uma iniciativa para um trimestre
  fora da tela. O deslocamento da rolagem entra na conta da data, senão a barra
  "escorregaria" enquanto o quadro anda.
- **Isolamento entre gestos:** alças e barra são marcadas com `data-bar-drag`,
  que o pan da timeline já ignora (mesma lista de `a, button, input,
  [data-reorder-handle]`). O `stopPropagation` no `pointerdown` fecha o resto.
- **Limites:** as pontas nunca se cruzam (duração mínima de 1 dia) e nenhuma
  data escapa do intervalo desenhado na timeline. `Esc` desiste do arrasto.
- **Salvamento otimista:** a lista muda na hora e é desfeita se o `PUT` falhar,
  com aviso ao usuário. Enquanto a gravação não termina, a barra permanece nas
  datas provisórias — não pisca de volta para a posição antiga.
- **Feedback:** as alças aparecem ao passar o mouse (CSS, sem estado no React,
  o que também as mantém fora das exportações PNG/PDF); durante o arrasto a
  barra ganha um anel, a linha é tingida e um selo no topo do quadro mostra
  "início → fim · N dias" enquanto o gesto acontece.
- **Teclado:** as alças são `<button>` de verdade, com `aria-label` que nomeia a
  iniciativa. `←`/`→` ajustam um dia, `Shift` sete. Uma sequência de teclas
  acumula e sai numa **única** gravação (500ms de espera).

Só há alças quando o roadmap é editável **e** a iniciativa já tem as duas datas
cadastradas — sem elas não existe barra real para arrastar.

## Rationale

**Por que não usar biblioteca.** Foram consideradas as opções maduras do
ecossistema, e nenhuma se encaixa bem:

- Bibliotecas de *drag and drop* (`dnd-kit`, `react-dnd`) resolvem mover itens
  entre listas, não redimensionar pelas pontas — o caso aqui.
- Bibliotecas de redimensionamento (`interact.js`, `react-moveable`) resolvem,
  mas escrevem `transform`/`width` em pixels no elemento. A barra é posicionada
  em **porcentagem de uma timeline virtual**, então seria preciso traduzir de
  volta a cada quadro — a mesma conta que já fazemos, com uma dependência a
  mais no meio, e com um segundo mecanismo de captura de ponteiro brigando com
  o pan do ADR 017.
- Componentes de Gantt prontos (`frappe-gantt`, `gantt-task-react`) trariam a
  funcionalidade inteira, mas substituiriam o quadro atual — junto com régua
  fixa, riscos, dependências externas, marcos, cores e exportação.

O que sobra de específico do projeto é a conversão pixel ↔ data, que a
biblioteca não faria por nós. A parte genérica — capturar o ponteiro e seguir o
movimento — são as ~40 linhas que qualquer uma dessas bibliotecas embrulha, e
que o componente **já tinha** para o pan da timeline. Reusar o padrão que está
lá é mais previsível do que fazer dois mecanismos coexistirem.

**Por que a matemática fica fora do componente.** `computeDragDates` e
`shiftDatesByDays` recebem datas e um deslocamento e devolvem datas. Isso deixa
as regras difíceis (duração preservada, pontas que não se cruzam, limites da
timeline, meses de tamanhos diferentes, ano bissexto) cobertas por testes
rápidos, sem simular mouse. Toda a aritmética de datas é feita em **UTC**: em
horário local, um dia de horário de verão tem 23 ou 25 horas e o arrasto erraria
por um dia.

**Por que arrastar o corpo também.** É o mesmo mecanismo e cobre o caso mais
comum do pedido — "essa iniciativa toda escorregou duas semanas". Sem ele o
usuário teria que puxar as duas pontas na mesma medida, à mão.

## Trade-offs

**Pros:**
- Replanejar deixou de ser um formulário: puxa a ponta e pronto.
- Nenhuma dependência nova; o pacote do frontend não cresceu.
- As regras de data são funções puras — 20 casos de teste sem navegador.
- Funciona por teclado e é anunciado por leitores de tela; funciona no toque.
- O arrasto do corpo cobre o replanejamento em bloco de graça.

**Cons:**
- A precisão do arrasto depende do zoom da timeline: num roadmap de 3 anos, um
  pixel vale mais de um dia. O ajuste fino continua sendo o teclado ou a janela
  de edição.
- Uma alça pode ficar escondida atrás da coluna fixa de títulos quando a barra
  começa antes da área visível — é preciso rolar a timeline até ela. Mesma
  limitação de qualquer Gantt com coluna fixa.
- Cada arrasto grava a iniciativa inteira (`PUT` do item completo). Se duas
  pessoas mexerem na mesma iniciativa ao mesmo tempo, a última vence.
- O arrasto real não é coberto por teste unitário (o jsdom não tem geometria);
  a garantia vem do script Playwright, que só roda com o app de pé.

## Alternatives Considered

- **`interact.js` / `react-moveable`:** abstraem o gesto, mas em pixels — a
  conversão para a timeline em porcentagem continuaria por nossa conta, e o
  mecanismo de captura brigaria com o pan já existente.
- **`dnd-kit`:** ótimo para reordenar listas, não para redimensionar pelas
  pontas.
- **Trocar o quadro por um componente de Gantt pronto:** entregaria o arrasto,
  mas jogaria fora régua fixa, riscos, dependências externas, marcos, cores e
  exportação — tudo já feito e testado.
- **Só as alças, sem arrastar o corpo:** menos código, mas deixa de fora o caso
  mais comum (a iniciativa inteira andou).
- **Ajuste contínuo salvando a cada quadro:** simples de escrever e péssimo na
  prática — dezenas de `PUT` por arrasto. Grava-se ao soltar.
- **Encaixe em semanas ou meses:** rejeitado por decidir pelo usuário. O encaixe
  é no dia, a menor unidade que as datas têm.
