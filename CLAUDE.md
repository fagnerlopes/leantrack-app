<!-- cofounder:begin -->
The cofounder operating instructions are maintained in @AGENTS.md — read and follow them.
<!-- cofounder:end -->

## Regras do projeto

- **Backup antes de publicar (automático):** o workflow de deploy
  (`.github/workflows/deploy-roadmap.yml`, passo *"Backup database before deploy"*)
  faz `pg_dump` do banco de produção ANTES de aplicar a nova versão. O dump é
  salvo em `/data/backups` na VM do banco (disco com snapshot diário) e anexado
  como artefato do run (`db-backup-<timestamp>`, retenção 90 dias). Se o backup
  falhar num ambiente que já tem banco, o deploy é abortado. Ver ADR 012.
  - Ao alterar o pipeline de deploy, **preserve esse passo** — é a trava que
    garante um ponto de restauração antes de cada publicação.
