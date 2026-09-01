package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/auth"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/config"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database/sqlc"
)

// mockVerify permite controlar o resultado da verificação do Turnstile.
type mockVerify struct {
	called  bool
	success bool
	err     error
}

func (m *mockVerify) fn(ctx context.Context, secret, token, remoteIP string) (bool, error) {
	m.called = true
	return m.success, m.err
}

func TestVerifyLoginTurnstileSemChave(t *testing.T) {
	h := &Handler{Cfg: &config.Config{TurnstileSecretKey: ""}, verifyTurnstile: func(ctx context.Context, secret, token, ip string) (bool, error) {
		t.Error("verificador não deveria ser chamado sem secret key")
		return false, nil
	}}
	if err := h.verifyLoginTurnstile(context.Background(), "", ""); err != nil {
		t.Fatalf("sem secret key a verificação deve ser no-op, veio %v", err)
	}
}

func TestVerifyLoginTurnstileTokenVazio(t *testing.T) {
	m := &mockVerify{}
	h := &Handler{Cfg: &config.Config{TurnstileSecretKey: "sec"}, verifyTurnstile: m.fn}
	err := h.verifyLoginTurnstile(context.Background(), "", "1.2.3.4")
	if err == nil {
		t.Fatal("token vazio deveria reprovar")
	}
	if m.called {
		t.Fatal("verificador não deveria ser chamado com token vazio")
	}
}

func TestVerifyLoginTurnstileAprovado(t *testing.T) {
	m := &mockVerify{success: true}
	h := &Handler{Cfg: &config.Config{TurnstileSecretKey: "sec"}, verifyTurnstile: m.fn}
	if err := h.verifyLoginTurnstile(context.Background(), "tok", "1.2.3.4"); err != nil {
		t.Fatalf("verificação aprovada não deveria gerar erro, veio %v", err)
	}
	if !m.called {
		t.Fatal("verificador deveria ser chamado")
	}
}

func TestVerifyLoginTurnstileReprovado(t *testing.T) {
	m := &mockVerify{success: false}
	h := &Handler{Cfg: &config.Config{TurnstileSecretKey: "sec"}, verifyTurnstile: m.fn}
	if err := h.verifyLoginTurnstile(context.Background(), "tok", "1.2.3.4"); err == nil {
		t.Fatal("verificação reprovada deveria gerar erro")
	}
}

func TestVerifyLoginTurnstileFalhaDeInfra(t *testing.T) {
	m := &mockVerify{err: errors.New("rede indisponível")}
	h := &Handler{Cfg: &config.Config{TurnstileSecretKey: "sec"}, verifyTurnstile: m.fn}
	if err := h.verifyLoginTurnstile(context.Background(), "tok", "1.2.3.4"); err == nil {
		t.Fatal("falha de infraestrutura deveria ser tratada como erro")
	}
}

// TestLoginWithTurnstile cobra o gate de Turnstile no endpoint de login:
// sem token (com secret key configurada) → 403; verificação aprovada → 200;
// reprovada → 403 com credenciais que estariam corretas.
func TestLoginWithTurnstile(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL não definido; pulando teste de integração")
	}
	tx, err := testPool.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	q := sqlc.New(tx)
	ctx := context.Background()

	hash, _ := auth.HashPassword("Senha123!")
	if err := q.UpsertSeedUser(ctx, sqlc.UpsertSeedUserParams{
		Email: "turnstile@test.local", PasswordHash: &hash, Name: "Turn", Role: "user",
	}); err != nil {
		t.Fatalf("upsert user: %v", err)
	}

	body := func(token string) *bytes.Buffer {
		payload, _ := json.Marshal(map[string]string{
			"email": "turnstile@test.local", "password": "Senha123!",
			"turnstileToken": token,
		})
		return bytes.NewBuffer(payload)
	}
	loginReq := func(h *Handler, payload *bytes.Buffer) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", payload)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.login(rec, req)
		return rec
	}

	t.Run("sem token com secret configurada reprova", func(t *testing.T) {
		h := New(q, &config.Config{TurnstileSecretKey: "sec", BaseURL: "http://localhost"})
		rec := loginReq(h, body(""))
		if rec.Code != http.StatusForbidden {
			t.Fatalf("login sem token deveria ser 403, veio %d", rec.Code)
		}
	})

	t.Run("token aprovado libera o login", func(t *testing.T) {
		h := New(q, &config.Config{TurnstileSecretKey: "sec", BaseURL: "http://localhost"})
		h.verifyTurnstile = func(ctx context.Context, _, _, _ string) (bool, error) { return true, nil }
		rec := loginReq(h, body("ok-token"))
		if rec.Code != http.StatusOK {
			t.Fatalf("login com token aprovado deveria ser 200, veio %d (%s)", rec.Code, rec.Body.String())
		}
	})

	t.Run("token reprovado bloqueia mesmo com senha correta", func(t *testing.T) {
		h := New(q, &config.Config{TurnstileSecretKey: "sec", BaseURL: "http://localhost"})
		h.verifyTurnstile = func(ctx context.Context, _, _, _ string) (bool, error) { return false, nil }
		rec := loginReq(h, body("bad-token"))
		if rec.Code != http.StatusForbidden {
			t.Fatalf("login com token reprovado deveria ser 403, veio %d", rec.Code)
		}
	})
}

// TestPublicConfig expõe a site key para o frontend sem exigir autenticação.
func TestPublicConfig(t *testing.T) {
	h := New(nil, &config.Config{TurnstileSiteKey: "site-key-abc", BaseURL: "http://localhost"})
	req := httptest.NewRequest(http.MethodGet, "/api/config/public", nil)
	rec := httptest.NewRecorder()
	h.publicConfig(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("config público deveria ser 200, veio %d", rec.Code)
	}
	var out PublicConfigDTO
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.TurnstileSiteKey != "site-key-abc" {
		t.Fatalf("site key errada: %q", out.TurnstileSiteKey)
	}
}
