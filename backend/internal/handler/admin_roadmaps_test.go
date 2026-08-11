package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// getRoadmapDTO devolve o roadmap como visto pelo portador do cookie informado.
func getRoadmapDTO(t *testing.T, srv *httptest.Server, id int64, cookie *http.Cookie) roadmapDTO {
	t.Helper()
	resp, data := doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id), cookie, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get roadmap deveria ser 200, veio %d (%s)", resp.StatusCode, data)
	}
	var dto roadmapDTO
	if err := json.Unmarshal(data, &dto); err != nil {
		t.Fatalf("decode roadmap: %v", err)
	}
	return dto
}

func TestAdminListRoadmapsRequiresAdmin(t *testing.T) {
	srv, q := newTestServer(t)
	plain := loginAs(t, q, "comum.admrm@test.local", "user")

	resp, _ := doReq(t, srv, http.MethodGet, "/api/admin/roadmaps", plain, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("usuário comum não pode listar roadmaps do admin; esperava 403, veio %d", resp.StatusCode)
	}
	resp, _ = doReq(t, srv, http.MethodGet, "/api/admin/roadmaps", nil, nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("sem sessão esperava 401, veio %d", resp.StatusCode)
	}
}

func TestAdminListRoadmapsShowsOwnerAndCounts(t *testing.T) {
	srv, q := newTestServer(t)
	admin := loginAs(t, q, "admin.lista@test.local", "admin")
	owner := loginAs(t, q, "dono.lista@test.local", "user")
	loginAs(t, q, "colab.lista@test.local", "user")

	id, _ := createRoadmap(t, srv, owner, "Roadmap Lista Admin 2026")
	doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/items", owner,
		map[string]any{"title": "Iniciativa", "status": "nao-iniciado"})
	doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", owner,
		map[string]any{"email": "colab.lista@test.local", "canEdit": true, "canShare": false})

	resp, data := doReq(t, srv, http.MethodGet, "/api/admin/roadmaps", admin, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("admin deveria listar roadmaps (200), veio %d (%s)", resp.StatusCode, data)
	}
	var list []adminRoadmapDTO
	if err := json.Unmarshal(data, &list); err != nil {
		t.Fatalf("decode lista: %v", err)
	}
	var found *adminRoadmapDTO
	for i := range list {
		if list[i].ID == id {
			found = &list[i]
		}
	}
	if found == nil {
		t.Fatalf("roadmap %d não veio na lista do admin: %+v", id, list)
	}
	if found.OwnerEmail != "dono.lista@test.local" {
		t.Fatalf("ownerEmail esperado dono.lista@test.local, veio %q", found.OwnerEmail)
	}
	if found.ItemCount != 1 {
		t.Fatalf("itemCount esperado 1, veio %d", found.ItemCount)
	}
	if found.CollaboratorCount != 1 {
		t.Fatalf("collaboratorCount esperado 1, veio %d", found.CollaboratorCount)
	}
}

// Caso central: o dono saiu da empresa e o admin passa o roadmap a outra
// pessoa. Sem "manter como colaborador", o dono anterior perde todo o acesso.
func TestAdminTransferOwnerDropsPreviousOwner(t *testing.T) {
	srv, q := newTestServer(t)
	admin := loginAs(t, q, "admin.transf@test.local", "admin")
	oldOwner := loginAs(t, q, "saiu@test.local", "user")
	newOwner := loginAs(t, q, "assume@test.local", "user")
	newOwnerID := loginUserID(t, q, "assume@test.local")

	id, _ := createRoadmap(t, srv, oldOwner, "Roadmap Orfao 2026")

	resp, data := doReq(t, srv, http.MethodPut, "/api/admin/roadmaps/"+itoa(id)+"/owner", admin,
		map[string]any{"newOwnerId": newOwnerID})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("transferência deveria ser 200, veio %d (%s)", resp.StatusCode, data)
	}
	var out adminRoadmapDTO
	_ = json.Unmarshal(data, &out)
	if out.OwnerID != newOwnerID || out.OwnerEmail != "assume@test.local" {
		t.Fatalf("resposta deveria refletir o novo dono; veio %+v", out)
	}

	ts := srv
	if dto := getRoadmapDTO(t, ts, id, newOwner); !dto.IsOwner || !dto.CanEdit || !dto.CanDelete {
		t.Fatalf("novo dono deveria ter poder total; veio %+v", dto)
	}
	if dto := getRoadmapDTO(t, ts, id, oldOwner); dto.IsOwner || dto.CanEdit || dto.CanShare || dto.CanDelete {
		t.Fatalf("dono anterior deveria ficar sem acesso; veio %+v", dto)
	}

	// E o dono anterior não pode mais editar de fato.
	resp, _ = doReq(t, srv, http.MethodPut, "/api/roadmaps/"+itoa(id), oldOwner, map[string]string{"name": "Tentativa"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("dono anterior não deveria renomear; esperava 403, veio %d", resp.StatusCode)
	}

	// O roadmap passa a aparecer em "Meus roadmaps" do novo dono.
	resp, data = doReq(t, srv, http.MethodGet, "/api/roadmaps?mine=true", newOwner, nil)
	var mine []roadmapDTO
	_ = json.Unmarshal(data, &mine)
	if len(mine) != 1 || mine[0].ID != id {
		t.Fatalf(`esperava o roadmap %d em "meus roadmaps" do novo dono; veio %+v`, id, mine)
	}
}

