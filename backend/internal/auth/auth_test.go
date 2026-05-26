package auth

import "testing"

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
