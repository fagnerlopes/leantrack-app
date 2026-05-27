package handler

import (
	"errors"
	"testing"
)

func TestItemReqValidate(t *testing.T) {
	cases := []struct {
		name    string
		req     itemReq
		wantErr bool
	}{
		{"valid", itemReq{Title: "X", Status: "em-andamento", Progress: 50}, false},
		{"empty title", itemReq{Title: "  ", Status: "em-andamento"}, true},
		{"bad status", itemReq{Title: "X", Status: "weird"}, true},
		{"progress over 100", itemReq{Title: "X", Status: "concluido", Progress: 150}, true},
		{"progress negative", itemReq{Title: "X", Status: "concluido", Progress: -5}, true},
		{"valid concluido", itemReq{Title: "X", Status: "concluido", Progress: 100}, false},
		{"valid pausado", itemReq{Title: "X", Status: "pausado"}, false},
		{"valid nao-iniciado", itemReq{Title: "X", Status: "nao-iniciado"}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.req.validate()
			if c.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !c.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if c.wantErr && err != nil && errors.Is(err, nil) {
				t.Fatalf("nil compare")
			}
		})
	}
}

func TestParseDate(t *testing.T) {
	d, err := parseDate("")
	if err != nil || d.Valid {
		t.Fatalf("empty should produce invalid date with no error, got valid=%v err=%v", d.Valid, err)
	}
	d, err = parseDate("2026-05-25")
	if err != nil || !d.Valid {
		t.Fatalf("expected valid, got valid=%v err=%v", d.Valid, err)
	}
	_, err = parseDate("not-a-date")
	if err == nil {
		t.Fatalf("expected error on bad date")
	}
}

func TestSanitizeColor(t *testing.T) {
	str := func(s string) *string { return &s }
	cases := []struct {
		name string
		in   *string
		want *string
	}{
		{"nil", nil, nil},
		{"empty", str(""), nil},
		{"whitespace", str("  "), nil},
		{"valid lower", str("#aabbcc"), str("#aabbcc")},
		{"valid mixed", str("#A1B2C3"), str("#A1B2C3")},
		{"no hash", str("aabbcc"), nil},
		{"short", str("#abc"), nil},
		{"too long", str("#aabbccdd"), nil},
		{"non-hex", str("#zzzzzz"), nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := sanitizeColor(c.in)
			if (got == nil) != (c.want == nil) {
				t.Fatalf("nilness mismatch: got=%v want=%v", got, c.want)
			}
			if got != nil && *got != *c.want {
				t.Fatalf("got %q want %q", *got, *c.want)
			}
		})
	}
}