func TestAdminTransferKeepingPreviousOwnerAsCollaborator(t *testing.T) {
	srv, q := newTestServer(t)
	admin := loginAs(t, q, "admin.keep@test.local", "admin")
	oldOwner := loginAs(t, q, "antigo.keep@test.local", "user")
	loginAs(t, q, "novo.keep@test.local", "user")
	oldOwnerID := loginUserID(t, q, "antigo.keep@test.local")
	newOwnerID := loginUserID(t, q, "novo.keep@test.local")

	id, _ := createRoadmap(t, srv, oldOwner, "Roadmap Keep 2026")

	resp, data := doReq(t, srv, http.MethodPut, "/api/admin/roadmaps/"+itoa(id)+"/owner", admin,
		map[string]any{"newOwnerId": newOwnerID, "keepPreviousAsCollaborator": true})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("transferência deveria ser 200, veio %d (%s)", resp.StatusCode, data)
	}

	dto := getRoadmapDTO(t, srv, id, oldOwner)
	if !dto.CanEdit {
		t.Fatalf("dono anterior mantido deveria continuar editando; veio %+v", dto)
	}
	if dto.IsOwner || dto.CanDelete || dto.CanShare {
		t.Fatalf("dono anterior vira colaborador de edição apenas; veio %+v", dto)
	}

	resp, data = doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/collaborators", admin, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("listar colaboradores deveria ser 200, veio %d", resp.StatusCode)
	}
	var collabs []collaboratorDTO
	_ = json.Unmarshal(data, &collabs)
	if len(collabs) != 1 || collabs[0].UserID != oldOwnerID || !collabs[0].CanEdit || collabs[0].CanShare {
		t.Fatalf("esperava só o dono anterior como colaborador (edita, não compartilha); veio %+v", collabs)
	}
}

// O novo dono não pode continuar listado como colaborador: teria acesso
// duplicado e apareceria duas vezes em "pessoas com acesso".
func TestAdminTransferRemovesCollaboratorRowOfNewOwner(t *testing.T) {
	srv, q := newTestServer(t)
	admin := loginAs(t, q, "admin.dup@test.local", "admin")
	oldOwner := loginAs(t, q, "antigo.dup@test.local", "user")
	loginAs(t, q, "novo.dup@test.local", "user")
	newOwnerID := loginUserID(t, q, "novo.dup@test.local")

	id, _ := createRoadmap(t, srv, oldOwner, "Roadmap Dup 2026")
	doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", oldOwner,
		map[string]any{"email": "novo.dup@test.local", "canEdit": true, "canShare": true})

	resp, data := doReq(t, srv, http.MethodPut, "/api/admin/roadmaps/"+itoa(id)+"/owner", admin,
		map[string]any{"newOwnerId": newOwnerID})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("transferência deveria ser 200, veio %d (%s)", resp.StatusCode, data)
	}
	var out adminRoadmapDTO
	_ = json.Unmarshal(data, &out)
	if out.CollaboratorCount != 0 {
		t.Fatalf("novo dono não deveria restar como colaborador; collaboratorCount=%d", out.CollaboratorCount)
	}

	resp, data = doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/collaborators", admin, nil)
	var collabs []collaboratorDTO
	_ = json.Unmarshal(data, &collabs)
	if len(collabs) != 0 {
		t.Fatalf("lista de colaboradores deveria ficar vazia; veio %+v", collabs)
	}
}

func TestAdminTransferValidations(t *testing.T) {
	srv, q := newTestServer(t)
	admin := loginAs(t, q, "admin.val@test.local", "admin")
	owner := loginAs(t, q, "dono.val@test.local", "user")
	other := loginAs(t, q, "outro.val@test.local", "user")
	ownerID := loginUserID(t, q, "dono.val@test.local")
	otherID := loginUserID(t, q, "outro.val@test.local")

	id, _ := createRoadmap(t, srv, owner, "Roadmap Val 2026")

	cases := []struct {
		name   string
		path   string
		cookie *http.Cookie
		body   map[string]any
		want   int
	}{
		{"não-admin", "/api/admin/roadmaps/" + itoa(id) + "/owner", other, map[string]any{"newOwnerId": otherID}, http.StatusForbidden},
		{"roadmap inexistente", "/api/admin/roadmaps/999999999/owner", admin, map[string]any{"newOwnerId": otherID}, http.StatusNotFound},
		{"usuário inexistente", "/api/admin/roadmaps/" + itoa(id) + "/owner", admin, map[string]any{"newOwnerId": 999999999}, http.StatusNotFound},
		{"já é o dono", "/api/admin/roadmaps/" + itoa(id) + "/owner", admin, map[string]any{"newOwnerId": ownerID}, http.StatusBadRequest},
		{"sem novo dono", "/api/admin/roadmaps/" + itoa(id) + "/owner", admin, map[string]any{}, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, data := doReq(t, srv, http.MethodPut, tc.path, tc.cookie, tc.body)
			if resp.StatusCode != tc.want {
				t.Fatalf("esperava %d, veio %d (%s)", tc.want, resp.StatusCode, data)
			}
		})
	}
}

