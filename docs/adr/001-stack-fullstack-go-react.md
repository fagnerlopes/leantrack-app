# 001 - Stack full-stack Go + React + Postgres em um único binário

**Status:** Accepted

## Context
O usuário começou pedindo "página estática" a partir de um JSX local, mas mudou o escopo para um app completo com login, banco e dashboard de gestão. Precisamos de uma stack simples de deployar na Locaweb Cloud (container único, porta 80, Postgres).

## Decision
Adotar o stack padrão do cofounder: backend Go (stdlib `net/http` + pgx + sqlc) servindo a SPA React (Vite + TS) buildada como assets estáticos, tudo dentro de um único container.

## Rationale
- Container único = um único alvo de deploy na Locaweb Cloud (`app-deploy`).
- Go stdlib + pgx + sqlc é leve, sem ORM, sem framework — tipos gerados a partir do SQL.
- React + Vite mantém a UI familiar ao desenvolvedor original do JSX e permite reuso quase 1:1 do código de Gantt.

## Trade-offs
**Pros:** simples de operar, footprint baixo, sem dependência de runtime adicional, build reproduzível via multi-stage Dockerfile.
**Cons:** sem SSR (irrelevante aqui), bundle inicial inclui jspdf+html-to-image (~500 KB gzip total) — aceitável dado o uso interno.

## Alternatives Considered
- **HTML estático com React via CDN:** descartado quando o escopo passou a exigir backend.
- **Next.js + Node:** mais peças móveis, runtime Node em produção, dobra surface de manutenção.
