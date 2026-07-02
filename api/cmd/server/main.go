package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/victorking528/SurveyBox/api/internal/auth"
	"github.com/victorking528/SurveyBox/api/internal/config"
	"github.com/victorking528/SurveyBox/api/internal/contact"
	"github.com/victorking528/SurveyBox/api/internal/dashboard"
	"github.com/victorking528/SurveyBox/api/internal/database"
	"github.com/victorking528/SurveyBox/api/internal/middleware"
	publicapi "github.com/victorking528/SurveyBox/api/internal/publicapi"
	"github.com/victorking528/SurveyBox/api/internal/share"
	"github.com/victorking528/SurveyBox/api/internal/survey"
	"github.com/victorking528/SurveyBox/api/pkg/crypto"
	"github.com/victorking528/SurveyBox/api/pkg/llm"
	"github.com/victorking528/SurveyBox/api/pkg/storage"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	if err := database.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	if err := database.SeedAdmin(ctx, pool, cfg.AdminUsername, cfg.AdminPassword); err != nil {
		log.Fatalf("seed admin: %v", err)
	}

	encKey, err := crypto.KeyFromEnv(cfg.FileEncryptionKey, cfg.JWTSecret)
	if err != nil {
		log.Fatalf("encryption key: %v", err)
	}
	localStorage, err := storage.NewLocalProvider(cfg.StorageLocalPath, encKey)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery(), middleware.SecurityHeaders(), middleware.CORS(cfg.WebOrigin))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.GET("/api/config/public", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"org_name":      cfg.OrgName,
			"org_logo_url":  cfg.OrgLogoURL,
			"brand_primary": cfg.BrandPrimary,
		})
	})

	authSvc := auth.NewService(pool, cfg)
	surveySvc := survey.NewService(pool, cfg, localStorage)
	contactSvc := contact.NewService(pool)
	dashboardSvc := dashboard.NewService(pool)
	shareSvc := share.NewService(pool, cfg.WebOrigin)
	publicSvc := publicapi.NewService(pool, localStorage, cfg.WebOrigin)
	llmClient := llm.NewClient(cfg.LLMBaseURL, cfg.LLMAPIKey, cfg.LLMModel, cfg.LLMTimeout)

	api := r.Group("/api")
	authSvc.RegisterRoutes(api.Group("/auth"))
	surveySvc.RegisterRoutes(api.Group("/surveys"), authSvc)
	shareSvc.RegisterRoutes(api.Group("/surveys"), authSvc)
	contactSvc.RegisterRoutes(api.Group("/contacts"), authSvc)
	dashboardSvc.RegisterRoutes(api.Group("/dashboard"), authSvc)
	publicSvc.RegisterRoutes(api.Group("/public"))

	api.POST("/admin/llm/ping", authSvc.AuthRequired(), func(c *gin.Context) {
		if err := llm.Ping(c, llmClient); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	srv := &http.Server{Addr: cfg.APIAddr, Handler: r}
	go func() {
		log.Printf("SurveyBox API listening on %s", cfg.APIAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