// A restrição UNIQUE (owner_id, name) impede que o novo dono fique com dois
// roadmaps de mesmo nome — o admin precisa de uma mensagem clara, não de um 500.
func TestAdminTransferConflictsWithHomonymousRoadmap(t *testing.T) {
	srv, q := newTestServer(t)
	admin := loginAs(t, q, "admin.conf@test.local", "admin")
	oldOwner := loginAs(t, q, "antigo.conf@test.local", "user")
	newOwner := loginAs(t, q, "novo.conf@test.local", "user")
	newOwnerID := loginUserID(t, q, "novo.conf@test.local")

	const name = "Roadmap Homonimo 2026"
	id, _ := createRoadmap(t, srv, oldOwner, name)
	createRoadmap(t, srv, newOwner, name)

	resp, data := doReq(t, srv, http.MethodPut, "/api/admin/roadmaps/"+itoa(id)+"/owner", admin,
		map[string]any{"newOwnerId": newOwnerID, "keepPreviousAsCollaborator": true})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("nome duplicado deveria ser 409, veio %d (%s)", resp.StatusCode, data)
	}

	// A transferência falhou: o dono original continua dono e o vínculo
	// temporário de colaborador foi desfeito.
	dto := getRoadmapDTO(t, srv, id, oldOwner)
	if !dto.IsOwner {
		t.Fatalf("dono original deveria continuar dono após o conflito; veio %+v", dto)
	}
	resp, data = doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/collaborators", admin, nil)
	var collabs []collaboratorDTO
	_ = json.Unmarshal(data, &collabs)
	if len(collabs) != 0 {
		t.Fatalf("nenhum colaborador deveria restar após o conflito; veio %+v (%s)", collabs, data)
	}
}

// O admin gerencia o acesso de qualquer roadmap, mas isso não lhe dá poder de
// editar o conteúdo nem de excluir o roadmap.
func TestAdminManagesAccessWithoutEditingPower(t *testing.T) {
	srv, q := newTestServer(t)
	admin := loginAs(t, q, "admin.acesso@test.local", "admin")
	owner := loginAs(t, q, "dono.acesso@test.local", "user")
	loginAs(t, q, "convidado.acesso@test.local", "user")
	guestID := loginUserID(t, q, "convidado.acesso@test.local")

	id, slug := createRoadmap(t, srv, owner, "Roadmap Acesso 2026")

	dto := getRoadmapDTO(t, srv, id, admin)
	if !dto.CanShare {
		t.Fatalf("admin deveria enxergar canShare=true em qualquer roadmap; veio %+v", dto)
	}
	if dto.CanEdit || dto.CanDelete || dto.IsOwner {
		t.Fatalf("admin não ganha edição/exclusão pelo painel; veio %+v", dto)
	}

	resp, data := doReq(t, srv, http.MethodPost, "/api/roadmaps/"+itoa(id)+"/collaborators", admin,
		map[string]any{"email": "convidado.acesso@test.local", "canEdit": true, "canShare": false})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("admin deveria convidar colaborador, veio %d (%s)", resp.StatusCode, data)
	}
	resp, _ = doReq(t, srv, http.MethodGet, "/api/roadmaps/"+itoa(id)+"/user-search?q=convidado", admin, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("admin deveria usar o autocomplete de usuários, veio %d", resp.StatusCode)
	}
	resp, _ = doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id)+"/collaborators/"+itoa(guestID), admin, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("admin deveria remover colaborador (204), veio %d", resp.StatusCode)
	}

	resp, _ = doReq(t, srv, http.MethodPut, "/api/roadmaps/"+itoa(id), admin, map[string]string{"name": "Renomeado pelo admin"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("admin não deveria renomear roadmap alheio; esperava 403, veio %d", resp.StatusCode)
	}
	resp, _ = doReq(t, srv, http.MethodDelete, "/api/roadmaps/"+itoa(id), admin, map[string]string{"confirmSlug": slug})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("admin não deveria excluir roadmap alheio; esperava 403, veio %d", resp.StatusCode)
	}
}
