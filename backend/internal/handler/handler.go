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
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

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

	// Authenticated routes (loose middleware for /me; strict for items)
	authM := auth.Middleware(h.Q, true)

	mux.Handle("GET /api/auth/me", authM(http.HandlerFunc(h.me)))

	mux.Handle("GET /api/items", authM(http.HandlerFunc(h.listItems)))
	mux.Handle("POST /api/items", authM(auth.RequireAdmin(http.HandlerFunc(h.createItem))))
	mux.Handle("PUT /api/items/reorder", authM(auth.RequireAdmin(http.HandlerFunc(h.reorderItems))))
	mux.Handle("PUT /api/items/{id}", authM(auth.RequireAdmin(http.HandlerFunc(h.updateItem))))
	mux.Handle("DELETE /api/items/{id}", authM(auth.RequireAdmin(http.HandlerFunc(h.deleteItem))))

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
	if err != nil || !auth.CheckPassword(u.PasswordHash, req.Password) {
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
			Email: req.Email, PasswordHash: hash, Name: "Dev", Role: "admin",
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
}

type rowLike interface {
	sqlc.RoadmapItem | sqlc.ListItemsRow | sqlc.CreateItemRow | sqlc.UpdateItemRow
}

func toDTO[T rowLike](row T) itemDTO {
	switch it := any(row).(type) {
	case sqlc.RoadmapItem:
		return itemDTO{ID: it.ID, Title: it.Title, Status: it.Status, StartDate: fmtDate(it.StartDate), EndDate: fmtDate(it.EndDate), Progress: it.Progress, DependencyID: it.DependencyID, Notes: it.Notes, ExtTeam: it.ExtTeam, ExtDescription: it.ExtDescription, ExtMilestone: fmtDate(it.ExtMilestone), SortOrder: it.SortOrder, Color: it.Color}
	case sqlc.ListItemsRow:
		return itemDTO{ID: it.ID, Title: it.Title, Status: it.Status, StartDate: fmtDate(it.StartDate), EndDate: fmtDate(it.EndDate), Progress: it.Progress, DependencyID: it.DependencyID, Notes: it.Notes, ExtTeam: it.ExtTeam, ExtDescription: it.ExtDescription, ExtMilestone: fmtDate(it.ExtMilestone), SortOrder: it.SortOrder, Color: it.Color}
	case sqlc.CreateItemRow:
		return itemDTO{ID: it.ID, Title: it.Title, Status: it.Status, StartDate: fmtDate(it.StartDate), EndDate: fmtDate(it.EndDate), Progress: it.Progress, DependencyID: it.DependencyID, Notes: it.Notes, ExtTeam: it.ExtTeam, ExtDescription: it.ExtDescription, ExtMilestone: fmtDate(it.ExtMilestone), SortOrder: it.SortOrder, Color: it.Color}
	case sqlc.UpdateItemRow:
		return itemDTO{ID: it.ID, Title: it.Title, Status: it.Status, StartDate: fmtDate(it.StartDate), EndDate: fmtDate(it.EndDate), Progress: it.Progress, DependencyID: it.DependencyID, Notes: it.Notes, ExtTeam: it.ExtTeam, ExtDescription: it.ExtDescription, ExtMilestone: fmtDate(it.ExtMilestone), SortOrder: it.SortOrder, Color: it.Color}
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

func (h *Handler) listItems(w http.ResponseWriter, r *http.Request) {
	items, err := h.Q.ListItems(r.Context())
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

func (h *Handler) createItem(w http.ResponseWriter, r *http.Request) {
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
		Title: req.Title, Status: req.Status,
		StartDate: sd, EndDate: ed, Progress: req.Progress,
		DependencyID: req.DependencyID, Notes: req.Notes,
		ExtTeam: req.ExtTeam, ExtDescription: req.ExtDescription,
		ExtMilestone: em, SortOrder: req.SortOrder,
		Color: sanitizeColor(req.Color),
	})
	if err != nil {
		slog.Error("create item", "err", err)
		writeErr(w, http.StatusInternalServerError, "erro ao criar")
		return
	}
	writeJSON(w, http.StatusCreated, toDTO(it))
}

func (h *Handler) updateItem(w http.ResponseWriter, r *http.Request) {
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
		ID: id, Title: req.Title, Status: req.Status,
		StartDate: sd, EndDate: ed, Progress: req.Progress,
		DependencyID: req.DependencyID, Notes: req.Notes,
		ExtTeam: req.ExtTeam, ExtDescription: req.ExtDescription,
		ExtMilestone: em, SortOrder: req.SortOrder,
		Color: sanitizeColor(req.Color),
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

type reorderEntry struct {
	ID        int64 `json:"id"`
	SortOrder int32 `json:"sortOrder"`
}

func (h *Handler) reorderItems(w http.ResponseWriter, r *http.Request) {
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
			ID: e.ID, SortOrder: e.SortOrder,
		}); err != nil {
			slog.Error("reorder", "id", e.ID, "err", err)
			writeErr(w, http.StatusInternalServerError, "erro ao reordenar")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) deleteItem(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	if err := h.Q.DeleteItem(r.Context(), id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao remover")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}
