package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"leantrack/backend/internal/auth"
	"leantrack/backend/internal/database/sqlc"
)

// seedUser cria/atualiza um usuário com nome distinto do e-mail (loginAs usa
// o e-mail como nome, o que atrapalharia a busca por nome).
func seedUser(t *testing.T, q *sqlc.Queries, email, name string) {
	t.Helper()
	hash, _ := auth.HashPassword("senha-teste")
	if err := q.UpsertSeedUser(context.Background(), sqlc.UpsertSeedUserParams{
		Email: email, PasswordHash: &hash, Name: name, Role: "user",
	}); err != nil {
		t.Fatalf("seed user %s: %v", email, err)
	}
}

func searchEmails(t *testing.T, srv *httptest.Server, id int64, cookie *http.Cookie, q string) map[string]bool {
	t.Helper()
	resp, data := doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/user-search?q="+q, cookie, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("busca deveria ser 200, veio %d (%s)", resp.StatusCode, data)
	}
	var rows []userSearchDTO
	if err := json.Unmarshal(data, &rows); err != nil {
		t.Fatalf("decode busca: %v", err)
	}
	out := map[string]bool{}
	for _, r := range rows {
		out[r.Email] = true
	}
	return out
}

func TestSearchUsersForRoadmap(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "marina.dona@test.local", "user")
	seedUser(t, q, "marina.dona@test.local", "Marina Dona") // nome distinto do e-mail
	stranger := loginAs(t, q, "estranho.busca@test.local", "user")

	seedUser(t, q, "mariana.costa@test.local", "Mariana Costa")
	seedUser(t, q, "mario.alves@test.local", "Mário Alves")
	seedUser(t, q, "joao.souza@test.local", "João Souza")

	id, _ := createRoadmap(t, srv, owner, "Roadmap Busca 2026")

	// Permissão: quem não pode compartilhar não pode buscar → 403.
	resp, _ := doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/user-search?q=mari", stranger, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("estranho não deveria buscar usuários; esperava 403, veio %d", resp.StatusCode)
	}

	// Menos de 4 caracteres → 200 com lista vazia (não dispara a busca).
	resp, data := doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/user-search?q=mar", owner, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("busca curta deveria ser 200, veio %d", resp.StatusCode)
	}
	var short []userSearchDTO
	_ = json.Unmarshal(data, &short)
	if len(short) != 0 {
		t.Fatalf("busca com menos de 4 caracteres deveria vir vazia, veio %d", len(short))
	}

	// Busca por e-mail/nome (4+): casa mariana e mario; exclui o dono (marina) e joão.
	emails := searchEmails(t, srv, id, owner, "mari")
	if !emails["mariana.costa@test.local"] || !emails["mario.alves@test.local"] {
		t.Fatalf("esperava mariana e mario nos resultados; veio %v", emails)
	}
	if emails["marina.dona@test.local"] {
		t.Fatalf("o dono não deveria aparecer nas sugestões; veio %v", emails)
	}
	if emails["joao.souza@test.local"] {
		t.Fatalf("joão não casa 'mari' e não deveria aparecer; veio %v", emails)
	}

	// Busca por nome (o e-mail não contém 'cost'): prova que o nome é pesquisado.
	emails = searchEmails(t, srv, id, owner, "Cost")
	if !emails["mariana.costa@test.local"] {
		t.Fatalf("busca por nome 'Cost' deveria achar Mariana Costa; veio %v", emails)
	}

	// Após convidar mario, ele some das sugestões (já tem acesso).
	resp, _ = doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", owner,
		map[string]any{"email": "mario.alves@test.local", "canEdit": true, "canShare": false})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("convite deveria ser 200/201, veio %d", resp.StatusCode)
	}
	emails = searchEmails(t, srv, id, owner, "mari")
	if emails["mario.alves@test.local"] {
		t.Fatalf("colaborador já convidado não deveria aparecer; veio %v", emails)
	}
	if !emails["mariana.costa@test.local"] {
		t.Fatalf("mariana (sem acesso) deveria continuar nas sugestões; veio %v", emails)
	}
}
