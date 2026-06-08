#!/usr/bin/env bash
# Carrega o backup mais recente no Postgres local para dev/preview.
# NÃO usar em produção. Requer DATABASE_URL no ambiente.
#
# Estratégia de carga (nesta ordem):
#   1) Se houver `psql` no PATH, usa-o contra $DATABASE_URL.
#   2) Caso contrário, carrega via container do Postgres do projeto
#      (<repo>-db) usando `podman exec` — o cliente psql vive lá dentro.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: defina DATABASE_URL (ex.: export \$(grep DATABASE_URL .env))" >&2
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
BACKUP="$(ls -t "$ROOT"/backups/roadmap_*.sql 2>/dev/null | head -1 || true)"
if [ -z "$BACKUP" ]; then
  echo "ERRO: nenhum backup encontrado em backups/roadmap_*.sql" >&2
  exit 1
fi

echo "Restaurando $BACKUP ..."
if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$BACKUP"
else
  CONTAINER_NAME="$(basename "$ROOT")-db"
  if ! podman ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "ERRO: psql não está no PATH e o container '$CONTAINER_NAME' não está rodando." >&2
    echo "Suba o banco (ver skill tech-stack) ou instale o cliente psql." >&2
    exit 1
  fi
  echo "psql não encontrado no host; carregando via container '$CONTAINER_NAME'."
  podman exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=0 < "$BACKUP"
fi
echo "Seed concluído. Suba o backend para aplicar as migrações 004/005."
