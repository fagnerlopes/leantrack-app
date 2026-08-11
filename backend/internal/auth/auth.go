package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"time"
	"unicode"

	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database/sqlc"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"
)

// ErrNoSession indica que a requisição não traz uma sessão válida.
var ErrNoSession = errors.New("no session")

const (
	CookieName     = "session"
	SessionTTL     = 7 * 24 * time.Hour
)

type ctxKey int

const userKey ctxKey = 1

type SessionUser struct {
	ID                 int64  `json:"id"`
	Email              string `json:"email"`
	Name               string `json:"name"`
	Role               string `json:"role"`
	MustChangePassword bool   `json:"mustChangePassword"`
}

func HashPassword(p string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(p), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, p string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(p)) == nil
}

// PasswordMinLen é o tamanho mínimo exigido pela política de senha da aplicação.
const PasswordMinLen = 12

// PasswordPolicyMsg descreve, em uma frase, a regra de senha. Usado tanto nas
// mensagens de erro do backend quanto como referência para o frontend.
const PasswordPolicyMsg = "a senha deve ter ao menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo"

// ValidatePassword aplica a política única de senha da aplicação: mínimo de 12
// caracteres contendo maiúscula, minúscula, número e símbolo. bcrypt trunca em
// 72 bytes, então recusamos senhas acima desse limite para evitar surpresas.
func ValidatePassword(pw string) error {
	if len(pw) > 72 {
		return errors.New("a senha é longa demais (máx. 72 caracteres)")
	}
	if len([]rune(pw)) < PasswordMinLen {
		return errors.New(PasswordPolicyMsg)
	}
	var hasUpper, hasLower, hasDigit, hasSymbol bool
	for _, r := range pw {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		case unicode.IsSpace(r):
			// Espaços não contam como símbolo válido.
		default:
			hasSymbol = true
		}
	}
	if !hasUpper || !hasLower || !hasDigit || !hasSymbol {
		return errors.New(PasswordPolicyMsg)
	}
	return nil
}

func NewToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func CreateSession(ctx context.Context, q *sqlc.Queries, userID int64) (string, time.Time, error) {
	tok, err := NewToken()
	if err != nil {
		return "", time.Time{}, err
	}
	exp := time.Now().Add(SessionTTL)
	err = q.CreateSession(ctx, sqlc.CreateSessionParams{
		Token:     tok,
		UserID:    userID,
		ExpiresAt: pgtype.Timestamptz{Time: exp, Valid: true},
	})
	return tok, exp, err
}

func SetCookie(w http.ResponseWriter, token string, exp time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		Expires:  exp,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func WithUser(ctx context.Context, u *SessionUser) context.Context {
	return context.WithValue(ctx, userKey, u)
}

func FromContext(ctx context.Context) *SessionUser {
	if v, ok := ctx.Value(userKey).(*SessionUser); ok {
		return v
	}
	return nil
}

// Authenticator resolve o usuário logado a partir da requisição. Hoje a
// implementação lê o cookie de sessão local; amanhã, um KeycloakAuthenticator
// poderá validar um token OIDC sem que o restante do sistema mude (ver ADR 008).
type Authenticator interface {
	UserFromRequest(r *http.Request) (*SessionUser, error)
}

// LocalAuthenticator resolve a sessão pela tabela `sessions` (cookie HttpOnly).
type LocalAuthenticator struct {
	Q *sqlc.Queries
}

func NewLocalAuthenticator(q *sqlc.Queries) LocalAuthenticator {
	return LocalAuthenticator{Q: q}
}

func (a LocalAuthenticator) UserFromRequest(r *http.Request) (*SessionUser, error) {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return nil, ErrNoSession
	}
	row, err := a.Q.GetSession(r.Context(), c.Value)
	if err != nil {
		return nil, ErrNoSession
	}
	return &SessionUser{ID: row.UserID, Email: row.Email, Name: row.Name, Role: row.Role, MustChangePassword: row.MustChangePassword}, nil
}

