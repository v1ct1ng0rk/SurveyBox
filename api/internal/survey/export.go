package survey

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/victorking528/SurveyBox/api/internal/auth"
	exportcsv "github.com/victorking528/SurveyBox/api/pkg/exportcsv"
	exportzip "github.com/victorking528/SurveyBox/api/pkg/exportzip"
	"github.com/victorking528/SurveyBox/api/pkg/schema"
)

type exportResponseRow struct {
	ResponseID  string
	ContactName string
	Email       string
	Company     string
	SubmittedAt time.Time
	Answers     map[string]interface{}
}

func (s *Service) exportResponses(c *gin.Context) {
	id := c.Param("id")
	userID := auth.UserID(c)

	var title string
	var schemaRaw []byte
	err := s.pool.QueryRow(c, `
		SELECT s.title, sv.schema
		FROM surveys s
		JOIN survey_versions sv ON sv.id = s.current_version_id
		WHERE s.id = $1 AND s.created_by = $2
	`, id, userID).Scan(&title, &schemaRaw)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "问卷不存在"})
		return
	}

	var schemaDoc struct {
		Fields []exportcsv.FieldCol `json:"fields"`
	}
	_ = json.Unmarshal(schemaRaw, &schemaDoc)

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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导出失败"})
		return
	}
	defer rows.Close()

	var exportRows []exportResponseRow
	for rows.Next() {
		var r exportResponseRow
		var answersRaw []byte
		if err := rows.Scan(&r.ResponseID, &r.ContactName, &r.Email, &r.Company, &answersRaw, &r.SubmittedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
			return
		}
		r.Answers = map[string]interface{}{}
		_ = json.Unmarshal(answersRaw, &r.Answers)
		exportRows = append(exportRows, r)
	}

	fileFields := fileFieldIDs(schemaDoc.Fields)
	var zipFiles []exportzip.FileEntry
	csvRows := make([]exportcsv.Row, 0, len(exportRows))

	for i, r := range exportRows {
		csvRow := exportcsv.Row{
			ContactName: r.ContactName,
			Email:       r.Email,
			Company:     r.Company,
			SubmittedAt: r.SubmittedAt,
			Answers:     copyAnswers(r.Answers),
		}
		for _, fieldID := range fileFields {
			var zipPaths []string
			for fi, fileID := range schema.FileIDsFromAnswer(r.Answers[fieldID]) {
				var storageKey, filename string
				err := s.pool.QueryRow(c, `
					SELECT f.storage_key, f.filename
					FROM files f
					JOIN responses r ON r.id = f.response_id
					JOIN shares sh ON sh.id = r.share_id
					WHERE f.id = $1 AND f.response_id = $2 AND sh.survey_id = $3 AND f.status = 'bound'
				`, fileID, r.ResponseID, id).Scan(&storageKey, &filename)
				if err != nil {
					continue
				}
				label := fieldLabel(schemaDoc.Fields, fieldID)
				if fi > 0 {
					label = fmt.Sprintf("%s-%d", label, fi+1)
				}
				zipPath := attachmentZipPath(i+1, r.ContactName, label, filename)
				zipPaths = append(zipPaths, zipPath)
				storageKeyCopy := storageKey
				pathCopy := zipPath
				zipFiles = append(zipFiles, exportzip.FileEntry{
					Path: pathCopy,
					Open: func() (io.ReadCloser, error) {
						if s.storage == nil {
							return nil, fmt.Errorf("storage not configured")
						}
						return s.storage.Get(c.Request.Context(), storageKeyCopy)
					},
				})
			}
			if len(zipPaths) > 0 {
				csvRow.Answers[fieldID] = strings.Join(zipPaths, "; ")
			}
		}
		csvRows = append(csvRows, csvRow)
	}

	csvBytes, err := exportcsv.Build(schemaDoc.Fields, csvRows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成 CSV 失败"})
		return
	}

	zipBytes, err := exportzip.Build(csvBytes, zipFiles)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "打包失败"})
		return
	}

	filename := sanitizeExportFilename(title) + "-答卷-" + time.Now().Format("20060102") + ".zip"
	meta, _ := json.Marshal(map[string]int{"attachments": len(zipFiles)})
	_, _ = s.pool.Exec(c, `
		INSERT INTO audit_logs (actor_type, actor_id, action, resource, ip, user_agent, meta)
		VALUES ('user', $1, 'survey_export', $2, $3::inet, $4, $5)
	`, userID, "surveys:"+id, c.ClientIP(), c.Request.UserAgent(), meta)

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(filename))
	c.Data(http.StatusOK, "application/zip", zipBytes)
}

func fileFieldIDs(fields []exportcsv.FieldCol) []string {
	var ids []string
	for _, f := range fields {
		if f.Type == "file" {
			ids = append(ids, f.ID)
		}
	}
	return ids
}

func fieldLabel(fields []exportcsv.FieldCol, id string) string {
	for _, f := range fields {
		if f.ID == id {
			return f.Label
		}
	}
	return id
}

func attachmentZipPath(index int, contact, fieldLabel, filename string) string {
	base := filepath.Base(filename)
	if base == "" || base == "." {
		base = "file"
	}
	name := fmt.Sprintf("%02d_%s_%s_%s", index, sanitizeExportFilename(contact), sanitizeExportFilename(fieldLabel), sanitizeExportFilename(strings.TrimSuffix(base, filepath.Ext(base)))+filepath.Ext(base))
	return "attachments/" + name
}

func copyAnswers(src map[string]interface{}) map[string]interface{} {
	dst := make(map[string]interface{}, len(src))
	for k, v := range src {
		if k == "" {
			continue
		}
		dst[k] = v
	}
	return dst
}

func sanitizeExportFilename(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "unknown"
	}
	replacer := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "*", "-", "?", "-", "\"", "-", "<", "-", ">", "-", "|", "-")
	return replacer.Replace(s)
}
