package contact

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/victorking528/SurveyBox/api/internal/auth"
)

type Service struct {
	pool *pgxpool.Pool
}

type Contact struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Company   string    `json:"company"`
	CreatedAt time.Time `json:"created_at"`
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup, authSvc *auth.Service) {
	g := r.Group("")
	g.Use(authSvc.AuthRequired())
	g.GET("", s.list)
	g.POST("", s.create)
	g.PUT("/:id", s.update)
	g.DELETE("/:id", s.delete)
}

func (s *Service) list(c *gin.Context) {
	q := c.Query("q")
	rows, err := s.pool.Query(c, `
		SELECT id::text, name, email, company, created_at
		FROM contacts
		WHERE $1 = '' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%' OR company ILIKE '%' || $1 || '%'
		ORDER BY created_at DESC
	`, q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	defer rows.Close()
	var items []Contact
	for rows.Next() {
		var ct Contact
		if err := rows.Scan(&ct.ID, &ct.Name, &ct.Email, &ct.Company, &ct.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
			return
		}
		items = append(items, ct)
	}
	if items == nil {
		items = []Contact{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Service) create(c *gin.Context) {
	var req struct {
		Name    string `json:"name" binding:"required"`
		Email   string `json:"email" binding:"required,email"`
		Company string `json:"company"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写名称和邮箱"})
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	var id string
	err := s.pool.QueryRow(c, `
		INSERT INTO contacts (name, email, company) VALUES ($1, $2, $3)
		RETURNING id::text
	`, req.Name, req.Email, req.Company).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱已存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (s *Service) update(c *gin.Context) {
	var req struct {
		Name    string `json:"name" binding:"required"`
		Email   string `json:"email" binding:"required,email"`
		Company string `json:"company"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	tag, err := s.pool.Exec(c, `
		UPDATE contacts SET name=$1, email=$2, company=$3, updated_at=NOW() WHERE id=$4
	`, req.Name, req.Email, req.Company, c.Param("id"))
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱已存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "联系人不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Service) delete(c *gin.Context) {
	tag, err := s.pool.Exec(c, `DELETE FROM contacts WHERE id=$1`, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "联系人不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func GetByID(ctx *gin.Context, pool *pgxpool.Pool, id string) (*Contact, error) {
	var ct Contact
	err := pool.QueryRow(ctx, `SELECT id::text, name, email, company, created_at FROM contacts WHERE id=$1`, id).
		Scan(&ct.ID, &ct.Name, &ct.Email, &ct.Company, &ct.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &ct, err
}