// NewMiddleware injeta o usuário resolvido pelo Authenticator no contexto.
// Se `require` é true, responde 401 quando não há sessão válida.
func NewMiddleware(a Authenticator, require bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if u, err := a.UserFromRequest(r); err == nil && u != nil {
				ctx := WithUser(r.Context(), u)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			if require {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Middleware mantém a assinatura legada usando o autenticador local.
func Middleware(q *sqlc.Queries, require bool) func(http.Handler) http.Handler {
	return NewMiddleware(NewLocalAuthenticator(q), require)
}

// RequireAdmin wraps a handler to enforce role == "admin".
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := FromContext(r.Context())
		if u == nil || u.Role != "admin" {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireRoadmapOwner exige que o usuário logado seja o dono do roadmap
// identificado pelo path value {id}. Leitura não passa por aqui; apenas
// mutações (editar/apagar/reordenar). Responde 403 a não-donos, 404 se o
// roadmap não existe, 400 se o id é inválido.
func RequireRoadmapOwner(q *sqlc.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u := FromContext(r.Context())
			if u == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
			if err != nil {
				http.Error(w, `{"error":"id inválido"}`, http.StatusBadRequest)
				return
			}
			rm, err := q.GetRoadmapByID(r.Context(), id)
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, `{"error":"roadmap não encontrado"}`, http.StatusNotFound)
				return
			}
			if err != nil {
				http.Error(w, `{"error":"erro ao carregar roadmap"}`, http.StatusInternalServerError)
				return
			}
			if rm.OwnerID != u.ID {
				http.Error(w, `{"error":"apenas o dono pode editar este roadmap"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// roadmapAccess carrega o roadmap pelo path {id} e a relação de colaboração do
// usuário logado, então delega a decisão a allow(). Centraliza a resolução de
// id → roadmap → colaborador usada pelos middlewares de edição e de
// compartilhamento. 401 sem sessão, 400 id inválido, 404 inexistente,
// 403 quando allow() recusa.
func roadmapAccess(
	q *sqlc.Queries,
	allow func(u *SessionUser, ownerID int64, canEdit, canShare bool) bool,
	forbidMsg string,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u := FromContext(r.Context())
			if u == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
			if err != nil {
				http.Error(w, `{"error":"id inválido"}`, http.StatusBadRequest)
				return
			}
			rm, err := q.GetRoadmapByID(r.Context(), id)
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, `{"error":"roadmap não encontrado"}`, http.StatusNotFound)
				return
			}
			if err != nil {
				http.Error(w, `{"error":"erro ao carregar roadmap"}`, http.StatusInternalServerError)
				return
			}
			var canEdit, canShare bool
			if rm.OwnerID != u.ID {
				c, err := q.GetCollaborator(r.Context(), sqlc.GetCollaboratorParams{RoadmapID: id, UserID: u.ID})
				if err == nil {
					canEdit, canShare = c.CanEdit, c.CanShare
				} else if !errors.Is(err, pgx.ErrNoRows) {
					http.Error(w, `{"error":"erro ao carregar permissões"}`, http.StatusInternalServerError)
					return
				}
			}
			if !allow(u, rm.OwnerID, canEdit, canShare) {
				http.Error(w, `{"error":"`+forbidMsg+`"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireRoadmapEditor libera mutação de conteúdo (itens) e renomear: dono OU
// colaborador com can_edit.
func RequireRoadmapEditor(q *sqlc.Queries) func(http.Handler) http.Handler {
	return roadmapAccess(q, func(u *SessionUser, ownerID int64, canEdit, canShare bool) bool {
		return ownerID == u.ID || canEdit
	}, "apenas o dono ou um colaborador com permissão de edição pode alterar este roadmap")
}

// RequireRoadmapSharer libera a gestão de colaboradores: dono, colaborador com
// can_share OU admin. O admin entra aqui para destravar roadmaps cujo dono saiu
// da empresa (ver ADR 016); note que isso não lhe dá poder de editar conteúdo
// (RequireRoadmapEditor) nem de excluir o roadmap (RequireRoadmapOwner).
func RequireRoadmapSharer(q *sqlc.Queries) func(http.Handler) http.Handler {
	return roadmapAccess(q, func(u *SessionUser, ownerID int64, canEdit, canShare bool) bool {
		return ownerID == u.ID || canShare || u.Role == "admin"
	}, "apenas o dono, um colaborador com permissão de compartilhar ou um admin pode gerenciar o acesso")
}
