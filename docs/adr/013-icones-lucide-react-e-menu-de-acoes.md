# 013 - Ícones lucide-react e menu de ações do roadmap em dropdown

**Status:** Accepted

## Context

A interface usava emojis e símbolos Unicode como ícones (`⚠`, `⚡`, `✓`, `🔗`,
`🔒`, `←`, `→`, `↳`, `×`). Emojis renderizam de forma inconsistente entre
sistemas operacionais e navegadores (cores, tamanho, alinhamento vertical), o
que destoa do visual do produto e dificulta o controle fino de tamanho/cor.

Além disso, o cabeçalho do roadmap acumulava ações soltas ("Renomear",
"Compartilhar", "Excluir roadmap") ao lado de "+ Nova iniciativa", competindo por
espaço com os chips de risco e poluindo a barra superior.

## Decision

1. Adotar **lucide-react** como biblioteca de ícones do frontend e substituir
   todos os emojis/glyphs por componentes de ícone.
2. Reunir as ações de gestão do roadmap (Renomear, Compartilhar, Excluir) em um
   **menu suspenso** disparado por um botão de **9 pontos** (grade 3×3),
   posicionado à direita de "Exportar PDF". Os itens do menu respeitam as
   permissões (`canEdit`/`canShare`/`canDelete`) e o menu não aparece quando não
   há nenhuma ação disponível.

`RISK_META` em `roadmap-utils.ts` passou a guardar o **componente** do ícone
(`Icon: LucideIcon`) em vez de uma string de emoji. O check (`✓`) dos toasts foi
encapsulado em um componente `Toast` reutilizável.

## Rationale

- lucide-react é leve (tree-shaking por ícone), tem ampla cobertura, combina com
  o stack React + Vite do projeto e renderiza SVG com `currentColor`, permitindo
  herdar cor e definir tamanho com precisão.
- O ícone de "9 pontos" foi um pedido explícito do usuário. O lucide não tem um
  equivalente exato (o mais próximo, `Grip`, tem 6 pontos), então o ícone é
  desenhado como um SVG simples de 9 círculos dentro do próprio `ActionMenu`.
- Agrupar as ações em dropdown limpa o cabeçalho e segue o padrão de mercado de
  "mais ações" próximo às ações primárias (exportação).

## Trade-offs

**Pros:**
- Ícones consistentes entre plataformas, com controle de cor e tamanho.
- Cabeçalho mais limpo; ações de gestão agrupadas e previsíveis.
- `Toast` e `ActionMenu` reutilizáveis reduzem duplicação.

**Cons:**
- Nova dependência de runtime no frontend.
- O ícone de 9 pontos é um SVG ad hoc (não vem do lucide), exigindo manutenção
  própria caso o visual mude.
- Ações antes visíveis num clique agora exigem abrir o menu (um passo a mais).

## Alternatives Considered

- **Manter emojis:** descartado pela renderização inconsistente e baixo controle
  de estilo.
- **react-icons / Heroicons:** equivalentes válidos; lucide foi escolhido pela
  leveza, API simples e bom encaixe com o ecossistema usado.
- **Ícone `Grip` do lucide para o gatilho:** descartado por ter 6 pontos, não 9
  como solicitado.
- **shadcn/ui DropdownMenu (Radix):** traria acessibilidade pronta, mas o projeto
  usa inline styles e não tem shadcn/Radix instalados; um dropdown próprio e
  enxuto (clique-fora + Esc) evita introduzir Radix só para isto.
