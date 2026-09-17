package database

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// migrationsTestDB é o banco descartável usado aqui. As migrações precisam ser
// exercitadas do zero, e fazê-lo no banco compartilhado quebraria os testes de
// integração de outros pacotes: `go test ./...` roda pacotes em paralelo.
const migrationsTestDB = "leantrack_migrations_test"

// TestMigrationsCreateNoData garante que as migrações criem apenas esquema.
// Dado de demonstração é responsabilidade do pacote seed; dado de pessoa real
// não pode existir em migração alguma, porque este repositório é clonado por
// terceiros.
func TestMigrationsCreateNoData(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL não definido")
	}
	ctx := context.Background()

	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("conectar: %v", err)
	}
	defer admin.Close()

	// CREATE DATABASE não roda dentro de transação, por isso vai pelo pool.
	if _, err := admin.Exec(ctx, `DROP DATABASE IF EXISTS `+migrationsTestDB); err != nil {
		t.Fatalf("remover banco de teste: %v", err)
	}
	if _, err := admin.Exec(ctx, `CREATE DATABASE `+migrationsTestDB); err != nil {
		t.Fatalf("criar banco de teste: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), `DROP DATABASE IF EXISTS `+migrationsTestDB)
	})

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatalf("interpretar DATABASE_URL: %v", err)
	}
	cfg.ConnConfig.Database = migrationsTestDB
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("conectar ao banco de teste: %v", err)
	}
	defer pool.Close()

	if err := RunMigrations(ctx, pool); err != nil {
		t.Fatalf("migrações: %v", err)
	}

	for _, table := range []string{"users", "roadmaps", "roadmap_items", "roadmap_collaborators"} {
		var n int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM `+table).Scan(&n); err != nil {
			t.Fatalf("contar %s: %v", table, err)
		}
		if n != 0 {
			t.Errorf("%s tem %d linhas após as migrações; esperado 0", table, n)
		}
	}
}
