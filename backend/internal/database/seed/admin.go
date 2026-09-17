// Package seed popula o banco com as contas e os dados necessários para a
// aplicação ser utilizável logo após o primeiro boot: a conta de administrador
// inicial (sempre) e um conjunto de demonstração (quando SEED_DEMO está ligado).
package seed

import (
	"context"
	"fmt"

	"leantrack/backend/internal/auth"
	"leantrack/backend/internal/database/sqlc"
)

// Admin garante a conta de administrador inicial e devolve o id dela.
//
// A senha é gravada apenas na criação da conta, e a conta nasce marcada para
// troca obrigatória de senha no primeiro acesso. Em boots seguintes, apenas
// nome e papel são sincronizados: qualquer senha definida pelo usuário é
// preservada.
func Admin(ctx context.Context, q *sqlc.Queries, email, password string) (int64, error) {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return 0, fmt.Errorf("gerar hash da senha de seed: %w", err)
	}
	id, err := q.EnsureSeedUser(ctx, sqlc.EnsureSeedUserParams{
		Email:        email,
		PasswordHash: &hash,
		Name:         "Administrador",
		Role:         "admin",
	})
	if err != nil {
		return 0, fmt.Errorf("garantir conta de admin: %w", err)
	}
	return id, nil
}
