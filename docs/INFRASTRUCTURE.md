# Infraestrutura

| Name | Image | Local Port | Env Var | Type |
|------|-------|-----------|---------|------|
| db | supabase/postgres:17.6.1.129 | 5432 | DATABASE_URL | backend |

O container local se chama `leantrack-app-db` — a convenção é
`<nome-do-diretório>-db`, e coincide com o nome que o workflow de deploy usa na
VM do banco. Postgres é o único accessory em execução.

## Serviços externos (SaaS)

| Name | Uso | Env Vars | Observação |
|------|-----|----------|------------|
| Cloudflare Turnstile | Verificação anti-bot no login | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | **Opcional, desligada por padrão.** Sem container local. Sem as chaves configuradas, o backend não verifica nada e o frontend não renderiza o widget. Para ativar, ver "Ativar a verificação anti-bot" no README; em desenvolvimento use as **chaves de teste** do Cloudflare (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`), que sempre aprovam. Ver ADR 019 e seu adendo. |
