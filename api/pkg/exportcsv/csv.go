package exportcsv

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"
	"time"
)

// BOM helps Excel open UTF-8 CSV with Chinese characters correctly.
var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

func SanitizeCell(s string) string {
	if s == "" {
		return s
	}
	switch s[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + s
	default:
		return s
	}
}

func FormatValue(v interface{}) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return SanitizeCell(t)
	case float64:
		return SanitizeCell(fmt.Sprintf("%v", t))
	case bool:
		if t {
			return "是"
		}
		return "否"
	case []interface{}:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			parts = append(parts, FormatValue(item))
		}
		return SanitizeCell(strings.Join(parts, "; "))
	default:
		return SanitizeCell(fmt.Sprintf("%v", t))
	}
}

type FieldCol struct {
	ID    string
	Label string
	Type  string
}

type Row struct {
	ContactName string
	Email       string
	Company     string
	SubmittedAt time.Time
	Answers     map[string]interface{}
}

func Build(fields []FieldCol, rows []Row) ([]byte, error) {
	buf := &bytes.Buffer{}
	buf.Write(utf8BOM)
	w := csv.NewWriter(buf)

	header := []string{"联系人", "邮箱", "公司", "提交时间"}
	for _, f := range fields {
		if f.Type == "section" {
			continue
		}
		header = append(header, f.Label)
	}
	if err := w.Write(header); err != nil {
		return nil, err
	}

	for _, r := range rows {
		record := []string{
			SanitizeCell(r.ContactName),
			SanitizeCell(r.Email),
			SanitizeCell(r.Company),
			SanitizeCell(r.SubmittedAt.Format("2006-01-02 15:04:05")),
		}
		for _, f := range fields {
			if f.Type == "section" {
				continue
			}
			record = append(record, FormatValue(r.Answers[f.ID]))
		}
		if err := w.Write(record); err != nil {
			return nil, err
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}
