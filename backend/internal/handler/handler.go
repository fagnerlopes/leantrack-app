package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/auth"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/config"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database/sqlc"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/slugutil"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// isUniqueViolation reporta se o erro é uma violação de UNIQUE do Postgres (23505).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

type Handler struct {
	Q   *sqlc.Queries
	Cfg *config.Config
}

func New(q *sqlc.Queries, cfg *config.Config) *Handler {
	return &Handler{Q: q, Cfg: cfg}
}

// ──────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func parseDate(s string) (pgtype.Date, error) {
	if s == "" {
		return pgtype.Date{Valid: false}, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return pgtype.Date{}, err
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}

func fmtDate(d pgtype.Date) *string {
	if !d.Valid {
		return nil
	}
	s := d.Time.Format("2006-01-02")
	return &s
}

func ptr[T any](v T) *T { return &v }

// ──────────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────────

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("GET /up", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Public auth
	mux.HandleFunc("POST /api/auth/login", h.login)
	mux.HandleFunc("POST /api/auth/logout", h.logout)

	// Authenticated routes
	authM := auth.Middleware(h.Q, true)
	ownerM := auth.RequireRoadmapOwner(h.Q)
	editorM := auth.RequireRoadmapEditor(h.Q)
	sharerM := auth.RequireRoadmapSharer(h.Q)
	// adminM: autenticado + papel admin.
	adminM := func(next http.Handler) http.Handler { return authM(auth.RequireAdmin(next)) }

	mux.Handle("GET /api/auth/me", authM(http.HandlerFunc(h.me)))
	mux.Handle("PUT /api/auth/me", authM(http.HandlerFunc(h.updateProfile)))

	// Roadmaps (endereçados por id; leitura aberta a qualquer logado).
	mux.Handle("GET /api/roadmaps", authM(http.HandlerFunc(h.listRoadmaps)))
	mux.Handle("POST /api/roadmaps", authM(http.HandlerFunc(h.createRoadmap)))
	mux.Handle("GET /api/roadmaps/{id}", authM(http.HandlerFunc(h.getRoadmap)))
	mux.Handle("PUT /api/roadmaps/{id}", authM(editorM(http.HandlerFunc(h.updateRoadmap))))
	mux.Handle("DELETE /api/roadmaps/{id}", authM(ownerM(http.HandlerFunc(h.deleteRoadmap))))

	mux.Handle("GET /api/roadmaps/shared", authM(http.HandlerFunc(h.listSharedRoadmaps)))

	// Itens escopados por roadmap (mutação por editor; leitura aberta).
	mux.Handle("GET /api/roadmaps/{id}/items", authM(http.HandlerFunc(h.listRoadmapItems)))
	mux.Handle("POST /api/roadmaps/{id}/items", authM(editorM(http.HandlerFunc(h.createRoadmapItem))))
	mux.Handle("PUT /api/roadmaps/{id}/items/reorder", authM(editorM(http.HandlerFunc(h.reorderRoadmapItems))))
	mux.Handle("PUT /api/roadmaps/{id}/items/{itemId}", authM(editorM(http.HandlerFunc(h.updateRoadmapItem))))
	mux.Handle("DELETE /api/roadmaps/{id}/items/{itemId}", authM(editorM(http.HandlerFunc(h.deleteRoadmapItem))))

	// Colaboradores escopados por roadmap (gestão por quem pode compartilhar).
	mux.Handle("GET /api/roadmaps/{id}/collaborators", authM(sharerM(http.HandlerFunc(h.listCollaborators))))
	mux.Handle("POST /api/roadmaps/{id}/collaborators", authM(sharerM(http.HandlerFunc(h.addCollaborator))))
	mux.Handle("PUT /api/roadmaps/{id}/collaborators/{userId}", authM(sharerM(http.HandlerFunc(h.updateCollaborator))))
	mux.Handle("DELETE /api/roadmaps/{id}/collaborators/{userId}", authM(sharerM(http.HandlerFunc(h.removeCollaborator))))

	// Administração de contas (somente admin).
	mux.Handle("GET /api/admin/users", adminM(http.HandlerFunc(h.listUsers)))
	mux.Handle("POST /api/admin/users", adminM(http.HandlerFunc(h.createUser)))
	mux.Handle("DELETE /api/admin/users/{id}", adminM(http.HandlerFunc(h.deleteUser)))
	mux.Handle("PUT /api/admin/users/{id}/role", adminM(http.HandlerFunc(h.updateUserRole)))

	// Dev-only login
	if h.Cfg.DevMode {
		mux.HandleFunc("POST /api/dev/login", h.devLogin)
	}

	return mux
}

