package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/auth"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/config"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database/sqlc"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testPool é compartilhado entre os testes de integração. Fica nil quando
// DATABASE_URL não está definido — nesse caso os testes são pulados.
var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		os.Exit(m.Run())
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		panic(err)
	}
	if err := database.RunMigrations(ctx, pool); err != nil {
		panic(err)
	}
	testPool = pool
	code := m.Run()
	pool.Close()
	os.Exit(code)
}

// newTestServer cria um servidor HTTP cujo handler opera dentro de uma
// transação revertida ao fim do teste (isolamento total dos dados).
func newTestServer(t *testing.T) (*httptest.Server, *sqlc.Queries) {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL não definido; pulando teste de integração")
	}
	tx, err := testPool.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	q := sqlc.New(tx)
	h := New(q, &config.Config{DevMode: true, BaseURL: "http://localhost"})
	srv := httptest.NewServer(h.Routes())
	t.Cleanup(srv.Close)
	return srv, q
}

// loginAs cria (ou atualiza) um usuário e devolve um cookie de sessão válido.
func loginAs(t *testing.T, q *sqlc.Queries, email, role string) *http.Cookie {
	t.Helper()
	ctx := context.Background()
	hash, _ := auth.HashPassword("senha-teste")
	if err := q.UpsertSeedUser(ctx, sqlc.UpsertSeedUserParams{
		Email: email, PasswordHash: &hash, Name: email, Role: role,
	}); err != nil {
		t.Fatalf("upsert user: %v", err)
	}
	u, err := q.GetUserByEmail(ctx, email)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	tok, _, err := auth.CreateSession(ctx, q, u.ID)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	return &http.Cookie{Name: auth.CookieName, Value: tok}
}

func doReq(t *testing.T, srv *httptest.Server, method, path string, cookie *http.Cookie, body any) (*http.Response, []byte) {
	t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, srv.URL+path, r)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp, data
}

// createRoadmap cria um roadmap e devolve (id, slug).
func createRoadmap(t *testing.T, srv *httptest.Server, cookie *http.Cookie, name string) (int64, string) {
	t.Helper()
	resp, data := doReq(t, srv, http.MethodPost, "/api/roadmaps", cookie, map[string]string{"name": name})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("criar roadmap: status %d, corpo %s", resp.StatusCode, data)
	}
	var dto roadmapDTO
	if err := json.Unmarshal(data, &dto); err != nil {
		t.Fatalf("decode roadmap: %v", err)
	}
	return dto.ID, dto.Slug
}

func TestRoadmapOwnership(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "owner@test.local", "user")
	other := loginAs(t, q, "other@test.local", "user")

	id, slug := createRoadmap(t, srv, owner, "Roadmap VPS 2026")
	if slug != "roadmap-vps-2026" {
		t.Fatalf("slug gerado = %q, esperava roadmap-vps-2026", slug)
	}

	// Qualquer logado lê (roteamento só por id).
	resp, data := doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id), other, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("leitura por não-dono deveria ser 200, veio %d (%s)", resp.StatusCode, data)
	}
	var read roadmapDTO
	_ = json.Unmarshal(data, &read)
	if read.CanEdit {
		t.Fatal("canEdit deveria ser false para não-dono")
	}

	// Não-dono não edita → 403.
	resp, _ = doReq(t, srv, http.MethodPut, "/api/roadmaps/"+itoa(id), other, map[string]string{"name": "Renomeado"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("edição por não-dono deveria ser 403, veio %d", resp.StatusCode)
	}

	// Dono edita → 200.
	resp, _ = doReq(t, srv, http.MethodPut, "/api/roadmaps/"+itoa(id), owner, map[string]string{"name": "Roadmap VPS 2027"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("edição pelo dono deveria ser 200, veio %d", resp.StatusCode)
	}

	// Não-dono não cria item no roadmap → 403.
	resp, _ = doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/items", other,
		map[string]any{"title": "X", "status": "nao-iniciado"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("criar item por não-dono deveria ser 403, veio %d", resp.StatusCode)
	}

	// Dono cria item → 201.
	resp, _ = doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/items", owner,
		map[string]any{"title": "Iniciativa A", "status": "em-andamento", "progress": 10})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("criar item pelo dono deveria ser 201, veio %d", resp.StatusCode)
	}
}

func TestRoadmapUniqueNamePerOwner(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dup@test.local", "user")
	createRoadmap(t, srv, owner, "Roadmap Único")
	resp, _ := doReq(t, srv, http.MethodPost, "/api/roadmaps", owner, map[string]string{"name": "Roadmap Único"})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("nome duplicado pelo mesmo dono deveria ser 409, veio %d", resp.StatusCode)
	}
}

func TestDeleteRoadmapRequiresConfirmSlug(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "del@test.local", "user")
	id, slug := createRoadmap(t, srv, owner, "Roadmap Para Apagar")

	// Slug errado → 400.
	resp, _ := doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id), owner, map[string]string{"confirmSlug": "errado"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("confirmação errada deveria ser 400, veio %d", resp.StatusCode)
	}

	// Slug correto → 204.
	resp, _ = doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id), owner, map[string]string{"confirmSlug": slug})
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("confirmação correta deveria ser 204, veio %d", resp.StatusCode)
	}
}

