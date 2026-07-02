package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	DatabaseURL        string
	JWTSecret          string
	JWTAccessTTL       time.Duration
	JWTRefreshTTL      time.Duration
	FileEncryptionKey  string
	LLMBaseURL         string
	LLMAPIKey          string
	LLMModel           string
	LLMTimeout         time.Duration
	StorageBackend     string
	StorageLocalPath   string
	OrgName            string
	OrgLogoURL         string
	BrandPrimary       string
	APIAddr            string
	WebOrigin          string
	AdminUsername      string
	AdminPassword      string
}

func Load() Config {
	return Config{
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://surveybox:surveybox@localhost:5432/surveybox?sslmode=disable"),
		JWTSecret:         getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		JWTAccessTTL:      getDuration("JWT_ACCESS_TTL", 15*time.Minute),
		JWTRefreshTTL:     getDuration("JWT_REFRESH_TTL", 168*time.Hour),
		FileEncryptionKey: os.Getenv("FILE_ENCRYPTION_KEY"),
		LLMBaseURL:        getEnv("LLM_BASE_URL", "https://api.openai.com/v1"),
		LLMAPIKey:         os.Getenv("LLM_API_KEY"),
		LLMModel:          getEnv("LLM_MODEL", "gpt-4o-mini"),
		LLMTimeout:        getDuration("LLM_TIMEOUT", 120*time.Second),
		StorageBackend:    getEnv("STORAGE_BACKEND", "local"),
		StorageLocalPath:  getEnv("STORAGE_LOCAL_PATH", "./data/files"),
		OrgName:           getEnv("ORG_NAME", "SurveyBox"),
		OrgLogoURL:        os.Getenv("ORG_LOGO_URL"),
		BrandPrimary:      getEnv("BRAND_PRIMARY", "#1677FF"),
		APIAddr:           getEnv("API_ADDR", ":8080"),
		WebOrigin:         getEnv("WEB_ORIGIN", "http://localhost:5173"),
		AdminUsername:     getEnv("ADMIN_USERNAME", "admin"),
		AdminPassword:     getEnv("ADMIN_PASSWORD", "admin123"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

func getInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
