package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequireAdmin(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := RequireAdmin(next)

	cases := []struct {
		name string
		user *SessionUser
		want int
	}{
		{"admin passa", &SessionUser{ID: 1, Role: "admin"}, http.StatusOK},
		{"user bloqueado", &SessionUser{ID: 2, Role: "user"}, http.StatusForbidden},
		{"sem usuário bloqueado", nil, http.StatusForbidden},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
			if c.user != nil {
				req = req.WithContext(WithUser(req.Context(), c.user))
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != c.want {
				t.Fatalf("status = %d, want %d", rec.Code, c.want)
			}
		})
	}
}

func TestPasswordHashAndCheck(t *testing.T) {
	pw := "s3cr3t!"
	h, err := HashPassword(pw)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !CheckPassword(h, pw) {
		t.Fatal("expected password to match")
	}
	if CheckPassword(h, "wrong") {
		t.Fatal("expected wrong password to fail")
	}
}

func TestValidatePassword(t *testing.T) {
	cases := []struct {
		name    string
		pw      string
		wantErr bool
	}{
		{"forte válida", "Kf7!mze2Qx#p", false},
		{"curta demais", "Ab1!xyz", true},
		{"sem maiúscula", "kf7!mze2qx#p", true},
		{"sem minúscula", "KF7!MZE2QX#P", true},
		{"sem número", "Kfa!mzeQxx#p", true},
		{"sem símbolo", "Kf7mze2Qx0pa", true},
		{"12 com todas as classes", "Aa1!aaaaaaaa", false},
		{"longa demais (>72)", "Aa1!" + strings.Repeat("z", 80), true},
		{"espaço não conta como símbolo", "Aa1 aaaa aaaa", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := ValidatePassword(c.pw)
			if c.wantErr && err == nil {
				t.Fatalf("esperava erro para %q", c.pw)
			}
			if !c.wantErr && err != nil {
				t.Fatalf("erro inesperado para %q: %v", c.pw, err)
			}
		})
	}
}

func TestNewToken(t *testing.T) {
	a, err := NewToken()
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	b, err := NewToken()
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if a == b {
		t.Fatal("tokens should be unique")
	}
	if len(a) < 32 {
		t.Fatalf("token too short: %d", len(a))
	}
}