func TestAdminUsersGate(t *testing.T) {
	srv, q := newTestServer(t)
	user := loginAs(t, q, "comum@test.local", "user")
	admin := loginAs(t, q, "chefe@test.local", "admin")

	resp, _ := doReq(t, srv, http.MethodGet, "/api/admin/users", user, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("não-admin em /api/admin/users deveria ser 403, veio %d", resp.StatusCode)
	}

	resp, _ = doReq(t, srv, http.MethodGet, "/api/admin/users", admin, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("admin em /api/admin/users deveria ser 200, veio %d", resp.StatusCode)
	}
}

func TestSetInitialAdminPasswords(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL não definido; pulando teste de integração")
	}
	ctx := context.Background()
	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := sqlc.New(tx)

	// Dois admins sem senha local utilizável: um com NULL (migração 006) e outro
	// com string vazia (migração 005). Ambos devem receber a senha inicial.
	if _, err := tx.Exec(ctx,
		`INSERT INTO users (email, password_hash, name, role) VALUES
		   ($1, NULL, $2, 'admin'),
		   ($3, '',   $4, 'admin')`,
		"sso-null@test.local", "SSO Null", "sso-empty@test.local", "SSO Empty"); err != nil {
		t.Fatalf("insert admins sem senha: %v", err)
	}

	hash, _ := auth.HashPassword("senha-inicial")
	if err := q.SetInitialAdminPasswords(ctx, &hash); err != nil {
		t.Fatalf("set initial passwords: %v", err)
	}

	for _, email := range []string{"sso-null@test.local", "sso-empty@test.local"} {
		u, err := q.GetUserByEmail(ctx, email)
		if err != nil {
			t.Fatalf("get user %s: %v", email, err)
		}
		if u.PasswordHash == nil || !auth.CheckPassword(*u.PasswordHash, "senha-inicial") {
			t.Fatalf("senha inicial não aplicada para %s", email)
		}
	}

	// Idempotência: rodar de novo não sobrescreve a senha já definida.
	hash2, _ := auth.HashPassword("outra-senha")
	if err := q.SetInitialAdminPasswords(ctx, &hash2); err != nil {
		t.Fatalf("set initial passwords (2): %v", err)
	}
	u2, _ := q.GetUserByEmail(ctx, "sso-null@test.local")
	if !auth.CheckPassword(*u2.PasswordHash, "senha-inicial") {
		t.Fatal("senha não deveria mudar numa segunda execução (idempotência)")
	}
}

func TestUpdateProfile(t *testing.T) {
	srv, q := newTestServer(t)
	cookie := loginAs(t, q, "perfil@test.local", "user")

	// Só nome (senha em branco) → 200 e nome atualizado; senha antiga continua válida.
	resp, data := doReq(t, srv, http.MethodPut, "/api/auth/me", cookie,
		map[string]string{"name": "Nome Novo", "password": ""})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("atualizar só o nome deveria ser 200, veio %d (%s)", resp.StatusCode, data)
	}
	var dto auth.SessionUser
	_ = json.Unmarshal(data, &dto)
	if dto.Name != "Nome Novo" {
		t.Fatalf("nome esperado 'Nome Novo', veio %q", dto.Name)
	}
	u, _ := q.GetUserByEmail(context.Background(), "perfil@test.local")
	if u.PasswordHash == nil || !auth.CheckPassword(*u.PasswordHash, "senha-teste") {
		t.Fatal("senha antiga deveria continuar válida quando o campo senha vem em branco")
	}

	// Nome vazio → 400.
	resp, _ = doReq(t, srv, http.MethodPut, "/api/auth/me", cookie, map[string]string{"name": "  ", "password": ""})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("nome vazio deveria ser 400, veio %d", resp.StatusCode)
	}

	// Senha curta (< 8) → 400.
	resp, _ = doReq(t, srv, http.MethodPut, "/api/auth/me", cookie, map[string]string{"name": "Nome Novo", "password": "1234567"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("senha curta deveria ser 400, veio %d", resp.StatusCode)
	}

	// Nova senha válida → 200 e a nova senha passa a valer (a antiga não).
	resp, _ = doReq(t, srv, http.MethodPut, "/api/auth/me", cookie, map[string]string{"name": "Nome Novo", "password": "novaSenha123"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("nova senha válida deveria ser 200, veio %d", resp.StatusCode)
	}
	u2, _ := q.GetUserByEmail(context.Background(), "perfil@test.local")
	if !auth.CheckPassword(*u2.PasswordHash, "novaSenha123") {
		t.Fatal("a nova senha deveria valer após a atualização")
	}
	if auth.CheckPassword(*u2.PasswordHash, "senha-teste") {
		t.Fatal("a senha antiga não deveria mais valer após a troca")
	}
}

func TestUpdateProfileRequiresAuth(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, _ := doReq(t, srv, http.MethodPut, "/api/auth/me", nil, map[string]string{"name": "X"})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("sem sessão deveria ser 401, veio %d", resp.StatusCode)
	}
}

// itoa converte int64 sem depender de fmt.
func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