// ──────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, "email e senha obrigatórios")
		return
	}
	u, err := h.Q.GetUserByEmail(r.Context(), req.Email)
	if err != nil || u.PasswordHash == nil || !auth.CheckPassword(*u.PasswordHash, req.Password) {
		writeErr(w, http.StatusUnauthorized, "credenciais inválidas")
		return
	}
	tok, exp, err := auth.CreateSession(r.Context(), h.Q, u.ID)
	if err != nil {
		slog.Error("create session", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao criar sessão")
		return
	}
	secure := strings.HasPrefix(h.Cfg.BaseURL, "https://")
	auth.SetCookie(w, tok, exp, secure)
	writeJSON(w, http.StatusOK, auth.SessionUser{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role})
}

func (h *Handler) devLogin(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" {
		writeErr(w, http.StatusBadRequest, "email obrigatório")
		return
	}
	u, err := h.Q.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		// create on the fly
		hash, _ := auth.HashPassword("dev")
		_ = h.Q.UpsertSeedUser(r.Context(), sqlc.UpsertSeedUserParams{
			Email: req.Email, PasswordHash: &hash, Name: "Dev", Role: "admin",
		})
		u, err = h.Q.GetUserByEmail(r.Context(), req.Email)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro")
			return
		}
	}
	tok, exp, err := auth.CreateSession(r.Context(), h.Q, u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro")
		return
	}
	auth.SetCookie(w, tok, exp, false)
	writeJSON(w, http.StatusOK, auth.SessionUser{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(auth.CookieName)
	if err == nil {
		_ = h.Q.DeleteSession(r.Context(), c.Value)
	}
	secure := strings.HasPrefix(h.Cfg.BaseURL, "https://")
	auth.ClearCookie(w, secure)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	u := auth.FromContext(r.Context())
	if u == nil {
		writeErr(w, http.StatusUnauthorized, "não autenticado")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// updateProfile permite que o usuário logado altere o próprio nome e,
// opcionalmente, defina uma nova senha. Senha em branco = mantém a atual.
type updateProfileReq struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	me := auth.FromContext(r.Context())
	if me == nil {
		writeErr(w, http.StatusUnauthorized, "não autenticado")
		return
	}
	var req updateProfileReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeErr(w, http.StatusBadRequest, "nome obrigatório")
		return
	}
	if len(name) > 200 {
		writeErr(w, http.StatusBadRequest, "nome muito longo (máx. 200)")
		return
	}
	// Senha é opcional: só altera quando preenchida.
	if req.Password != "" {
		if len(req.Password) < 8 {
			writeErr(w, http.StatusBadRequest, "a senha deve ter ao menos 8 caracteres")
			return
		}
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao processar senha")
			return
		}
		if err := h.Q.UpdateOwnPassword(r.Context(), sqlc.UpdateOwnPasswordParams{ID: me.ID, PasswordHash: &hash}); err != nil {
			slog.Error("update own password", "err", err)
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar senha")
			return
		}
	}
	u, err := h.Q.UpdateOwnName(r.Context(), sqlc.UpdateOwnNameParams{ID: me.ID, Name: name})
	if err != nil {
		slog.Error("update own name", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar")
		return
	}
	writeJSON(w, http.StatusOK, auth.SessionUser{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role})
}

// ──────────────────────────────────────────────────────────────
// Items
// ──────────────────────────────────────────────────────────────

type itemDTO struct {
	ID             int64   `json:"id"`
	Title          string  `json:"title"`
	Status         string  `json:"status"`
	StartDate      *string `json:"startDate"`
	EndDate        *string `json:"endDate"`
	Progress       int32   `json:"progress"`
	DependencyID   *int64  `json:"dependencyId"`
	Notes          string  `json:"notes"`
	ExtTeam        *string `json:"extTeam"`
	ExtDescription *string `json:"extDescription"`
	ExtMilestone   *string `json:"extMilestone"`
	SortOrder      int32   `json:"sortOrder"`
	Color          *string `json:"color"`
	EpicUrl        *string `json:"epicUrl"`
}

type rowLike interface {
	sqlc.RoadmapItem | sqlc.ListItemsByRoadmapRow | sqlc.CreateItemRow | sqlc.UpdateItemRow
}

func toDTO[T rowLike](row T) itemDTO {
	switch it := any(row).(type) {
	case sqlc.RoadmapItem:
		return itemDTO{ID: it.ID, Title: it.Title, Status: it.Status, StartDate: fmtDate(it.StartDate), EndDate: fmtDate(it.EndDate), Progress: it.Progress, DependencyID: it.DependencyID, Notes: it.Notes, ExtTeam: it.ExtTeam, ExtDescription: it.ExtDescription, ExtMilestone: fmtDate(it.ExtMilestone), SortOrder: it.SortOrder, Color: it.Color, EpicUrl: it.EpicUrl}
	case sqlc.ListItemsByRoadmapRow:
		return itemDTO{ID: it.ID, Title: it.Title, Status: it.Status, StartDate: fmtDate(it.StartDate), EndDate: fmtDate(it.EndDate), Progress: it.Progress, DependencyID: it.DependencyID, Notes: it.Notes, ExtTeam: it.ExtTeam, ExtDescription: it.ExtDescription, ExtMilestone: fmtDate(it.ExtMilestone), SortOrder: it.SortOrder, Color: it.Color, EpicUrl: it.EpicUrl}
	case sqlc.CreateItemRow:
		return itemDTO{ID: it.ID, Title: it.Title, Status: it.Status, StartDate: fmtDate(it.StartDate), EndDate: fmtDate(it.EndDate), Progress: it.Progress, DependencyID: it.DependencyID, Notes: it.Notes, ExtTeam: it.ExtTeam, ExtDescription: it.ExtDescription, ExtMilestone: fmtDate(it.ExtMilestone), SortOrder: it.SortOrder, Color: it.Color, EpicUrl: it.EpicUrl}
	case sqlc.UpdateItemRow:
		return itemDTO{ID: it.ID, Title: it.Title, Status: it.Status, StartDate: fmtDate(it.StartDate), EndDate: fmtDate(it.EndDate), Progress: it.Progress, DependencyID: it.DependencyID, Notes: it.Notes, ExtTeam: it.ExtTeam, ExtDescription: it.ExtDescription, ExtMilestone: fmtDate(it.ExtMilestone), SortOrder: it.SortOrder, Color: it.Color, EpicUrl: it.EpicUrl}
	}
	return itemDTO{}
}

type itemReq struct {
	Title          string  `json:"title"`
	Status         string  `json:"status"`
	StartDate      string  `json:"startDate"`
	EndDate        string  `json:"endDate"`
	Progress       int32   `json:"progress"`
	DependencyID   *int64  `json:"dependencyId"`
	Notes          string  `json:"notes"`
	ExtTeam        *string `json:"extTeam"`
	ExtDescription *string `json:"extDescription"`
	ExtMilestone   string  `json:"extMilestone"`
	SortOrder      int32   `json:"sortOrder"`
	Color          *string `json:"color"`
	EpicUrl        *string `json:"epicUrl"`
}

func sanitizeEpicUrl(u *string) *string {
	if u == nil {
		return nil
	}
	s := strings.TrimSpace(*u)
	if s == "" {
		return nil
	}
	if !strings.HasPrefix(s, "http://") && !strings.HasPrefix(s, "https://") {
		return nil
	}
	if len(s) > 2000 {
		return nil
	}
	return &s
}

var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func sanitizeColor(c *string) *string {
	if c == nil {
		return nil
	}
	s := strings.TrimSpace(*c)
	if s == "" {
		return nil
	}
	if !colorPattern.MatchString(s) {
		return nil
	}
	return &s
}

var validStatuses = map[string]bool{
	"em-andamento": true, "nao-iniciado": true, "concluido": true, "pausado": true,
}

func (req itemReq) validate() error {
	if strings.TrimSpace(req.Title) == "" {
		return errors.New("título obrigatório")
	}
	if !validStatuses[req.Status] {
		return errors.New("status inválido")
	}
	if req.Progress < 0 || req.Progress > 100 {
		return errors.New("progresso deve estar entre 0 e 100")
	}
	return nil
}

// reorderEntry é o payload de reordenação de itens (rotas escopadas por roadmap).
type reorderEntry struct {
	ID        int64 `json:"id"`
	SortOrder int32 `json:"sortOrder"`
}

// ── Itens escopados por roadmap (handlers compartilhados) ───────

func (h *Handler) writeItemsByRoadmap(w http.ResponseWriter, r *http.Request, roadmapID int64) {
	items, err := h.Q.ListItemsByRoadmap(r.Context(), roadmapID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar")
		return
	}
	out := make([]itemDTO, 0, len(items))
	for _, it := range items {
		out = append(out, toDTO(it))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) createItemInRoadmap(w http.ResponseWriter, r *http.Request, roadmapID int64) {
	var req itemReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	if err := req.validate(); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	sd, err := parseDate(req.StartDate)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "data início inválida")
		return
	}
	ed, err := parseDate(req.EndDate)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "data fim inválida")
		return
	}
	em, err := parseDate(req.ExtMilestone)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "data marco inválida")
		return
	}
	it, err := h.Q.CreateItem(r.Context(), sqlc.CreateItemParams{
		RoadmapID: roadmapID, Title: req.Title, Status: req.Status,
		StartDate: sd, EndDate: ed, Progress: req.Progress,
		DependencyID: req.DependencyID, Notes: req.Notes,
		ExtTeam: req.ExtTeam, ExtDescription: req.ExtDescription,
		ExtMilestone: em, SortOrder: req.SortOrder,
		Color:   sanitizeColor(req.Color),
		EpicUrl: sanitizeEpicUrl(req.EpicUrl),
	})
	if err != nil {
		slog.Error("create item", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao criar")
		return
	}
	writeJSON(w, http.StatusCreated, toDTO(it))
}

