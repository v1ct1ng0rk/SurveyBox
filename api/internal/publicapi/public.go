package publicapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/victorking528/SurveyBox/api/internal/middleware"
	"github.com/victorking528/SurveyBox/api/internal/share"
	"github.com/victorking528/SurveyBox/api/pkg/schema"
	"github.com/victorking528/SurveyBox/api/pkg/storage"
)

type Service struct {
	pool     *pgxpool.Pool
	storage  *storage.LocalProvider
	webOrigin string
}

func NewService(pool *pgxpool.Pool, sp *storage.LocalProvider, webOrigin string) *Service {
	return &Service{pool: pool, storage: sp, webOrigin: webOrigin}
}

func (s *Service) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/surveys/:token", middleware.RateLimit(60, time.Minute, func(c *gin.Context) string {
		return "pub-get:" + c.ClientIP()
	}), s.getSurvey)
	r.POST("/responses", middleware.RateLimit(3, time.Minute, func(c *gin.Context) string {
		return "pub-submit:" + c.GetHeader("X-Share-Token")
	}), s.submitResponse)
	r.POST("/files", middleware.RateLimit(10, time.Hour, func(c *gin.Context) string {
		return "pub-upload:" + c.GetHeader("X-Share-Token")
	}), s.uploadFile)
	r.GET("/files/:id", s.downloadFile)
	r.DELETE("/files/:id", s.deleteFile)
}

type shareCtx struct {
	ShareID  string
	SurveyID string
	Token    string
}

func (s *Service) resolveShare(c *gin.Context) (*shareCtx, error) {
	token := c.GetHeader("X-Share-Token")
	if token == "" {
		token = c.Param("token")
	}
	if token == "" {
		return nil, fmt.Errorf("missing token")
	}
	shareID, surveyID, err := share.ResolveByToken(c, s.pool, token)
	if err != nil {
		return nil, err
	}
	return &shareCtx{ShareID: shareID, SurveyID: surveyID, Token: token}, nil
}

func (s *Service) getSurvey(c *gin.Context) {
	sc, err := s.resolveShare(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "链接无效或已过期"})
		return
	}
	var title, desc, successMsg, status string
	var allowMultiple bool
	var schemaRaw json.RawMessage
	var html string
	err = s.pool.QueryRow(c, `
		SELECT s.title, s.description, s.success_message, s.status::text, s.allow_multiple_submit,
		       sv.schema, sv.html_template
		FROM surveys s
		JOIN survey_versions sv ON sv.id = s.current_version_id
		WHERE s.id = $1 AND s.status IN ('published', 'paused')
	`, sc.SurveyID).Scan(&title, &desc, &successMsg, &status, &allowMultiple, &schemaRaw, &html)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "链接无效或已过期"})
		return
	}
	if status == "paused" {
		c.JSON(http.StatusForbidden, gin.H{"error": "问卷已停止收集"})
		return
	}

	var shareStatus string
	var submittedAt *time.Time
	_ = s.pool.QueryRow(c, `SELECT status::text, submitted_at FROM shares WHERE id=$1`, sc.ShareID).
		Scan(&shareStatus, &submittedAt)

	_, _ = s.pool.Exec(c, `UPDATE shares SET status='opened' WHERE id=$1 AND status='pending'`, sc.ShareID)

	c.JSON(http.StatusOK, gin.H{
		"title": title, "description": desc, "success_message": successMsg,
		"schema": schemaRaw, "html_template": html,
		"allow_multiple_submit": allowMultiple,
		"submitted": shareStatus == "submitted",
		"submitted_at": submittedAt,
	})
}

