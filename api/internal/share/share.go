package share

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/victorking528/SurveyBox/api/internal/auth"
)

type Service struct {
	pool      *pgxpool.Pool
	webOrigin string
}

type ShareItem struct {
	ID          string     `json:"id"`
	ContactID   string     `json:"contact_id"`
	ContactName string     `json:"contact_name"`
	ContactEmail string    `json:"contact_email"`
	Company     string     `json:"company"`
	Token       string     `json:"token"`
	Status      string     `json:"status"`
	FillURL     string     `json:"fill_url"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	SubmittedAt *time.Time `json:"submitted_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

func NewService(pool *pgxpool.Pool, webOrigin string) *Service {
	return &Service{pool: pool, webOrigin: webOrigin}
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup, authSvc *auth.Service) {
	g := r.Group("/:id/shares")
	g.Use(authSvc.AuthRequired())
	g.GET("", s.list)
	g.POST("", s.batchCreate)
}

func (s *Service) list(c *gin.Context) {
	surveyID := c.Param("id")
	userID := auth.UserID(c)
	if !s.ownsSurvey(c, surveyID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "问卷不存在"})
		return
	}
	rows, err := s.pool.Query(c, `
		SELECT sh.id::text, sh.contact_id::text, ct.name, ct.email, ct.company,
		       sh.token, sh.status::text, sh.expires_at, sh.submitted_at, sh.created_at
		FROM shares sh
		JOIN contacts ct ON ct.id = sh.contact_id
		WHERE sh.survey_id = $1
		ORDER BY sh.created_at DESC
	`, surveyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	defer rows.Close()
	var items []ShareItem
	for rows.Next() {
		var it ShareItem
		if err := rows.Scan(&it.ID, &it.ContactID, &it.ContactName, &it.ContactEmail, &it.Company,
			&it.Token, &it.Status, &it.ExpiresAt, &it.SubmittedAt, &it.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
			return
		}
		it.FillURL = fmt.Sprintf("%s/f/%s", s.webOrigin, it.Token)
		items = append(items, it)
	}
	if items == nil {
		items = []ShareItem{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Service) batchCreate(c *gin.Context) {
	surveyID := c.Param("id")
	userID := auth.UserID(c)
	if !s.ownsSurvey(c, surveyID, userID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "问卷不存在"})
		return
	}
	var status string
	if err := s.pool.QueryRow(c, `SELECT status::text FROM surveys WHERE id=$1`, surveyID).Scan(&status); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "问卷不存在"})
		return
	}
	if status != "published" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先发布问卷"})
		return
	}

	var req struct {
		ContactIDs []string   `json:"contact_ids" binding:"required,min=1"`
		ExpiresAt  *time.Time `json:"expires_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择联系人"})
		return
	}

	var created []ShareItem
	for _, cid := range req.ContactIDs {
		token, err := secureToken()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "生成链接失败"})
			return
		}
		var it ShareItem
		err = s.pool.QueryRow(c, `
			INSERT INTO shares (survey_id, contact_id, token, expires_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (survey_id, contact_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, status = 'pending'
			RETURNING id::text, contact_id::text, token, status::text, expires_at, submitted_at, created_at
		`, surveyID, cid, token, req.ExpiresAt).Scan(
			&it.ID, &it.ContactID, &it.Token, &it.Status, &it.ExpiresAt, &it.SubmittedAt, &it.CreatedAt,
		)
		if err != nil {
			continue
		}
		_ = s.pool.QueryRow(c, `SELECT name, email, company FROM contacts WHERE id=$1`, cid).
			Scan(&it.ContactName, &it.ContactEmail, &it.Company)
		it.FillURL = fmt.Sprintf("%s/f/%s", s.webOrigin, it.Token)
		created = append(created, it)
	}
	c.JSON(http.StatusCreated, gin.H{"items": created})
}

func (s *Service) ownsSurvey(c *gin.Context, surveyID, userID string) bool {
	var ok bool
	_ = s.pool.QueryRow(c, `SELECT EXISTS(SELECT 1 FROM surveys WHERE id=$1 AND created_by=$2)`, surveyID, userID).Scan(&ok)
	return ok
}

func secureToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func ResolveByToken(ctx *gin.Context, pool *pgxpool.Pool, token string) (shareID, surveyID string, err error) {
	err = pool.QueryRow(ctx, `
		SELECT sh.id::text, sh.survey_id::text
		FROM shares sh
		WHERE sh.token = $1
		  AND (sh.expires_at IS NULL OR sh.expires_at > NOW())
		  AND sh.status != 'expired'
	`, token).Scan(&shareID, &surveyID)
	return
}
