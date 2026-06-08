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

	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/auth"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/config"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/database/sqlc"
	"github.com/fagnerlopes/roadmap-tribo-cloud/backend/internal/handler"
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

	// Seed admin user
	hash, err := auth.HashPassword(cfg.SeedAdminPassword)
	if err != nil {
		slog.Error("hash seed", "err", err)
		os.Exit(1)
	}
	if err := q.UpsertSeedUser(ctx, sqlc.UpsertSeedUserParams{
		Email:        cfg.SeedAdminEmail,
		PasswordHash: &hash,
		Name:         "Administrador",
		Role:         "admin",
	}); err != nil {
		slog.Error("seed admin", "err", err)
		os.Exit(1)
	}
	slog.Info("admin seeded", "email", cfg.SeedAdminEmail)

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
						fs.ServeHTTP(w, r)
						return
					}
				}
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
