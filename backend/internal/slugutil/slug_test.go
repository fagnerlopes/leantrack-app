package slugutil

import "testing"

func TestSlugify(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Roadmap VPS 2026", "roadmap-vps-2026"},
		{"Roadmap Plataforma 2026", "roadmap-plataforma-2026"},
		{"  Áreas  Críticas / Infra  ", "areas-criticas-infra"},
		{"Múltiplos   espaços", "multiplos-espacos"},
		{"JÁ-com-hífen", "ja-com-hifen"},
		{"", ""},
		{"!!!", ""},
	}
	for _, c := range cases {
		if got := Slugify(c.in); got != c.want {
			t.Fatalf("Slugify(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
