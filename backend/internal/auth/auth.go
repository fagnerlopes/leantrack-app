package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"time"

	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database/sqlc"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"
)

const (
	CookieName     = "session"
	SessionTTL     = 7 * 24 * time.Hour
)

type ctxKey int

const userKey ctxKey = 1

type SessionUser struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

func HashPassword(p string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(p), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, p string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(p)) == nil
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

// Middleware: loads session from cookie and injects user in context.
// If `require` is true, returns 401 when no valid session.
func Middleware(q *sqlc.Queries, require bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(CookieName)
			if err == nil && c.Value != "" {
				row, err := q.GetSession(r.Context(), c.Value)
				if err == nil {
					u := &SessionUser{ID: row.UserID, Email: row.Email, Name: row.Name, Role: row.Role}
					ctx := WithUser(r.Context(), u)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
			if require {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
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
