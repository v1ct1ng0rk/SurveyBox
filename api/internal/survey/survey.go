package survey

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/victorking528/SurveyBox/api/internal/auth"
	"github.com/victorking528/SurveyBox/api/internal/config"
	"github.com/victorking528/SurveyBox/api/internal/middleware"
	"github.com/victorking528/SurveyBox/api/pkg/htmlutil"
	llmpkg "github.com/victorking528/SurveyBox/api/pkg/llm"
	"github.com/victorking528/SurveyBox/api/pkg/storage"
)

type Service struct {
	pool    *pgxpool.Pool
	llm     *llmpkg.Client
	storage *storage.LocalProvider
}

type Survey struct {
	ID                 string          `json:"id"`
	Title              string          `json:"title"`
	Description        string          `json:"description"`
	Status             string          `json:"status"`
	AllowMultipleSubmit bool           `json:"allow_multiple_submit"`
	DisplayLocale      string          `json:"display_locale"`
	SuccessMessage     string          `json:"success_message"`
	ExpiresAt          *time.Time      `json:"expires_at,omitempty"`
	CurrentVersionID   *string         `json:"current_version_id,omitempty"`
	Schema             json.RawMessage `json:"schema,omitempty"`
	HTMLTemplate       string          `json:"html_template,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

func NewService(pool *pgxpool.Pool, cfg config.Config, sp *storage.LocalProvider) *Service {
	return &Service{
		pool:    pool,
		llm:     llmpkg.NewClient(cfg.LLMBaseURL, cfg.LLMAPIKey, cfg.LLMModel, cfg.LLMTimeout),
		storage: sp,
	}
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup, authSvc *auth.Service) {
	g := r.Group("")
	g.Use(authSvc.AuthRequired())
	g.GET("", s.list)
	g.POST("", s.create)
	g.GET("/:id", s.get)
	g.PUT("/:id", s.update)
	g.POST("/:id/publish", s.publish)
	g.POST("/:id/close", s.close)
	g.POST("/:id/generate", middleware.RateLimit(10, time.Hour, func(c *gin.Context) string {
		return "llm:" + auth.UserID(c)
	}), s.generate)
	g.GET("/:id/preview", s.preview)
	g.GET("/:id/responses/export", s.exportResponses)
	g.GET("/:id/responses", s.listResponses)
	g.DELETE("/:id", s.delete)
}

func (s *Service) list(c *gin.Context) {
	status := c.Query("status")
	q := c.Query("q")
	userID := auth.UserID(c)

	rows, err := s.pool.Query(c, `
		SELECT s.id::text, s.title, s.description, s.status::text, s.allow_multiple_submit,
		       s.success_message, s.created_at, s.updated_at,
		       COALESCE((SELECT COUNT(*) FROM shares sh WHERE sh.survey_id = s.id), 0),
		       COALESCE((SELECT COUNT(*) FROM responses r JOIN shares sh ON sh.id = r.share_id WHERE sh.survey_id = s.id), 0)
		FROM surveys s
		WHERE s.created_by = $1
		  AND ($2 = '' OR s.status::text = $2)
		  AND ($3 = '' OR s.title ILIKE '%' || $3 || '%')
		ORDER BY s.updated_at DESC
	`, userID, status, q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	defer rows.Close()

	type item struct {
		ID          string    `json:"id"`
		Title       string    `json:"title"`
		Description string    `json:"description"`
		Status      string    `json:"status"`
		ShareCount  int       `json:"share_count"`
		ResponseCount int     `json:"response_count"`
		CreatedAt   time.Time `json:"created_at"`
		UpdatedAt   time.Time `json:"updated_at"`
	}
	var items []item
	for rows.Next() {
		var it item
		var desc, success string
		var allow bool
		if err := rows.Scan(&it.ID, &it.Title, &desc, &it.Status, &allow, &success, &it.CreatedAt, &it.UpdatedAt, &it.ShareCount, &it.ResponseCount); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
			return
		}
		it.Description = desc
		items = append(items, it)
	}
	if items == nil {
		items = []item{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Service) create(c *gin.Context) {
	userID := auth.UserID(c)
	surveyID := uuid.New()
	versionID := uuid.New()
	defaultSchema := json.RawMessage(`{"version":1,"fields":[]}`)

	var req struct {
		Locale string `json:"locale"`
	}
	_ = c.ShouldBindJSON(&req)

	title := "未命名问卷"
	successMessage := "感谢您抽出宝贵时间参与本次调查，您的反馈将帮助我们不断提升服务质量。"
	displayLocale := "zh"
	if req.Locale == "en" {
		title = "Untitled survey"
		successMessage = "Thank you for taking the time to complete this survey. Your feedback helps us improve our service."
		displayLocale = "en"
	}

	tx, err := s.pool.Begin(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}
	defer tx.Rollback(c)

	_, err = tx.Exec(c, `
		INSERT INTO surveys (id, title, success_message, display_locale, created_by)
		VALUES ($1, $2, $3, $4, $5)
	`, surveyID, title, successMessage, displayLocale, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}
	_, err = tx.Exec(c, `
		INSERT INTO survey_versions (id, survey_id, version_no, schema, html_template)
		VALUES ($1, $2, 1, $3, '')
	`, versionID, surveyID, defaultSchema)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}
	_, err = tx.Exec(c, `UPDATE surveys SET current_version_id=$1 WHERE id=$2`, versionID, surveyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}
	if err := tx.Commit(c); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": surveyID.String()})
}

func (s *Service) get(c *gin.Context) {
	sv, err := s.loadSurvey(c, c.Param("id"), auth.UserID(c))
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "问卷不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	c.JSON(http.StatusOK, sv)
}

func (s *Service) update(c *gin.Context) {
	id := c.Param("id")
	userID := auth.UserID(c)
	var req struct {
		Title       *string          `json:"title"`
		Description *string          `json:"description"`
		Schema      json.RawMessage  `json:"schema"`
		HTMLTemplate *string         `json:"html_template"`
		SuccessMessage *string      `json:"success_message"`
		DisplayLocale  *string      `json:"display_locale"`
		AllowMultipleSubmit *bool          `json:"allow_multiple_submit"`
		ExpiresAt           json.RawMessage `json:"expires_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var status string
	err := s.pool.QueryRow(c, `SELECT status::text FROM surveys WHERE id=$1 AND created_by=$2`, id, userID).Scan(&status)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "问卷不存在"})
		return
	}
	if status != "draft" && (req.Schema != nil || req.HTMLTemplate != nil) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "已发布问卷不可修改结构，请复制为新问卷"})
		return
	}

	if req.Title != nil {
		_, _ = s.pool.Exec(c, `UPDATE surveys SET title=$1, updated_at=NOW() WHERE id=$2`, *req.Title, id)
	}
	if req.Description != nil {
		_, _ = s.pool.Exec(c, `UPDATE surveys SET description=$1, updated_at=NOW() WHERE id=$2`, *req.Description, id)
	}
	if req.SuccessMessage != nil {
		_, _ = s.pool.Exec(c, `UPDATE surveys SET success_message=$1, updated_at=NOW() WHERE id=$2`, *req.SuccessMessage, id)
	}
	if req.DisplayLocale != nil {
		locale := strings.TrimSpace(*req.DisplayLocale)
		if locale != "en" {
			locale = "zh"
		}
		_, _ = s.pool.Exec(c, `UPDATE surveys SET display_locale=$1, updated_at=NOW() WHERE id=$2`, locale, id)
	}
	if req.AllowMultipleSubmit != nil {
		_, _ = s.pool.Exec(c, `UPDATE surveys SET allow_multiple_submit=$1, updated_at=NOW() WHERE id=$2`, *req.AllowMultipleSubmit, id)
	}
	if req.ExpiresAt != nil {
		expiresAt, clear, err := parseExpiresAt(req.ExpiresAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "截止日期无效"})
			return
		}
		if clear {
			_, _ = s.pool.Exec(c, `UPDATE surveys SET expires_at=NULL, updated_at=NOW() WHERE id=$1`, id)
		} else if expiresAt != nil {
			if !expiresAt.After(time.Now()) {
				var current *time.Time
				_ = s.pool.QueryRow(c, `SELECT expires_at FROM surveys WHERE id=$1`, id).Scan(&current)
				same := current != nil && expiresAt.Equal(*current)
				if !same {
					c.JSON(http.StatusBadRequest, gin.H{"error": "截止日期无效或已过期"})
					return
				}
			}
			_, _ = s.pool.Exec(c, `UPDATE surveys SET expires_at=$1, updated_at=NOW() WHERE id=$2`, expiresAt, id)
		}
	}
	if req.Schema != nil || req.HTMLTemplate != nil {
		var versionID string
		err := s.pool.QueryRow(c, `SELECT current_version_id::text FROM surveys WHERE id=$1`, id).Scan(&versionID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
			return
		}
		if req.Schema != nil {
			_, _ = s.pool.Exec(c, `UPDATE survey_versions SET schema=$1 WHERE id=$2`, req.Schema, versionID)
		}
		if req.HTMLTemplate != nil {
			sanitized := htmlutil.SanitizeSurveyHTML(*req.HTMLTemplate)
			schemaForValidate := req.Schema
			if schemaForValidate == nil {
				var cur json.RawMessage
				_ = s.pool.QueryRow(c, `SELECT schema FROM survey_versions WHERE id=$1`, versionID).Scan(&cur)
				schemaForValidate = cur
			}
			if err := validateHTMLFieldIDs(schemaForValidate, sanitized); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			_, _ = s.pool.Exec(c, `UPDATE survey_versions SET html_template=$1 WHERE id=$2`, sanitized, versionID)
		}
		_, _ = s.pool.Exec(c, `UPDATE surveys SET updated_at=NOW() WHERE id=$1`, id)
	}

	sv, err := s.loadSurvey(c, id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	c.JSON(http.StatusOK, sv)
}

