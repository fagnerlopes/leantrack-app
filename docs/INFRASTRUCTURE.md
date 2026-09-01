# Infraestrutura

| Name | Image | Local Port | Env Var | Type |
|------|-------|-----------|---------|------|
| db | supabase/postgres:17.6.1.129 | 5432 | DATABASE_URL | backend |

## Serviços externos (SaaS)

| Name | Uso | Env Vars | Observação |
|------|-----|----------|------------|
| Cloudflare Turnstile | Verificação anti-bot no login | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Sem container local; em dev/teste usar as **chaves de teste** do Cloudflare (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`), que sempre aprovam. Verificação desativada se a secret key não estiver configurada. |

Postgres é o único accessory local em execução.
