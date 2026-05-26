package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port              string
	DatabaseURL       string
	BaseURL           string
	JWTSecret         string
	SeedAdminEmail    string
	SeedAdminPassword string
	DevMode           bool
}

func Load() (*Config, error) {
	c := &Config{
		Port:              getenv("PORT", "8080"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		BaseURL:           getenv("BASE_URL", "http://localhost:5173"),
		JWTSecret:         os.Getenv("JWT_SECRET"),
		SeedAdminEmail:    getenv("SEED_ADMIN_EMAIL", "admin@kinghost.com.br"),
		SeedAdminPassword: getenv("SEED_ADMIN_PASSWORD", "admin123"),
		DevMode:           os.Getenv("DEV_MODE") != "",
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if c.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	return c, nil
}

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
