package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// turnstileVerifyURL é o endpoint de validação do Cloudflare Turnstile.
const turnstileVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// turnstileVerifyFunc valida o token de resposta do Turnstile.
// Devolve (success, error): success=false significa usuário reprovado
// (não é um erro de infraestrutura — não registra como falha de servidor).
type turnstileVerifyFunc func(ctx context.Context, secret, token, remoteIP string) (bool, error)

// defaultTurnstileVerify valida o token chamando a API do Cloudflare.
func defaultTurnstileVerify(ctx context.Context, secret, token, remoteIP string) (bool, error) {
	form := url.Values{}
	form.Set("secret", secret)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, turnstileVerifyURL,
		strings.NewReader(form.Encode()))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	var out struct {
		Success bool     `json:"success"`
		Errors  []string `json:"error-codes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, err
	}
	if !out.Success {
		slog.Warn("turnstile verificacao reprovada", "error_codes", out.Errors)
	}
	return out.Success, nil
}

// verifyLoginTurnstile garante que o token do Turnstile seja válido antes de
// processar as credenciais. Retorna erro quando o desafio não foi aprovado
// (sem informar o motivo ao cliente). É no-op quando o secret key não está
// configurado — útil em desenvolvimento local e nos testes de integração.
func (h *Handler) verifyLoginTurnstile(ctx context.Context, token, remoteIP string) error {
	if h.Cfg.TurnstileSecretKey == "" {
		return nil
	}
	if strings.TrimSpace(token) == "" {
		return errors.New("desafio de segurança não resolvido")
	}
	ok, err := h.verifyTurnstile(ctx, h.Cfg.TurnstileSecretKey, token, remoteIP)
	if err != nil {
		// Falha de infraestrutura não deve bloquear o login de forma opaca
		// nem vazar detalhes; registra e segue como reprovado de forma segura.
		slog.Error("turnstile verificacao falhou", "err", err)
		return errors.New("falha ao verificar desafio de segurança")
	}
	if !ok {
		return errors.New("desafio de segurança não resolvido")
	}
	return nil
}

// clientIP extrai o IP do cliente para envio opcional ao Turnstile.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if ip := strings.TrimSpace(parts[0]); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
