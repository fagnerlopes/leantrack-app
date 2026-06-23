# 015 - Reset de senha pelo admin e troca obrigatória no primeiro acesso

**Status:** Accepted

## Context

A aplicação usa autenticação local (e-mail + senha, bcrypt) e **não** possui
fluxo de "Esqueci minha senha". Decidiu-se conscientemente não implementar esse
fluxo porque ele exigiria contratar/operar um gateway SMTP (ver
[ADR 008](008-auth-desacoplada-para-sso.md), que mantém a porta aberta para SSO
no futuro). Sem recuperação por e-mail, um usuário que esquece a senha fica sem
acesso e não há como um administrador devolvê-lo.

Além disso, as regras de senha estavam **inconsistentes**: troca no perfil
exigia 8 caracteres, criação pelo admin exigia 6, e não havia regra de
complexidade em lugar nenhum.

## Decision

1. **Admin redefine a senha de qualquer usuário** via `PUT /api/admin/users/{id}/password`,
   **sem exigir a senha antiga**. A UI (`/admin/users`) tem um botão "Resetar
   senha" por linha, com um **gerador de senha temporária** (aleatoriedade
   criptográfica) que sempre satisfaz a política, além de copiar/gerar-outra.
2. **Política única e forte de senha**, validada no backend
   (`auth.ValidatePassword`) e espelhada no frontend (`lib/password.ts`):
   **mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo** (teto de
   72 bytes do bcrypt). Aplica-se a criação, reset, perfil e troca obrigatória.
3. **Troca obrigatória no primeiro acesso**: coluna `users.must_change_password`
   (migração 008, default `false`). Nasce `true` quando o admin **cria** o
   usuário ou **reseta** a senha; volta a `false` quando o próprio usuário define
   uma senha (perfil ou tela de troca). A marca viaja na sessão
   (`SessionUser.mustChangePassword`) e no login.
4. **Tela dedicada bloqueante** (`/trocar-senha`): enquanto a marca está ativa,
   o `Protected` redireciona qualquer rota para ela; o usuário só usa o app
   depois de definir a nova senha. Endpoint `POST /api/auth/change-password`
   (não exige senha antiga).
5. **Alerta de Keeper**: por não haver recuperação por e-mail, toda tela de
   definição/troca de senha (admin, criação, perfil, primeiro acesso) exibe um
   aviso para salvar a senha no **Keeper**.

## Rationale

Dar ao admin o poder de resetar é a alternativa pragmática ao SMTP: resolve o
caso real (usuário sem acesso) sem nova infraestrutura. A senha definida pelo
admin é necessariamente conhecida por ele, então tratá-la como **temporária** e
forçar a troca no primeiro acesso preserva o sigilo da senha do usuário. A tela
bloqueante (em vez de um modal) é à prova de contorno e deixa a exigência
explícita. Unificar a política num único validador (back + front) elimina a
divergência anterior.

## Trade-offs

**Pros:**
- Recupera acesso sem SMTP nem custo adicional.
- Senha do admin nunca permanece como a senha real do usuário (troca forçada).
- Política forte e consistente em toda a aplicação, validada no servidor.
- Geração de senha forte reduz erro humano do admin.

**Cons:**
- Admin tem poder de redefinir senhas (risco de conta comprometida → mitigado
  pela troca obrigatória e por restringir a rota a `admin`).
- Depende de um canal seguro fora do app (Keeper) para repassar a senha
  temporária; o app apenas orienta, não força.
- Sem verificação de senha antiga na troca (aceitável: a sessão já é a prova de
  identidade; espelha o cenário de "primeiro acesso").

## Alternatives Considered

- **Fluxo "Esqueci minha senha" por e-mail (magic link):** descartado por exigir
  gateway SMTP — exatamente o custo que se quis evitar.
- **Modal obrigatório sobre o app (em vez de tela dedicada):** descartado por
  ser mais fácil de contornar e menos explícito.
- **Forçar troca apenas no reset (não na criação):** descartado por
  inconsistência — a senha de criação também é conhecida pelo admin.
