# 008 - Autenticação desacoplada (preparação para SSO/Keycloak)

**Status:** Accepted — interface e modelo de dados implementados na Fase 2 (migração 006; `auth.Authenticator` + `auth.LocalAuthenticator`).

> Nota de numeração: o spec/plano referem-se a este ADR como "005"; ver a nota no
> ADR 007. Conteúdo conforme seções 3.3 e 6 do spec
> `docs/superpowers/specs/2026-06-08-roadmaps-por-usuario-design.md`.

## Context
Hoje o login é local (e-mail + senha com bcrypt, sessão por cookie + tabela `sessions`). Há a intenção de, no futuro, migrar para **SSO via Keycloak (OIDC)** sem reescrever os handlers de roadmap nem a autorização por propriedade (ADR 007). Esta fase (Fase 1) **apenas prepara o encaixe**; não integra o Keycloak.

## Decision
Isolar o mecanismo de identidade atrás de uma interface, e preparar o modelo de dados de `users` para identidades externas:

- Interface (a introduzir na Fase 2):
  ```go
  type Authenticator interface {
      UserFromRequest(r *http.Request) (*SessionUser, error)
  }
  ```
  - Implementação atual: `LocalAuthenticator` (cookie de sessão + senha local).
  - Futuro: `KeycloakAuthenticator` (valida token OIDC, mapeia claims → SessionUser).
- Modelo de dados `users` (migração na Fase 2):
  - `password_hash` torna-se **NULLABLE** (usuários SSO não têm senha local).
  - Novas colunas `auth_provider TEXT NOT NULL DEFAULT 'local'` e `external_id TEXT` (NULL hoje).
  - `UNIQUE (auth_provider, external_id)` quando `external_id` não for NULL.

Na **Fase 1**, a usuária institucional (Eduarda) é criada com `password_hash = ''` (vazio) — satisfaz o `NOT NULL` atual mas **não permite login** (bcrypt nunca valida hash vazio). A senha real é definida na Fase 2 (gestão de contas) ou via seed de dev.

## Rationale
- Trocar o provedor de identidade não deve afetar handlers nem a autorização por propriedade.
- `auth_provider`/`external_id` permitem coexistência de contas locais e SSO durante a transição.
- Senha anulável é o que torna possível um usuário existir sem senha local.

## Trade-offs
**Pros:**
- Migração para Keycloak fica restrita a uma implementação da interface + mapeamento de claims.
- Sem reescrita de lógica de negócio na troca.

**Cons:**
- Indireção a mais (interface) antes de o Keycloak existir — custo pequeno e intencional (YAGNI controlado: é o "encaixe", não a integração).

## Alternatives Considered
- **Acoplar login diretamente nos handlers:** descartado — tornaria a migração para SSO uma reescrita ampla.
- **Integrar Keycloak já agora:** fora de escopo desta fase (ver seção 10 do spec); só o encaixe é preparado.
