# 010 - Compartilhamento por colaboradores com permissões granulares

**Status:** Accepted

## Context
O modelo do ADR 007 (autorização por propriedade) só permite que o dono edite o
roadmap. Surgiu a necessidade de o dono permitir que outras pessoas editem o
roadmap dele (ex.: Ana compartilha com Bruno).

## Decision
Introduzir a tabela `roadmap_collaborators (roadmap_id, user_id, can_edit,
can_share, created_by)`. A autorização de mutação passa a considerar
colaboradores: `RequireRoadmapEditor` (dono OU can_edit) libera itens e
renomear; `RequireRoadmapSharer` (dono OU can_share) libera a gestão de
colaboradores; `RequireRoadmapOwner` continua exigido só para excluir o
roadmap. Convite é por e-mail de conta existente; e-mail sem conta retorna 404
com orientação para solicitar o cadastro a um admin.

## Rationale
Permissões independentes (`can_edit`, `can_share`) cobrem os casos pedidos sem
introduzir papéis rígidos. Manter a exclusão exclusiva do dono evita perda de
trabalho por engano. Reaproveitar contas existentes respeita o "sem
auto-cadastro" do ADR 002.

## Trade-offs
**Pros:**
- Colaboração real mantendo o dono no controle do que é destrutivo.
- Aditivo: nenhuma mudança em dados existentes.

**Cons:**
- Mais um eixo de autorização para cobrir em testes.
- `can_share` permite a um colaborador convidar/remover outros (menos o dono).

## Alternatives Considered
- Papéis fixos por roadmap (viewer/editor/admin): mais rígido que duas flags.
- Transferência de propriedade: fora de escopo nesta fase.
