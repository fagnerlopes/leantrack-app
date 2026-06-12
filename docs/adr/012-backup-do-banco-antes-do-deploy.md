# 012 - Backup do banco de produção antes de cada deploy

**Status:** Accepted

## Context

O ambiente `roadmap` faz deploy automático a cada push na branch `main` — não há
um passo manual entre "salvar" e "publicar". Foi definido como requisito que
nenhuma publicação que afete produção ocorra sem um backup do banco feito antes,
para que sempre exista um ponto de restauração recente caso um deploy introduza
um problema (ex.: uma migração defeituosa).

A plataforma já tira snapshots diários do disco `/data`, mas o snapshot é
periódico e cobre o disco inteiro — não garante uma cópia lógica do banco no
instante imediatamente anterior a cada publicação.

## Decision

Adicionar um passo **"Backup database before deploy"** no job `deploy` do workflow
`deploy-roadmap.yml`, executado **depois** do provisionamento da infra (quando o
IP da VM do banco já é conhecido) e **antes** do `kamal setup`/`deploy`:

- Faz `pg_dump -Fc` do banco via `docker exec` na VM do banco (acesso por SSH com
  a chave já carregada pelo `ssh-agent`).
- Salva o dump em `/data/backups/predeploy-<timestamp>.dump` na VM do banco
  (disco com snapshot diário).
- Valida o dump (`pg_restore --list`) e sobe uma cópia como **artefato do run**
  (`db-backup-<timestamp>`, retenção de 90 dias) — uma cópia fora da VM.
- **Primeiro deploy:** se o container do banco ainda não existe, o passo é pulado
  de propósito (não há o que copiar).
- **Ambiente com banco existente:** se o backup falhar, o passo falha e o deploy é
  abortado (a publicação só prossegue com backup bem-sucedido).

## Rationale

- Como o deploy dispara no push, a única forma de garantir "backup antes de
  publicar" sem depender de memória humana é embutir a trava no próprio pipeline.
- Guardar em `/data/backups` aproveita o disco com snapshot; o artefato dá uma
  cópia externa, baixável pela interface do Actions.
- `pg_dump` lógico complementa o snapshot de disco: é restaurável seletivamente e
  representa um instante exato (pré-publicação).

## Trade-offs

**Pros:**
- Ponto de restauração garantido imediatamente antes de cada publicação.
- Cópia dupla: na VM (snapshot) e como artefato (fora da VM).
- Falha de backup interrompe o deploy — impossível publicar sem rede de segurança.

**Cons:**
- Cada deploy fica um pouco mais lento (tempo do `pg_dump` + transferência).
- Para bancos grandes, o dump e o artefato podem crescer; pode ser necessário
  rever retenção/estratégia (ex.: dump comprimido já em uso, ou mover para storage
  dedicado) no futuro.
- O artefato fica retido por 90 dias; backups de longo prazo dependem dos
  snapshots de disco.

## Alternatives Considered

- **Confiar só nos snapshots diários do disco:** descartado — não garante uma
  cópia no instante anterior a cada deploy, e a granularidade é diária.
- **Backup no início da sessão (regra no CLAUDE.md / hook):** útil como ponto de
  restauração inicial, mas depende de execução fora do pipeline; não cobre o
  instante da publicação de forma garantida. Pode ser somado no futuro.
- **Enviar o dump para um storage de objetos dedicado:** descartado por ora — a
  plataforma é Postgres-only (sem storage de objetos incluso); `/data` + artefato
  atendem sem serviço adicional.