func (h *Handler) updateItemInRoadmap(w http.ResponseWriter, r *http.Request, roadmapID int64) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	var req itemReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	if err := req.validate(); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	sd, _ := parseDate(req.StartDate)
	ed, _ := parseDate(req.EndDate)
	em, _ := parseDate(req.ExtMilestone)
	it, err := h.Q.UpdateItem(r.Context(), sqlc.UpdateItemParams{
		ID: id, RoadmapID: roadmapID, Title: req.Title, Status: req.Status,
		StartDate: sd, EndDate: ed, Progress: req.Progress,
		DependencyID: req.DependencyID, Notes: req.Notes,
		ExtTeam: req.ExtTeam, ExtDescription: req.ExtDescription,
		ExtMilestone: em, SortOrder: req.SortOrder,
		Color:   sanitizeColor(req.Color),
		EpicUrl: sanitizeEpicUrl(req.EpicUrl),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "não encontrado")
		return
	}
	if err != nil {
		slog.Error("update item", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar")
		return
	}
	writeJSON(w, http.StatusOK, toDTO(it))
}

func (h *Handler) reorderItemsInRoadmap(w http.ResponseWriter, r *http.Request, roadmapID int64) {
	var req []reorderEntry
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	if len(req) == 0 {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	if len(req) > 1000 {
		writeErr(w, http.StatusBadRequest, "lote muito grande")
		return
	}
	for _, e := range req {
		if err := h.Q.UpdateSortOrder(r.Context(), sqlc.UpdateSortOrderParams{
			ID: e.ID, RoadmapID: roadmapID, SortOrder: e.SortOrder,
		}); err != nil {
			slog.Error("reorder", "id", e.ID, "err", err)
			writeErr(w, http.StatusInternalServerError, "erro ao reordenar")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) deleteItemInRoadmap(w http.ResponseWriter, r *http.Request, roadmapID int64) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	if err := h.Q.DeleteItem(r.Context(), sqlc.DeleteItemParams{ID: id, RoadmapID: roadmapID}); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao remover")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// ── Rotas escopadas /api/roadmaps/{id}/items* ───────────────────
// roadmapIDFromPath lê e valida o {id} do roadmap na rota.

func roadmapIDFromPath(r *http.Request) (int64, error) {
	return strconv.ParseInt(r.PathValue("id"), 10, 64)
}

func (h *Handler) listRoadmapItems(w http.ResponseWriter, r *http.Request) {
	rid, err := roadmapIDFromPath(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	h.writeItemsByRoadmap(w, r, rid)
}

func (h *Handler) createRoadmapItem(w http.ResponseWriter, r *http.Request) {
	rid, err := roadmapIDFromPath(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	h.createItemInRoadmap(w, r, rid)
}

func (h *Handler) updateRoadmapItem(w http.ResponseWriter, r *http.Request) {
	rid, err := roadmapIDFromPath(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	h.updateItemInRoadmapByItemID(w, r, rid)
}

func (h *Handler) deleteRoadmapItem(w http.ResponseWriter, r *http.Request) {
	rid, err := roadmapIDFromPath(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	h.deleteItemInRoadmapByItemID(w, r, rid)
}

func (h *Handler) reorderRoadmapItems(w http.ResponseWriter, r *http.Request) {
	rid, err := roadmapIDFromPath(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	h.reorderItemsInRoadmap(w, r, rid)
}

// As variantes escopadas usam {itemId} (e não {id}, que é o roadmap).
func (h *Handler) updateItemInRoadmapByItemID(w http.ResponseWriter, r *http.Request, roadmapID int64) {
	id, err := strconv.ParseInt(r.PathValue("itemId"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id do item inválido")
		return
	}
	var req itemReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	if err := req.validate(); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	sd, _ := parseDate(req.StartDate)
	ed, _ := parseDate(req.EndDate)
	em, _ := parseDate(req.ExtMilestone)
	it, err := h.Q.UpdateItem(r.Context(), sqlc.UpdateItemParams{
		ID: id, RoadmapID: roadmapID, Title: req.Title, Status: req.Status,
		StartDate: sd, EndDate: ed, Progress: req.Progress,
		DependencyID: req.DependencyID, Notes: req.Notes,
		ExtTeam: req.ExtTeam, ExtDescription: req.ExtDescription,
		ExtMilestone: em, SortOrder: req.SortOrder,
		Color:   sanitizeColor(req.Color),
		EpicUrl: sanitizeEpicUrl(req.EpicUrl),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "não encontrado")
		return
	}
	if err != nil {
		slog.Error("update item", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar")
		return
	}
	writeJSON(w, http.StatusOK, toDTO(it))
}

func (h *Handler) deleteItemInRoadmapByItemID(w http.ResponseWriter, r *http.Request, roadmapID int64) {
	id, err := strconv.ParseInt(r.PathValue("itemId"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id do item inválido")
		return
	}
	if err := h.Q.DeleteItem(r.Context(), sqlc.DeleteItemParams{ID: id, RoadmapID: roadmapID}); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao remover")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// ──────────────────────────────────────────────────────────────
// Roadmaps
// ──────────────────────────────────────────────────────────────

type roadmapDTO struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	OwnerID     int64  `json:"ownerId"`
	OwnerName   string `json:"ownerName"`
	ItemCount   int64  `json:"itemCount"`
	CanEdit     bool   `json:"canEdit"`
	CanShare    bool   `json:"canShare"`
	CanDelete   bool   `json:"canDelete"`
	IsOwner     bool   `json:"isOwner"`
}

type roadmapReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func validateRoadmapName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("nome obrigatório")
	}
	if len(name) > 200 {
		return "", errors.New("nome muito longo (máx. 200)")
	}
	if slugutil.Slugify(name) == "" {
		return "", errors.New("nome inválido")
	}
	return name, nil
}

func (h *Handler) listRoadmaps(w http.ResponseWriter, r *http.Request) {
	u := auth.FromContext(r.Context())
	if u == nil {
		writeErr(w, http.StatusUnauthorized, "não autenticado")
		return
	}
	collabs := map[int64]sqlc.ListMyCollaborationsRow{}
	if rows, err := h.Q.ListMyCollaborations(r.Context(), u.ID); err == nil {
		for _, c := range rows {
			collabs[c.RoadmapID] = c
		}
	}
	dto := func(id int64, name, slug, desc string, ownerID int64, ownerName string, count int64) roadmapDTO {
		isOwner := ownerID == u.ID
		canEdit, canShare := isOwner, isOwner
		if !isOwner {
			if c, ok := collabs[id]; ok {
				canEdit, canShare = c.CanEdit, c.CanShare
			}
		}
		return roadmapDTO{
			ID: id, Name: name, Slug: slug, Description: desc,
			OwnerID: ownerID, OwnerName: ownerName, ItemCount: count,
			CanEdit: canEdit, CanShare: canShare, CanDelete: isOwner, IsOwner: isOwner,
		}
	}
	out := make([]roadmapDTO, 0)
	if r.URL.Query().Get("mine") == "true" {
		rows, err := h.Q.ListMyRoadmaps(r.Context(), u.ID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao listar")
			return
		}
		for _, rm := range rows {
			out = append(out, dto(rm.ID, rm.Name, rm.Slug, rm.Description, rm.OwnerID, rm.OwnerName, rm.ItemCount))
		}
	} else {
		rows, err := h.Q.ListRoadmaps(r.Context())
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao listar")
			return
		}
		for _, rm := range rows {
			out = append(out, dto(rm.ID, rm.Name, rm.Slug, rm.Description, rm.OwnerID, rm.OwnerName, rm.ItemCount))
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) listSharedRoadmaps(w http.ResponseWriter, r *http.Request) {
	u := auth.FromContext(r.Context())
	if u == nil {
		writeErr(w, http.StatusUnauthorized, "não autenticado")
		return
	}
	rows, err := h.Q.ListSharedRoadmaps(r.Context(), u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar compartilhados")
		return
	}
	out := make([]roadmapDTO, 0, len(rows))
	for _, rm := range rows {
		out = append(out, roadmapDTO{
			ID: rm.ID, Name: rm.Name, Slug: rm.Slug, Description: rm.Description,
			OwnerID: rm.OwnerID, OwnerName: rm.OwnerName, ItemCount: rm.ItemCount,
			CanEdit: rm.CanEdit, CanShare: rm.CanShare,
			CanDelete: false, IsOwner: false,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) createRoadmap(w http.ResponseWriter, r *http.Request) {
	u := auth.FromContext(r.Context())
	if u == nil {
		writeErr(w, http.StatusUnauthorized, "não autenticado")
		return
	}
	var req roadmapReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	name, err := validateRoadmapName(req.Name)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	rm, err := h.Q.CreateRoadmap(r.Context(), sqlc.CreateRoadmapParams{
		OwnerID: u.ID, Name: name, Slug: slugutil.Slugify(name),
		Description: strings.TrimSpace(req.Description),
	})
	if isUniqueViolation(err) {
		writeErr(w, http.StatusConflict, "você já tem um roadmap com esse nome")
		return
	}
	if err != nil {
		slog.Error("create roadmap", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao criar")
		return
	}
	writeJSON(w, http.StatusCreated, roadmapDTO{
		ID: rm.ID, Name: rm.Name, Slug: rm.Slug, Description: rm.Description,
		OwnerID: rm.OwnerID, OwnerName: u.Name, ItemCount: 0, CanEdit: true,
		CanShare: true, CanDelete: true, IsOwner: true,
	})
}

func (h *Handler) getRoadmap(w http.ResponseWriter, r *http.Request) {
	u := auth.FromContext(r.Context())
	if u == nil {
		writeErr(w, http.StatusUnauthorized, "não autenticado")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	rm, err := h.Q.GetRoadmapByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "roadmap não encontrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao carregar")
		return
	}
	ownerName := u.Name
	isOwner := rm.OwnerID == u.ID
	canEdit, canShare := isOwner, isOwner
	if !isOwner {
		if owner, err := h.Q.GetUserByID(r.Context(), rm.OwnerID); err == nil {
			ownerName = owner.Name
		}
		if c, err := h.Q.GetCollaborator(r.Context(), sqlc.GetCollaboratorParams{RoadmapID: id, UserID: u.ID}); err == nil {
			canEdit, canShare = c.CanEdit, c.CanShare
		}
	}
	count, _ := h.Q.CountItemsByRoadmap(r.Context(), id)
	writeJSON(w, http.StatusOK, roadmapDTO{
		ID: rm.ID, Name: rm.Name, Slug: rm.Slug, Description: rm.Description,
		OwnerID: rm.OwnerID, OwnerName: ownerName, ItemCount: count,
		CanEdit: canEdit, CanShare: canShare, CanDelete: isOwner, IsOwner: isOwner,
	})
}

func (h *Handler) updateRoadmap(w http.ResponseWriter, r *http.Request) {
	u := auth.FromContext(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	var req roadmapReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	name, err := validateRoadmapName(req.Name)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	rm, err := h.Q.UpdateRoadmap(r.Context(), sqlc.UpdateRoadmapParams{
		ID: id, Name: name, Slug: slugutil.Slugify(name),
		Description: strings.TrimSpace(req.Description),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "roadmap não encontrado")
		return
	}
	if isUniqueViolation(err) {
		writeErr(w, http.StatusConflict, "você já tem um roadmap com esse nome")
		return
	}
	if err != nil {
		slog.Error("update roadmap", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar")
		return
	}
	count, _ := h.Q.CountItemsByRoadmap(r.Context(), id)
	writeJSON(w, http.StatusOK, roadmapDTO{
		ID: rm.ID, Name: rm.Name, Slug: rm.Slug, Description: rm.Description,
		OwnerID: rm.OwnerID, OwnerName: u.Name, ItemCount: count, CanEdit: true,
		CanShare: true, CanDelete: true, IsOwner: true,
	})
}

type deleteRoadmapReq struct {
	ConfirmSlug string `json:"confirmSlug"`
}

func (h *Handler) deleteRoadmap(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	var req deleteRoadmapReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	rm, err := h.Q.GetRoadmapByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "roadmap não encontrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao carregar")
		return
	}
	if strings.TrimSpace(req.ConfirmSlug) != rm.Slug {
		writeErr(w, http.StatusBadRequest, "confirmação não confere com o slug do roadmap")
		return
	}
	if err := h.Q.DeleteRoadmap(r.Context(), id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao remover")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// ──────────────────────────────────────────────────────────────
// Colaboradores (compartilhamento)
// ──────────────────────────────────────────────────────────────

type collaboratorDTO struct {
	UserID   int64  `json:"userId"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	CanEdit  bool   `json:"canEdit"`
	CanShare bool   `json:"canShare"`
}

func (h *Handler) listCollaborators(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	rows, err := h.Q.ListCollaboratorsByRoadmap(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar colaboradores")
		return
	}
	out := make([]collaboratorDTO, 0, len(rows))
	for _, c := range rows {
		out = append(out, collaboratorDTO{
			UserID: c.UserID, Name: c.UserName, Email: c.UserEmail,
			CanEdit: c.CanEdit, CanShare: c.CanShare,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

type addCollaboratorReq struct {
	Email    string `json:"email"`
	CanEdit  bool   `json:"canEdit"`
	CanShare bool   `json:"canShare"`
}

func (h *Handler) addCollaborator(w http.ResponseWriter, r *http.Request) {
	actor := auth.FromContext(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	var req addCollaboratorReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		writeErr(w, http.StatusBadRequest, "e-mail obrigatório")
		return
	}
	rm, err := h.Q.GetRoadmapByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "roadmap não encontrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao carregar roadmap")
		return
	}
	target, err := h.Q.GetUserByEmail(r.Context(), email)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "Não há conta com esse e-mail. Solicite o cadastro a marcus.januario@locaweb.com.br.")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar usuário")
		return
	}
	if target.ID == rm.OwnerID {
		writeErr(w, http.StatusBadRequest, "o dono já tem acesso total ao roadmap")
		return
	}
	createdBy := actor.ID
	row, err := h.Q.UpsertCollaborator(r.Context(), sqlc.UpsertCollaboratorParams{
		RoadmapID: id, UserID: target.ID,
		CanEdit: req.CanEdit, CanShare: req.CanShare,
		CreatedBy: &createdBy,
	})
	if err != nil {
		slog.Error("upsert collaborator", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao convidar")
		return
	}
	writeJSON(w, http.StatusCreated, collaboratorDTO{
		UserID: target.ID, Name: target.Name, Email: target.Email,
		CanEdit: row.CanEdit, CanShare: row.CanShare,
	})
}

type updateCollaboratorReq struct {
	CanEdit  bool `json:"canEdit"`
	CanShare bool `json:"canShare"`
}

func (h *Handler) updateCollaborator(w http.ResponseWriter, r *http.Request) {
	actor := auth.FromContext(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	userID, err := strconv.ParseInt(r.PathValue("userId"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "userId inválido")
		return
	}
	var req updateCollaboratorReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	rm, err := h.Q.GetRoadmapByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "roadmap não encontrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao carregar roadmap")
		return
	}
	if userID == rm.OwnerID {
		writeErr(w, http.StatusBadRequest, "não é possível alterar as permissões do dono")
		return
	}
	if _, err := h.Q.GetCollaborator(r.Context(), sqlc.GetCollaboratorParams{RoadmapID: id, UserID: userID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusNotFound, "colaborador não encontrado")
			return
		}
		writeErr(w, http.StatusInternalServerError, "erro ao carregar colaborador")
		return
	}
	createdBy := actor.ID
	row, err := h.Q.UpsertCollaborator(r.Context(), sqlc.UpsertCollaboratorParams{
		RoadmapID: id, UserID: userID,
		CanEdit: req.CanEdit, CanShare: req.CanShare,
		CreatedBy: &createdBy,
	})
	if err != nil {
		slog.Error("update collaborator", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar permissões")
		return
	}
	u, _ := h.Q.GetUserByID(r.Context(), userID)
	writeJSON(w, http.StatusOK, collaboratorDTO{
		UserID: userID, Name: u.Name, Email: u.Email,
		CanEdit: row.CanEdit, CanShare: row.CanShare,
	})
}

func (h *Handler) removeCollaborator(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	userID, err := strconv.ParseInt(r.PathValue("userId"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "userId inválido")
		return
	}
	rm, err := h.Q.GetRoadmapByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "roadmap não encontrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao carregar roadmap")
		return
	}
	if userID == rm.OwnerID {
		writeErr(w, http.StatusBadRequest, "não é possível remover o dono do roadmap")
		return
	}
	if err := h.Q.DeleteCollaborator(r.Context(), sqlc.DeleteCollaboratorParams{RoadmapID: id, UserID: userID}); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao remover colaborador")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// ──────────────────────────────────────────────────────────────
// Administração de contas (RequireAdmin)
// ──────────────────────────────────────────────────────────────

type userDTO struct {
	ID           int64  `json:"id"`
	Email        string `json:"email"`
	Name         string `json:"name"`
	Role         string `json:"role"`
	AuthProvider string `json:"authProvider"`
}

var validRoles = map[string]bool{"user": true, "admin": true}

func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.Q.ListUsers(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar")
		return
	}
	out := make([]userDTO, 0, len(rows))
	for _, u := range rows {
		out = append(out, userDTO{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, AuthProvider: u.AuthProvider})
	}
	writeJSON(w, http.StatusOK, out)
}

type createUserReq struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

func (h *Handler) createUser(w http.ResponseWriter, r *http.Request) {
	var req createUserReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || req.Email == "" {
		writeErr(w, http.StatusBadRequest, "nome e e-mail obrigatórios")
		return
	}
	if !strings.Contains(req.Email, "@") {
		writeErr(w, http.StatusBadRequest, "e-mail inválido")
		return
	}
	if len(req.Password) < 6 {
		writeErr(w, http.StatusBadRequest, "senha deve ter ao menos 6 caracteres")
		return
	}
	if req.Role == "" {
		req.Role = "user"
	}
	if !validRoles[req.Role] {
		writeErr(w, http.StatusBadRequest, "papel inválido")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao processar senha")
		return
	}
	u, err := h.Q.CreateUser(r.Context(), sqlc.CreateUserParams{
		Email: req.Email, PasswordHash: &hash, Name: req.Name, Role: req.Role,
	})
	if isUniqueViolation(err) {
		writeErr(w, http.StatusConflict, "já existe um usuário com esse e-mail")
		return
	}
	if err != nil {
		slog.Error("create user", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao criar")
		return
	}
	writeJSON(w, http.StatusCreated, userDTO{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, AuthProvider: u.AuthProvider})
}

func (h *Handler) deleteUser(w http.ResponseWriter, r *http.Request) {
	me := auth.FromContext(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	if me != nil && me.ID == id {
		writeErr(w, http.StatusBadRequest, "não é possível remover a própria conta")
		return
	}
	target, err := h.Q.GetUserByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "usuário não encontrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao carregar")
		return
	}
	if target.Role == "admin" {
		if n, err := h.Q.CountAdmins(r.Context()); err == nil && n <= 1 {
			writeErr(w, http.StatusBadRequest, "não é possível remover o último admin")
			return
		}
	}
	if err := h.Q.DeleteUser(r.Context(), id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao remover")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

type updateRoleReq struct {
	Role string `json:"role"`
}

func (h *Handler) updateUserRole(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	var req updateRoleReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	if !validRoles[req.Role] {
		writeErr(w, http.StatusBadRequest, "papel inválido")
		return
	}
	target, err := h.Q.GetUserByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "usuário não encontrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao carregar")
		return
	}
	// Impede rebaixar o último admin.
	if target.Role == "admin" && req.Role != "admin" {
		if n, err := h.Q.CountAdmins(r.Context()); err == nil && n <= 1 {
			writeErr(w, http.StatusBadRequest, "não é possível rebaixar o último admin")
			return
		}
	}
	u, err := h.Q.UpdateUserRole(r.Context(), sqlc.UpdateUserRoleParams{ID: id, Role: req.Role})
	if err != nil {
		slog.Error("update role", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar")
		return
	}
	writeJSON(w, http.StatusOK, userDTO{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, AuthProvider: u.AuthProvider})
}
