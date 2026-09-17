# 019 - Cloudflare Turnstile no login

**Status:** Aceito

## Contexto

O login é público (endpoint `POST /api/auth/login` sem autenticação) e é o único
ponto da aplicação exposto a ataques de força bruta e automação — credenciais
vazadas ou adivinhação de senha, por exemplo. O app não usa serviços como
Cloudflare na frente (o domínio aponta direto para a VM da Locaweb Cloud), então
não havia proteção anti-bot na borda.

## Decisão

Adicionar **Cloudflare Turnstile** ao formulário de login, em modo **managed**
(o Cloudflare decide, por risco e heurística, entre desafio invisível, checkbox
"não sou um robô" ou interativo). O widget roda no navegador com a **site key**
e gera um token; o backend envia esse token à API do Cloudflare
(`/turnstile/v0/siteverify`) usando a **secret key** antes de validar as
credenciais.

Fluxo e configuração:

- As chaves ficam no ambiente: `TURNSTILE_SITE_KEY` (pública, vai para o
  navegador) e `TURNSTILE_SECRET_KEY` (secreta, só no servidor).
- A site key é exposta ao frontend por `GET /api/config/public` — endpoint
  público que devolve apenas o que o navegador já deveria saber (nunca segredos).
- O frontend carrega o script `challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`,
  renderiza o widget (modo `explicit`, para controlar o momento) e envia o token
  junto com `email`/`senha` no campo `turnstileToken`.
- `siteverify` recebe o IP do cliente (`X-Forwarded-For`)
- **Sem secret key configurada a verificação é desativada** (no-op): essencial
  em desenvolvimento local e nos testes, e impede que um deploy sem as chaves
  (ou com o serviço do Cloudflare indisponível por falha de rede) trave o login.
- Token ausente/vazio com secret key configurada → **403** antes mesmo de
  consultar o banco (sem gastar bcrypt nem revelar se a credencial existe).

## Racional

- Turnstile é gratuito, sem limite prático de verificações, e **não usa
  CAPTCHA visual** (imagens deformadas) — melhor experiência que reCAPTCHA.
- `remoteip` no `siteverify` impede reutilização do token por outro IP e é
  preenchido a partir de `X-Forwarded-For` (a VM fica atrás de proxy/LB).
- Endpoint dedicado de config evita embutir a site key no build do frontend
  (deploy em domínios diferentes dispensa rebuild).

## Trade-offs

**Prós:**
- Bloqueia automação/força bruta sem fricção para humanos (managed).
- Sem custo e sem infraestrutura adicional (SaaS do Cloudflare).
- O gate de login é o único ponto sensível; o resto do app é 100% autenticado.

**Contras:**
- Dependência de terceiro: se `challenges.cloudflare.com` estiver inacessível,
  o widget não resolve. Mitigação: a falha **não** paralisa o login
  (o `siteverify` que falha por rede é tratado como segurança reprovada de
  forma segura — registra no log e responde erro genérico; o token ausente só
  bloqueia quando a secret key está configurada).
- Requer duas chaves por ambiente (desenvolvimento/preview/produção).

## Alternativas consideradas

- **reCAPTCHA v2/v3 (Google):** mais fricção (v2) ou menos acessível em termos
  de privacidade (v3 coleta telemetria sem consentimento claro); Turnstile
  prefere privacidade e não tem a exigência de "interação humana" em heavy mode.
- **hCaptcha:** similar, mas com custo por verificação além da cota gratuita.
- **Rate limiting por IP só no backend:** não distingue humano de bot; bots
  distribuídos ignoram limites por IP facilmente. Pode ser somado depois.
- **Sem proteção:** aceito originalmente por simplicidade, mas o login público
  ficava totalmente exposto.
## Adendo (2026-09-17) — desligado por padrão no template

Neste repositório, usado como template de workshop, a verificação vem
**desligada**: os secrets `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` não são
configurados. O mecanismo já era inteiramente condicional — `verifyLoginTurnstile`
retorna `nil` quando a secret key está vazia, e o `Login.tsx` só renderiza o
widget quando `/api/config/public` devolve uma site key —, então nenhuma linha de
código precisou mudar. Verificado com `kamal secrets print` que, sem os secrets
definidos, as duas variáveis resolvem para string vazia sem erro de deploy.

O motivo é operacional: um desafio anti-bot no login é precisamente o que impede
um agente de autenticar-se na aplicação para inspecioná-la ou capturar telas. O
README documenta como ativar, junto do aviso de que ativar tem esse custo.