func (s *Service) submitResponse(c *gin.Context) {
	sc, err := s.resolveShare(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "链接无效或已过期"})
		return
	}

	var req struct {
		Answers map[string]interface{} `json:"answers" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写问卷"})
		return
	}

	var status string
	var allowMultiple bool
	var schemaRaw json.RawMessage
	err = s.pool.QueryRow(c, `
		SELECT s.status::text, s.allow_multiple_submit, sv.schema
		FROM surveys s JOIN survey_versions sv ON sv.id = s.current_version_id
		WHERE s.id = $1
	`, sc.SurveyID).Scan(&status, &allowMultiple, &schemaRaw)
	if err != nil || status != "published" {
		c.JSON(http.StatusForbidden, gin.H{"error": "问卷不可提交"})
		return
	}

	var shareStatus string
	_ = s.pool.QueryRow(c, `SELECT status::text FROM shares WHERE id=$1`, sc.ShareID).Scan(&shareStatus)
	if shareStatus == "submitted" && !allowMultiple {
		c.JSON(http.StatusConflict, gin.H{"error": "您已提交过此问卷"})
		return
	}

	doc, err := schema.Parse(schemaRaw)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "问卷配置错误"})
		return
	}

	fileIDs := s.validFileIDs(c, sc.ShareID)
	if err := schema.ValidateAnswers(doc, req.Answers, fileIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	answersJSON, _ := json.Marshal(req.Answers)
	tx, err := s.pool.Begin(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交失败"})
		return
	}
	defer tx.Rollback(c)

	var responseID string
	err = tx.QueryRow(c, `
		INSERT INTO responses (share_id, answers) VALUES ($1, $2)
		ON CONFLICT (share_id) DO UPDATE SET answers = EXCLUDED.answers, submitted_at = NOW()
		RETURNING id::text
	`, sc.ShareID, answersJSON).Scan(&responseID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交失败"})
		return
	}

	for _, f := range doc.Fields {
		if f.Type != "file" {
			continue
		}
		if v, ok := req.Answers[f.ID].(string); ok && v != "" {
			_, _ = tx.Exec(c, `
				UPDATE files SET status='bound', response_id=$1
				WHERE id=$2 AND share_id=$3 AND status='uploaded'
			`, responseID, v, sc.ShareID)
		}
	}

	_, _ = tx.Exec(c, `UPDATE shares SET status='submitted', submitted_at=NOW() WHERE id=$1`, sc.ShareID)
	if err := tx.Commit(c); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交失败"})
		return
	}

	_, _ = s.pool.Exec(c, `
		INSERT INTO audit_logs (actor_type, actor_id, action, resource, ip, user_agent)
		VALUES ('respondent', $1, 'response_submit', $2, $3::inet, $4)
	`, sc.Token[:8], "responses:"+responseID, c.ClientIP(), c.Request.UserAgent())

	c.JSON(http.StatusOK, gin.H{"ok": true, "response_id": responseID})
}

func (s *Service) validFileIDs(c *gin.Context, shareID string) map[string]bool {
	rows, _ := s.pool.Query(c, `SELECT id::text FROM files WHERE share_id=$1 AND status IN ('uploaded','bound')`, shareID)
	defer rows.Close()
	m := make(map[string]bool)
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		m[id] = true
	}
	return m
}

func (s *Service) uploadFile(c *gin.Context) {
	sc, err := s.resolveShare(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "链接无效"})
		return
	}
	fieldID := c.PostForm("field_id")
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择文件"})
		return
	}
	defer file.Close()

	if header.Size > 20<<20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件不能超过 20MB"})
		return
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{".pdf": true, ".png": true, ".jpg": true, ".jpeg": true, ".doc": true, ".docx": true}
	if !allowed[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的文件类型"})
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, 20<<20+1))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "上传失败"})
		return
	}
	sum := sha256.Sum256(data)
	storageKey, err := s.storage.Put(c, bytes.NewReader(data))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "存储失败"})
		return
	}

	var fileID string
	err = s.pool.QueryRow(c, `
		INSERT INTO files (share_id, field_id, storage_key, filename, mime, size, sha256)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id::text
	`, sc.ShareID, fieldID, storageKey, filepath.Base(header.Filename), header.Header.Get("Content-Type"), len(data), hex.EncodeToString(sum[:])).
		Scan(&fileID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"file_id": fileID, "filename": filepath.Base(header.Filename), "size": len(data)})
}

func (s *Service) downloadFile(c *gin.Context) {
	sc, err := s.resolveShare(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "链接无效"})
		return
	}
	fileID := c.Param("id")
	var storageKey, filename string
	err = s.pool.QueryRow(c, `
		SELECT storage_key, filename FROM files
		WHERE id=$1 AND share_id=$2 AND status IN ('uploaded','bound')
	`, fileID, sc.ShareID).Scan(&storageKey, &filename)
	if err == pgx.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return
	}
	rc, err := s.storage.Get(c, storageKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
		return
	}
	defer rc.Close()
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "application/octet-stream")
	_, _ = io.Copy(c.Writer, rc)
}

func (s *Service) deleteFile(c *gin.Context) {
	sc, err := s.resolveShare(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "链接无效"})
		return
	}
	var storageKey string
	err = s.pool.QueryRow(c, `
		SELECT storage_key FROM files
		WHERE id=$1 AND share_id=$2 AND status='uploaded' AND response_id IS NULL
	`, c.Param("id"), sc.ShareID).Scan(&storageKey)
	if err == pgx.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return
	}
	_ = s.storage.Delete(c, storageKey)
	_, _ = s.pool.Exec(c, `UPDATE files SET status='deleted' WHERE id=$1`, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
