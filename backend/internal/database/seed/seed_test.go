package seed

import (
	"context"
	"os"
	"testing"

	"leantrack/backend/internal/database"
	"leantrack/backend/internal/database/sqlc"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testPool é compartilhado pelos testes do pacote. Fica nil quando
// DATABASE_URL não está definido — nesse caso os testes são pulados.
var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		os.Exit(m.Run())
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		panic(err)
	}
	if err := database.RunMigrations(ctx, pool); err != nil {
		panic(err)
	}
	testPool = pool
	code := m.Run()
	pool.Close()
	os.Exit(code)
}

// newTestQueries devolve Queries operando numa transação revertida ao fim do
// teste, isolando totalmente os dados — mesmo padrão dos testes de handler.
//
// Diferente daqueles, estes testes afirmam sobre CONTAGENS GLOBAIS (quantos
// roadmaps existem, quantas iniciativas) e sobre a criação de contas com e-mail
// fixo. Um banco de desenvolvimento que já tenha sido semeado faria o semeador
// pular a carga e as asserções passariam por coincidência, escondendo uma
// regressão. Por isso a transação começa esvaziando as tabelas: o estado inicial
// passa a ser sempre vazio, e o rollback devolve o banco intacto ao fim.
func newTestQueries(t *testing.T) *sqlc.Queries {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL não definido; pulando teste com banco")
	}
	ctx := context.Background()
	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })

	// Ordem obedece às chaves estrangeiras. DELETE, e não TRUNCATE: truncar
	// pediria ACCESS EXCLUSIVE e travaria os pacotes que rodam em paralelo.
	for _, table := range []string{
		"roadmap_collaborators", "roadmap_items", "roadmaps", "sessions", "users",
	} {
		if _, err := tx.Exec(ctx, "DELETE FROM "+table); err != nil {
			t.Fatalf("limpar %s: %v", table, err)
		}
	}
	return sqlc.New(tx)
}

func TestAdminCreatesAccountAndForcesPasswordChange(t *testing.T) {
	q := newTestQueries(t)
	ctx := context.Background()

	id, err := Admin(ctx, q, "admin@example.com", "senha-inicial")
	if err != nil {
		t.Fatalf("Admin: %v", err)
	}
	if id == 0 {
		t.Fatal("Admin devolveu id zero")
	}

	u, err := q.GetUserByEmail(ctx, "admin@example.com")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if u.Role != "admin" {
		t.Errorf("role = %q; esperado \"admin\"", u.Role)
	}
	if !u.MustChangePassword {
		t.Error("must_change_password = false; a conta inicial deve exigir troca no primeiro acesso")
	}
}

func TestAdminDoesNotOverwriteExistingPassword(t *testing.T) {
	q := newTestQueries(t)
	ctx := context.Background()

	if _, err := Admin(ctx, q, "admin@example.com", "senha-inicial"); err != nil {
		t.Fatalf("primeira chamada: %v", err)
	}

	// Simula o participante definindo a senha definitiva no primeiro acesso.
	before, err := q.GetUserByEmail(ctx, "admin@example.com")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if err := q.UpdateOwnPassword(ctx, sqlc.UpdateOwnPasswordParams{
		ID:           before.ID,
		PasswordHash: strPtr("hash-escolhido-pelo-usuario"),
	}); err != nil {
		t.Fatalf("UpdateOwnPassword: %v", err)
	}

	// Segundo boot da aplicação, com a mesma senha de seed no ambiente.
	if _, err := Admin(ctx, q, "admin@example.com", "senha-inicial"); err != nil {
		t.Fatalf("segunda chamada: %v", err)
	}

	after, err := q.GetUserByEmail(ctx, "admin@example.com")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if after.PasswordHash == nil || *after.PasswordHash != "hash-escolhido-pelo-usuario" {
		t.Error("o seed sobrescreveu a senha definida pelo usuário")
	}
	if after.MustChangePassword {
		t.Error("o seed remarcou must_change_password numa conta existente")
	}
}

func strPtr(s string) *string { return &s }
