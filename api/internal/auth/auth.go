package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/victorking528/SurveyBox/api/internal/config"
	"github.com/victorking528/SurveyBox/api/internal/middleware"
)

const (
	refreshCookieName = "surveybox_refresh"
	accessCookieName  = "surveybox_access"
)

type Service struct {
	pool   *pgxpool.Pool
	cfg    config.Config
	secret []byte
}

type Claims struct {
	UserID   string `json:"uid"`
	Username string `json:"username"`
	TokenType string `json:"typ"`
	jwt.RegisteredClaims
}

func NewService(pool *pgxpool.Pool, cfg config.Config) *Service {
	return &Service{pool: pool, cfg: cfg, secret: []byte(cfg.JWTSecret)}
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("/login", middleware.RateLimit(5, 15*time.Minute, func(c *gin.Context) string {
		return "login:" + c.ClientIP()
	}), s.login)
	r.POST("/logout", s.logout)
	r.POST("/refresh", s.refresh)
	r.GET("/me", s.AuthRequired(), s.me)
}

func (s *Service) AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := extractBearer(c)
		if tokenStr == "" {
			if cookie, err := c.Cookie(accessCookieName); err == nil {
				tokenStr = cookie
			}
		}
		claims, err := s.parseToken(tokenStr, "access")
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录或会话已过期"})
			return
		}
		c.Set("userID", claims.UserID)
		c.Set("username", claims.Username)
		c.Next()
	}
}

func (s *Service) login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Remember bool   `json:"remember"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入用户名和密码"})
		return
	}

	var id, hash string
	err := s.pool.QueryRow(c, `SELECT id::text, password_hash FROM users WHERE username=$1`, req.Username).Scan(&id, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		s.audit(c, "user", req.Username, "login_fail", "")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	access, refresh, err := s.issueTokens(id, req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "登录失败"})
		return
	}

	refreshTTL := s.cfg.JWTRefreshTTL
	if !req.Remember {
		refreshTTL = 24 * time.Hour
	}
	setTokenCookies(c, access, refresh, s.cfg.JWTAccessTTL, refreshTTL)
	s.audit(c, "user", id, "login_success", "")
	c.JSON(http.StatusOK, gin.H{
		"access_token": access,
		"user": gin.H{"id": id, "username": req.Username},
	})
}

func (s *Service) logout(c *gin.Context) {
	secure := cookieSecure(c)
	c.SetCookie(refreshCookieName, "", -1, "/", "", secure, true)
	c.SetCookie(accessCookieName, "", -1, "/", "", secure, true)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Service) refresh(c *gin.Context) {
	tokenStr, err := c.Cookie(refreshCookieName)
	if err != nil || tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	claims, err := s.parseToken(tokenStr, "refresh")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "会话已过期"})
		return
	}
	var revoked bool
	_ = s.pool.QueryRow(c, `SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE jti=$1)`, claims.ID).Scan(&revoked)
	if revoked {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "会话已失效"})
		return
	}
	access, refresh, err := s.issueTokens(claims.UserID, claims.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "刷新失败"})
		return
	}
	setTokenCookies(c, access, refresh, s.cfg.JWTAccessTTL, s.cfg.JWTRefreshTTL)
	c.JSON(http.StatusOK, gin.H{"access_token": access})
}

func (s *Service) me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"id":       c.GetString("userID"),
		"username": c.GetString("username"),
	})
}

func (s *Service) issueTokens(userID, username string) (string, string, error) {
	now := time.Now()
	jti := uuid.NewString()
	accessClaims := Claims{
		UserID: userID, Username: username, TokenType: "access",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTAccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
	}
	refreshClaims := Claims{
		UserID: userID, Username: username, TokenType: "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTRefreshTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        jti,
		},
	}
	access, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString(s.secret)
	if err != nil {
		return "", "", err
	}
	refresh, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).SignedString(s.secret)
	return access, refresh, err
}

func (s *Service) parseToken(tokenStr, typ string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid || claims.TokenType != typ {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func (s *Service) audit(c *gin.Context, actorType, actorID, action, resource string) {
	_, _ = s.pool.Exec(context.Background(), `
		INSERT INTO audit_logs (actor_type, actor_id, action, resource, ip, user_agent)
		VALUES ($1, $2, $3, $4, $5::inet, $6)
	`, actorType, actorID, action, resource, c.ClientIP(), c.Request.UserAgent())
}

func extractBearer(c *gin.Context) string {
	h := c.GetHeader("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

func setTokenCookies(c *gin.Context, access, refresh string, accessTTL, refreshTTL time.Duration) {
	secure := cookieSecure(c)
	c.SetCookie(accessCookieName, access, int(accessTTL.Seconds()), "/", "", secure, true)
	c.SetCookie(refreshCookieName, refresh, int(refreshTTL.Seconds()), "/", "", secure, true)
}

func cookieSecure(c *gin.Context) bool {
	if c.Request.TLS != nil {
		return true
	}
	return strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
}

func UserID(c *gin.Context) string {
	return c.GetString("userID")
}
