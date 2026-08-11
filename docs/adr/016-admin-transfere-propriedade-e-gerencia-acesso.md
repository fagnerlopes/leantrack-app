# 016 - Admin transfere a propriedade de roadmaps e gerencia o compartilhamento

**Status:** Accepted

## Context

O modelo de autorização (ADR 007 e 010) é de **propriedade**: só o dono edita e
exclui seu roadmap, e só ele (ou um colaborador com `can_share`) concede acesso
a outras pessoas. O admin, até aqui, gerenciava apenas **contas** (ADR 015) — em
relação a roadmaps era um usuário comum.

Isso criou um beco sem saída na prática: **colaboradores deixaram a empresa e os
roadmaps de que eram donos ficaram órfãos**. Ninguém consegue editá-los, e
tampouco existe alguém habilitado a conceder acesso a um substituto — a única
pessoa que poderia fazer isso é justamente quem saiu. Como não há transferência
de propriedade (explicitamente fora de escopo no ADR 010), o conteúdo fica
congelado.

As saídas disponíveis antes desta decisão eram todas ruins:

- Reativar a conta de quem saiu e usar a senha dela — inaceitável em segurança.
- Remover a conta do ex-colaborador — pior: `roadmaps.owner_id` tem
  `ON DELETE CASCADE`, então **apagaria os roadmaps e todas as iniciativas**.
- Recriar o roadmap na mão a partir de um print — perde histórico e dá trabalho.

## Decision

O admin (papel `admin`, quem já administra contas) ganha dois poderes sobre
roadmaps, expostos num painel próprio em `/admin/roadmaps`:

1. **Transferir a propriedade** de qualquer roadmap para outro usuário
   (`PUT /api/admin/roadmaps/{id}/owner`). Na transferência o admin escolhe, por
   uma caixa de seleção, **manter ou não o dono anterior como colaborador com
   permissão de editar** — desmarcado por padrão, que é o caso de quem saiu da
   empresa.
2. **Gerenciar o compartilhamento** de qualquer roadmap: `RequireRoadmapSharer`
   passa a aceitar `role == "admin"`, além do dono e de colaboradores com
   `can_share`. Na prática o botão "Compartilhar" fica visível ao admin em
   qualquer roadmap (`canShare` no DTO) e ele pode convidar, ajustar permissões
   e remover colaboradores.

O painel lista todos os roadmaps com **nome e e-mail do dono** (o e-mail é o que
permite reconhecer a conta de quem saiu), o número de iniciativas e o de
colaboradores, com um filtro por texto.

**O que o admin deliberadamente NÃO ganha:**

- **Editar conteúdo** de roadmaps alheios — `RequireRoadmapEditor` continua
  restrito a dono e colaboradores com `can_edit`. Se o admin precisar mexer nas
  iniciativas, ele se convida como colaborador (ação visível e reversível) ou
  transfere a propriedade.
- **Excluir roadmaps** alheios — `RequireRoadmapOwner` segue exclusivo do dono,
  mantendo a garantia do ADR 010 de que exclusão é irreversível e nunca é feita
  por terceiros.

Detalhes de comportamento da transferência:

- O novo dono, se já era colaborador, tem o vínculo removido — senão apareceria
  duas vezes em "pessoas com acesso", com permissões que o `owner_id` já supera.
- A restrição `UNIQUE (owner_id, name)` é **checada antes** do `UPDATE`
  (`CountRoadmapsByOwnerAndName`) para devolver um 409 com mensagem legível em
  vez de depender do erro 23505 do Postgres — que, além de gerar mensagem ruim,
  aborta a transação em curso. O tratamento de 23505 permanece como rede de
  segurança contra corrida.
- Quando "manter o dono anterior" está marcado, o vínculo é criado **antes** do
  `UPDATE` e desfeito se ele falhar, de modo que uma transferência recusada não
  deixe rastro.

## Rationale

O admin já é a autoridade sobre **quem existe** na ferramenta (cria, remove e
reseta senhas). Estender essa autoridade para **quem responde por cada roadmap**
é a continuação natural: ambas são decisões organizacionais, não de conteúdo.

Separar "gerenciar acesso" de "editar conteúdo" mantém a promessa central do
produto — o dono responde pelo que está escrito no seu roadmap. O admin
destrava a situação sem virar um super-editor invisível; se ele quiser editar,
precisa se conceder acesso explicitamente, e isso fica visível na lista de
pessoas com acesso.

O painel separado (em vez de só um botão dentro do roadmap) resolve o problema
real: o admin precisa **encontrar** os roadmaps órfãos, e para isso precisa de
uma visão de conjunto com o e-mail dos donos.

## Trade-offs

**Pros:**

- Roadmaps deixam de ser perdidos quando alguém sai da empresa — sem apagar
  dados nem reativar contas.
- Também serve à troca planejada de responsável (com a opção de manter o dono
  anterior ajudando).
- Reaproveita todo o mecanismo de colaboradores existente (ADR 010): nenhum
  conceito novo de permissão, nenhuma migração de banco.
- O admin não ganha poder de edição silencioso: qualquer acesso que ele se
  conceda aparece na lista de pessoas com acesso.

**Cons:**

- Quebra a simetria do ADR 010, onde admins eram usuários comuns quanto a
  roadmaps. Agora há uma exceção a documentar e lembrar.
- A transferência não é transacional (o handler usa `Queries` direto, sem `tx`,
  como o resto do código). Mitigado pela ordem das operações — o passo que pode
  falhar por conflito vem depois do passo reversível.
- Sem histórico de auditoria (fora de escopo do produto): a troca de dono fica
  registrada só no log da aplicação (`slog.Info` com quem transferiu, de quem
  para quem).

## Alternatives Considered

- **Dar ao admin poder total (editar e excluir qualquer roadmap):** descartado.
  Resolveria o problema, mas esvaziaria o modelo de propriedade e tornaria
  possível apagar o trabalho alheio sem rastro.
- **Marcar contas como "inativas" e reatribuir automaticamente ao admin:**
  descartado. Exige um conceito novo (conta inativa) e adivinha o destino certo,
  que é uma decisão humana — pode não ser o admin quem assume o roadmap.
- **Permitir que o próprio dono transfira antes de sair:** desejável, mas não
  resolve o caso presente (as pessoas já saíram) e depende de um processo de
  offboarding disciplinado. Pode ser somado depois.
- **Trocar `ON DELETE CASCADE` por reatribuição na exclusão da conta:**
  descartado como solução única — reduz o risco de perda de dados, mas não
  destrava roadmaps de contas que continuam existindo. Vale como melhoria
  independente no futuro.
