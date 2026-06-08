// Package slugutil gera slugs URL-friendly a partir de textos livres.
package slugutil

import (
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// Slugify converte um texto em um slug: minúsculo, sem acentos, apenas
// [a-z0-9], com palavras separadas por hífen. Retorna "" se não sobrar nada.
func Slugify(s string) string {
	// Remove acentos: decompõe e descarta marcas de combinação (Mn).
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	noAccent, _, err := transform.String(t, s)
	if err != nil {
		noAccent = s
	}
	noAccent = strings.ToLower(noAccent)

	var b strings.Builder
	prevHyphen := false
	for _, r := range noAccent {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevHyphen = false
		default:
			if !prevHyphen && b.Len() > 0 {
				b.WriteRune('-')
				prevHyphen = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}