func (s *Service) publish(c *gin.Context) {
	id := c.Param("id")
	userID := auth.UserID(c)
	sv, err := s.loadSurvey(c, id, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "问卷不存在"})
		return
	}
	var schema struct {
		Fields []struct {
			ID   string `json:"id"`
			Type string `json:"type"`
		} `json:"fields"`
	}
	if err := json.Unmarshal(sv.Schema, &schema); err != nil || len(schema.Fields) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请至少添加一个字段后再发布"})
		return
	}
	_, err = s.pool.Exec(c, `UPDATE surveys SET status='published', updated_at=NOW() WHERE id=$1 AND created_by=$2`, id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "发布失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Service) close(c *gin.Context) {
	id := c.Param("id")
	userID := auth.UserID(c)
	tag, err := s.pool.Exec(c, `
		UPDATE surveys SET status='paused', updated_at=NOW()
		WHERE id=$1 AND created_by=$2 AND status='published'
	`, id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "结束失败"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅进行中的问卷可结束"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Service) generate(c *gin.Context) {
	id := c.Param("id")
	userID := auth.UserID(c)
	var req struct {
		Prompt string `json:"prompt" binding:"required"`
		Mode   string `json:"mode"`
		Locale string `json:"locale"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入描述"})
		return
	}
	if len(req.Prompt) > 4000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "描述过长"})
		return
	}
	sv, err := s.loadSurvey(c, id, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "问卷不存在"})
		return
	}
	locale := strings.TrimSpace(req.Locale)
	if locale == "" {
		locale = sv.DisplayLocale
	}
	if locale != "en" {
		locale = "zh"
	}
	result, err := s.llm.GenerateSurvey(c, req.Prompt, req.Mode, locale)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	sanitized := htmlutil.SanitizeSurveyHTML(result.HTML)
	if err := validateHTMLFieldIDs(result.Schema, sanitized); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"title": result.Title, "description": result.Description,
		"schema": result.Schema, "html": sanitized,
	})
}

func (s *Service) listResponses(c *gin.Context) {
	id := c.Param("id")
	userID := auth.UserID(c)
	rows, err := s.pool.Query(c, `
		SELECT r.id::text, ct.name, ct.email, ct.company, r.answers, r.submitted_at
		FROM responses r
		JOIN shares sh ON sh.id = r.share_id
		JOIN contacts ct ON ct.id = sh.contact_id
		JOIN surveys s ON s.id = sh.survey_id
		WHERE s.id = $1 AND s.created_by = $2
		ORDER BY r.submitted_at DESC
	`, id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	defer rows.Close()
	type item struct {
		ID          string                 `json:"id"`
		ContactName string                 `json:"contact_name"`
		Email       string                 `json:"email"`
		Company     string                 `json:"company"`
		Answers     json.RawMessage        `json:"answers"`
		Files       map[string]interface{} `json:"files"`
		SubmittedAt time.Time              `json:"submitted_at"`
	}
	var items []item
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.ID, &it.ContactName, &it.Email, &it.Company, &it.Answers, &it.SubmittedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
			return
		}
		it.Files = s.loadResponseFiles(c, it.ID)
		items = append(items, it)
	}
	if items == nil {
		items = []item{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Service) loadResponseFiles(c *gin.Context, responseID string) map[string]interface{} {
	rows, err := s.pool.Query(c, `
		SELECT field_id, id::text, filename
		FROM files
		WHERE response_id = $1 AND status IN ('uploaded', 'bound')
	`, responseID)
	if err != nil {
		return map[string]interface{}{}
	}
	defer rows.Close()
	files := make(map[string]interface{})
	for rows.Next() {
		var fieldID, fileID, filename string
		if err := rows.Scan(&fieldID, &fileID, &filename); err != nil {
			continue
		}
		meta := map[string]string{"file_id": fileID, "filename": filename}
		files[fileID] = meta
		if _, exists := files[fieldID]; !exists {
			files[fieldID] = meta
		}
	}
	if len(files) == 0 {
		return map[string]interface{}{}
	}
	return files
}

func (s *Service) preview(c *gin.Context) {
	sv, err := s.loadSurvey(c, c.Param("id"), auth.UserID(c))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "问卷不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"title":         sv.Title,
		"description":   sv.Description,
		"schema":        sv.Schema,
		"html_template": sv.HTMLTemplate,
		"preview":       true,
	})
}

func (s *Service) delete(c *gin.Context) {
	tag, err := s.pool.Exec(c, `DELETE FROM surveys WHERE id=$1 AND created_by=$2 AND status='draft'`, c.Param("id"), auth.UserID(c))
	if err != nil || tag.RowsAffected() == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅草稿可删除"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Service) loadSurvey(c *gin.Context, id, userID string) (*Survey, error) {
	var sv Survey
	var versionID *string
	err := s.pool.QueryRow(c, `
		SELECT s.id::text, s.title, s.description, s.status::text, s.allow_multiple_submit,
		       s.display_locale, s.success_message, s.expires_at, s.current_version_id::text, s.created_at, s.updated_at
		FROM surveys s
		WHERE s.id = $1 AND s.created_by = $2
	`, id, userID).Scan(&sv.ID, &sv.Title, &sv.Description, &sv.Status, &sv.AllowMultipleSubmit,
		&sv.DisplayLocale, &sv.SuccessMessage, &sv.ExpiresAt, &versionID, &sv.CreatedAt, &sv.UpdatedAt)
	if err != nil {
		return nil, err
	}
	sv.CurrentVersionID = versionID
	if versionID != nil {
		_ = s.pool.QueryRow(c, `SELECT schema, html_template FROM survey_versions WHERE id=$1`, *versionID).
			Scan(&sv.Schema, &sv.HTMLTemplate)
	}
	return &sv, nil
}

func parseExpiresAt(raw json.RawMessage) (*time.Time, bool, error) {
	if raw == nil {
		return nil, false, nil
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return nil, false, nil
	}
	if trimmed == "null" {
		return nil, true, nil
	}
	var t time.Time
	if err := json.Unmarshal(raw, &t); err != nil {
		return nil, false, err
	}
	return &t, false, nil
}

func validateHTMLFieldIDs(schema json.RawMessage, html string) error {
	if schema == nil {
		return nil
	}
	var doc struct {
		Fields []struct {
			ID string `json:"id"`
		} `json:"fields"`
	}
	if err := json.Unmarshal(schema, &doc); err != nil {
		return err
	}
	for _, f := range doc.Fields {
		if f.ID == "" || f.ID == "section" {
			continue
		}
		needle := `data-field-id="` + f.ID + `"`
		if !strings.Contains(html, needle) {
			return errFieldMismatch
		}
	}
	return nil
}

var errFieldMismatch = &fieldError{"HTML 模板缺少与 Schema 对应的 data-field-id"}

type fieldError struct{ msg string }

func (e *fieldError) Error() string { return e.msg }
