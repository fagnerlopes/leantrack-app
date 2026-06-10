package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database/sqlc"
)

func loginUserID(t *testing.T, q *sqlc.Queries, email string) int64 {
	t.Helper()
	u, err := q.GetUserByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("get user %s: %v", email, err)
	}
	return u.ID
}

func TestShareCollaboratorFlow(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dona@test.local", "user")
	editor := loginAs(t, q, "editor@test.local", "user")

	id, _ := createRoadmap(t, srv, owner, "Roadmap Compartilhado 2026")

	resp, _ := doReq(t, srv, http.MethodPut, "/api/roadmaps/"+itoa(id), editor, map[string]string{"name": "X"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("editor sem convite deveria ser 403 ao renomear, veio %d", resp.StatusCode)
	}

	resp, data := doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", owner,
		map[string]any{"email": "editor@test.local", "canEdit": true, "canShare": false})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("convite deveria ser 200/201, veio %d (%s)", resp.StatusCode, data)
	}

	resp, _ = doReq(t, srv, http.MethodPut, "/api/roadmaps/"+itoa(id), editor, map[string]string{"name": "Renomeado pelo editor"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("editor convidado deveria renomear (200), veio %d", resp.StatusCode)
	}
	resp, _ = doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/items", editor,
		map[string]any{"title": "Item do editor", "status": "nao-iniciado"})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("editor convidado deveria criar item (201), veio %d", resp.StatusCode)
	}

	resp, _ = doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id), editor, map[string]string{"confirmSlug": "renomeado-pelo-editor"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("editor convidado NÃO pode excluir o roadmap; esperava 403, veio %d", resp.StatusCode)
	}

	resp, data = doReq(t, srv, http.MethodGet, "/api/roadmaps/shared", editor, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("listar compartilhados deveria ser 200, veio %d", resp.StatusCode)
	}
	var shared []roadmapDTO
	_ = json.Unmarshal(data, &shared)
	if len(shared) != 1 || shared[0].ID != id || !shared[0].CanEdit || shared[0].CanDelete {
		t.Fatalf("compartilhado esperado: 1 item id=%d canEdit=true canDelete=false; veio %+v", id, shared)
	}

	editorUser := loginUserID(t, q, "editor@test.local")
	resp, _ = doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id)+"/collaborators/"+itoa(editorUser), owner, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("remoção de colaborador deveria ser 204, veio %d", resp.StatusCode)
	}
	resp, data = doReq(t, srv, http.MethodGet, "/api/roadmaps/shared", editor, nil)
	_ = json.Unmarshal(data, &shared)
	if len(shared) != 0 {
		t.Fatalf("após remoção, compartilhados deveria ser vazio, veio %d", len(shared))
	}
}

func TestShareEmailNotFound(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dona2@test.local", "user")
	id, _ := createRoadmap(t, srv, owner, "Roadmap NF 2026")

	resp, data := doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", owner,
		map[string]any{"email": "ninguem@inexistente.local", "canEdit": true})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("e-mail sem conta deveria ser 404, veio %d", resp.StatusCode)
	}
	var body map[string]string
	_ = json.Unmarshal(data, &body)
	if body["error"] == "" {
		t.Fatal("esperava mensagem de erro orientando solicitar o cadastro")
	}
}

func TestShareGate(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dona3@test.local", "user")
	editorOnly := loginAs(t, q, "soedita@test.local", "user")
	stranger := loginAs(t, q, "estranho@test.local", "user")
	id, _ := createRoadmap(t, srv, owner, "Roadmap Gate 2026")

	doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", owner,
		map[string]any{"email": "soedita@test.local", "canEdit": true, "canShare": false})

	resp, _ := doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/collaborators", editorOnly, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("colaborador sem can_share não deveria listar colaboradores; esperava 403, veio %d", resp.StatusCode)
	}
	resp, _ = doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/collaborators", stranger, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("estranho não deveria listar colaboradores; esperava 403, veio %d", resp.StatusCode)
	}
	resp, _ = doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/collaborators", owner, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("dono deveria listar colaboradores (200), veio %d", resp.StatusCode)
	}
}

func TestCannotRemoveOwnerAsCollaborator(t *testing.T) {
	srv, q := newTestServer(t)
	owner := loginAs(t, q, "dona4@test.local", "user")
	id, _ := createRoadmap(t, srv, owner, "Roadmap Owner 2026")
	ownerID := loginUserID(t, q, "dona4@test.local")

	resp, _ := doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id)+"/collaborators/"+itoa(ownerID), owner, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("remover o dono deveria ser 400, veio %d", resp.StatusCode)
	}
}
