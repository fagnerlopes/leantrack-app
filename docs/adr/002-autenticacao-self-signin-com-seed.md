# 002 - Autenticação por self sign-in com usuários seed

**Status:** Accepted

## Context
O app é de de uso interno de uma equipe e da sua diretoria. Precisa-se de algo seguro o bastante para conteúdo confidencial, mas que seja simples para começar.

## Decision
Email + senha com **bcrypt**, sessão em tabela `sessions` referenciada por cookie HttpOnly+SameSite Lax, TTL 7 dias. Usuário admin criado em runtime via `UpsertSeedUser` lendo `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` do `.env` a cada start (idempotente).

## Rationale
- O `tech-stack` do cofounder explicitamente diz: "self sign-in é OK para prototipar, depois mover para magic link ou Google Auth".
- Para v1 com poucos usuários e uso interno, basta.
- O seed permite que o primeiro admin exista sem migration de dados.

## Trade-offs
**Pros:** sem dependência externa (SMTP, Google Cloud), funciona offline, rotação de senha é trivial.
**Cons:** senhas no `.env`, sem MFA, sem reset por email.

## Alternatives Considered
- **Magic link via SMTP:** exige configurar gateway, fora do escopo desta release.
- **Google Auth:** mais seguro mas requer console do Google e domínio configurado — futuro.
