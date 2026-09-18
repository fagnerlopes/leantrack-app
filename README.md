# LeanTrack

Aplicação web para acompanhar roadmaps de iniciativas em formato Gantt:
visualização por trimestres, sinalização automática de risco quando uma
dependência externa ameaça a data de início, compartilhamento por colaborador
com permissões independentes de editar e de compartilhar, e exportação da
visão em PDF ou PNG.

O backend é um único binário Go que serve a API e o SPA React; o banco é
PostgreSQL. Tudo publica como **um container só**.

Este repositório é um **template**: ele foi preparado para ser clonado, rodado
e publicado por qualquer pessoa, na própria infraestrutura. Não há dados nem
segredos de ninguém aqui dentro.

---

## Pré-requisitos

- **[mise](https://mise.jdx.dev/)** — executa Go, Node, sqlc e Python nas versões fixadas em `mise.toml`
- **[podman](https://podman.io/)** — roda o Postgres local
- **[gh](https://cli.github.com/)** — CLI do GitHub, para criar o repositório e configurar os segredos

Se você usa as skills do cofounder, `cofounder-computer-setup` instala os três.

---

## Rodar localmente

**1. Crie o `.env` a partir do exemplo e gere o segredo de sessão:**

```bash
cp .env.example .env
mise x -- python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Abra o `.env` e substitua `REPLACE_WITH_RANDOM_SECRET` pelo valor gerado. Depois:

```bash
chmod 0600 .env
```

**2. Suba o Postgres:**

```bash
podman run -d --name leantrack-app-db \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  docker.io/supabase/postgres:17.6.1.129

podman exec leantrack-app-db pg_isready -U postgres
```

Espere a resposta `accepting connections` (a primeira inicialização leva alguns
segundos). Em sessões seguintes, o container já existe: use `podman start
leantrack-app-db`.

**3. Suba o backend** (porta 8080), num terminal:

```bash
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && DEV_MODE=1 mise x -- go run ./cmd/server'
```

No primeiro boot ele aplica as migrações, cria a conta de administrador e
carrega os dados de demonstração.

**4. Suba o frontend** (porta 5173), noutro terminal:

```bash
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npm install && mise x -- npm run dev'
```

**5. Abra <http://localhost:5173>.** Se a porta 5173 estiver ocupada, o Vite usa
a próxima livre e informa a URL real na inicialização — use a que ele imprimir.

---

## Entrar na aplicação

Use as credenciais que estão no seu `.env`:

- **E-mail:** o valor de `SEED_ADMIN_EMAIL` (padrão `admin@example.com`)
- **Senha:** o valor de `SEED_ADMIN_PASSWORD` (padrão `admin123`)

**A senha padrão vale para um único acesso:** no primeiro login a aplicação
exige que você defina uma senha definitiva. Essa é a sua senha dali em diante —
republicar a aplicação não a desfaz.

> **Se você pretende pedir a um agente que faça login e capture a tela, defina
> a sua senha antes.** Enquanto a troca obrigatória estiver pendente, qualquer
> login cai na tela de troca de senha, e o agente fotografaria essa tela em vez
> da aplicação.

Os dados de demonstração criam dois roadmaps e dez iniciativas, de modo que as
três abas da tela inicial tenham conteúdo: um roadmap é seu, outro foi
compartilhado com você. Para começar com o banco vazio, remova `SEED_DEMO` do
`.env` antes do primeiro boot.

---

## Rodar os testes

```bash
# Backend (Go) — unitários e integração
bash -c 'ROOT="$(git rev-parse --show-toplevel)" && set -a && . "$ROOT/.env" && set +a && cd "$ROOT/backend" && mise x -- go test ./...'

# Frontend (Vitest)
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npm test'

# Type-check do frontend (o script build roda tsc antes de empacotar)
bash -c 'cd "$(git rev-parse --show-toplevel)/frontend" && mise x -- npm run build'
```

> **Atenção:** os testes de integração Go são **pulados em silêncio** quando
> `DATABASE_URL` não está no ambiente — a suíte "passa" sem ter executado nada.
> Sempre carregue o `.env` antes de rodar, como nos comandos acima.

Para rodar um único teste: `mise x -- go test ./internal/handler -run TestRoadmapOwnership -v`
no backend, ou `mise x -- npm test -- src/pages/Login.test.tsx` no frontend.

---

## Publicar na sua VM

Todo push na branch `main` dispara o workflow `.github/workflows/deploy.yml`,
que provisiona a infraestrutura na Locaweb Cloud (uma VM para a aplicação e uma
para o banco, ambiente `leantrack`, zona `ZP02`) e publica com Kamal.

Antes do primeiro push, configure estes segredos no **seu** repositório
(Settings → Secrets and variables → Actions, ou `gh secret set NOME`):

| Secret | O que é | De onde vem |
|---|---|---|
| `CLOUDSTACK_API_KEY` | Credencial da API da Locaweb Cloud | Painel da Locaweb Cloud |
| `CLOUDSTACK_SECRET_KEY` | Par da credencial acima | Painel da Locaweb Cloud |
| `SSH_PRIVATE_KEY` | Chave privada usada para acessar as VMs | Você gera (`ssh-keygen`) e registra a pública no painel |
| `POSTGRES_PASSWORD` | Senha do Postgres na VM do banco | Você gera |
| `JWT_SECRET` | Assina os cookies de sessão | Você gera |
| `SEED_ADMIN_PASSWORD` | Senha do primeiro acesso do administrador | Você gera |

Enquanto `CLOUDSTACK_API_KEY` não estiver configurado, os jobs de
provisionamento e de publicação são **pulados** — o workflow não falha e nada é
criado. Você pode empurrar código à vontade antes de decidir publicar.

**A URL da aplicação é `https://<IP-da-VM>.nip.io`**, derivada automaticamente
do IP que a VM recebeu — não é preciso configurar DNS, e o certificado
Let's Encrypt é emitido sozinho. O IP aparece no log do workflow. Para usar um
domínio próprio, acrescente-o a `proxy.hosts` em `config/deploy.leantrack.yml`
e aponte o DNS para o IP da VM antes de publicar.

Outras coisas úteis:

- **Republicar sem commit:** o workflow aceita `workflow_dispatch` — dá para
  disparar pela aba Actions do GitHub.
- **Backup automático:** antes de cada publicação o workflow faz `pg_dump` do
  banco e anexa o arquivo como artefato do run (retenção de 90 dias). Se o
  backup falhar num ambiente que já tem banco, o deploy é abortado (ADR 012).
- **Trocar a zona:** edite `zone:` em `.github/workflows/deploy.yml` e em
  `.github/workflows/teardown.yml`.
- **Derrubar tudo:** o workflow `teardown.yml`, disparado manualmente, remove o
  ambiente.

---

## Ativar a verificação anti-bot (opcional)

O login suporta [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/),
mas ele vem **desligado**: sem as chaves configuradas, o backend não verifica
nada e o frontend não desenha o widget (ADR 019 e seu adendo).

Para ativar em produção, registre os dois segredos no seu repositório e
republique — nenhum arquivo precisa ser editado:

```bash
gh secret set TURNSTILE_SITE_KEY
gh secret set TURNSTILE_SECRET_KEY
```

As chaves saem do painel do Cloudflare, ao criar um site no Turnstile. Para
experimentar localmente, descomente no `.env` as chaves de teste do Cloudflare,
que sempre aprovam.

> **Ativar o Turnstile impede que um agente faça login na aplicação**, porque
> ele passaria a precisar resolver o desafio. Se o seu fluxo inclui pedir a um
> agente que entre e capture telas, deixe a verificação desligada.

---

## Documentação

- **`docs/PRD.md`** — o que o produto entrega, do ponto de vista de quem usa
- **`docs/adr/`** — as decisões técnicas e, principalmente, **por que** cada uma
  foi tomada; é a leitura que evita refazer discussões já encerradas
- **`docs/INFRASTRUCTURE.md`** — os serviços de que a aplicação depende
- **`docs/TASKS.md`** — o histórico de desenvolvimento
- **`CLAUDE.md`** — instruções para agentes de codificação que trabalhem neste
  repositório
- **`docs/roadmap-colaborativo.jsx`** — o protótipo visual que deu origem ao
  Gantt, mantido como referência de design
