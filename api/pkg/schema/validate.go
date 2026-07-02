package schema

import (
	"encoding/json"
	"fmt"
	"strings"
)

type Field struct {
	ID       string   `json:"id"`
	Type     string   `json:"type"`
	Label    string   `json:"label"`
	Required bool     `json:"required"`
	Options  []string `json:"options,omitempty"`
}

type Document struct {
	Version int     `json:"version"`
	Fields  []Field `json:"fields"`
}

func Parse(raw json.RawMessage) (*Document, error) {
	var doc Document
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

func ValidateAnswers(doc *Document, answers map[string]interface{}, fileIDs map[string]bool) error {
	for _, f := range doc.Fields {
		if f.Type == "section" {
			continue
		}
		val, ok := answers[f.ID]
		if f.Required && (!ok || isEmpty(val)) {
			return fmt.Errorf("字段 %s 为必填", f.Label)
		}
		if f.Type == "file" && ok && val != nil {
			fid, _ := val.(string)
			if fid != "" && !fileIDs[fid] {
				return fmt.Errorf("文件 %s 无效", f.Label)
			}
		}
	}
	return nil
}

func isEmpty(v interface{}) bool {
	switch t := v.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(t) == ""
	case []interface{}:
		return len(t) == 0
	default:
		return false
	}
}
