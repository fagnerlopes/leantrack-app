package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"leantrack/backend/internal/config"
	"leantrack/backend/internal/database"
	"leantrack/backend/internal/database/seed"
	"leantrack/backend/internal/database/sqlc"
	"leantrack/backend/internal/handler"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var pool *pgxpool.Pool
	for i := 0; i < 6; i++ {
		pool, err = pgxpool.New(ctx, cfg.DatabaseURL)
		if err == nil {
			if err = pool.Ping(ctx); err == nil {
				break
			}
			pool.Close()
		}
		delay := time.Second * time.Duration(1<<i)
		slog.Warn("database not ready, retrying", "attempt", i+1, "delay", delay, "err", err)
		time.Sleep(delay)
	}
	if err != nil {
		slog.Error("failed to connect to database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := database.RunMigrations(ctx, pool); err != nil {
		slog.Error("migrations", "err", err)
		os.Exit(1)
	}

	q := sqlc.New(pool)

	adminID, err := seed.Admin(ctx, q, cfg.SeedAdminEmail, cfg.SeedAdminPassword)
	if err != nil {
		slog.Error("seed admin", "err", err)
		os.Exit(1)
	}
	slog.Info("admin seeded", "email", cfg.SeedAdminEmail, "id", adminID)

	if cfg.SeedDemo {
		// Falha na carga de demonstração não impede o app de servir: registra e
		// segue. Derrubar o servidor por causa de dado de exemplo seria pior.
		if err := seed.Demo(ctx, q, adminID); err != nil {
			slog.Error("demo seed", "err", err)
		}
	}

	h := handler.New(q, cfg)
	apiMux := h.Routes() // *http.ServeMux with /up, /api/*, /auth/*

	// Build the top-level handler: in dev mode we just use the API mux
	// (Vite serves the SPA). In prod we add a SPA static-file fallback that
	// delegates API/health paths to apiMux and serves index.html for SPA routes.
	var topHandler http.Handler = apiMux
	frontendDist := "frontend/dist"
	if !cfg.DevMode {
		if _, err := os.Stat(frontendDist); err == nil {
			fs := http.FileServer(http.Dir(frontendDist))
			topHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/auth/") || r.URL.Path == "/up" {
					apiMux.ServeHTTP(w, r)
					return
				}
				if r.URL.Path != "/" {
					if _, err := os.Stat(filepath.Join(frontendDist, filepath.Clean(r.URL.Path))); err == nil {
						// Assets têm nome com hash de conteúdo (ex.: index-OWB6SsbT.js):
						// são imutáveis e podem ser cacheados por bastante tempo.
						if strings.HasPrefix(r.URL.Path, "/assets/") {
							w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
						}
						fs.ServeHTTP(w, r)
						return
					}
				}
				// index.html NÃO pode ser cacheado: ele aponta para os assets hasheados,
				// então precisa ser sempre revalidado para que um novo deploy apareça
				// imediatamente (evita servir uma versão antiga do app após o deploy).
				w.Header().Set("Cache-Control", "no-cache")
				http.ServeFile(w, r, filepath.Join(frontendDist, "index.html"))
			})
		} else {
			slog.Warn("frontend dist not found — SPA routes will return 404", "path", frontendDist)
		}
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           topHandler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		slog.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	slog.Info("listening", "port", cfg.Port, "devMode", cfg.DevMode)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server", "err", err)
		os.Exit(1)
	}
}
