package exportcsv_test

import (
	"strings"
	"testing"
	"time"

	exportcsv "github.com/victorking528/SurveyBox/api/pkg/exportcsv"
)

func TestBuildCSVWithBOM(t *testing.T) {
	fields := []exportcsv.FieldCol{{ID: "q1", Label: "姓名", Type: "text"}}
	rows := []exportcsv.Row{{
		ContactName: "张三",
		Email:       "a@test.com",
		Company:     "ACME",
		SubmittedAt: time.Date(2026, 7, 2, 12, 0, 0, 0, time.UTC),
		Answers:     map[string]interface{}{"q1": "李四"},
	}}
	b, err := exportcsv.Build(fields, rows)
	if err != nil {
		t.Fatal(err)
	}
	if b[0] != 0xEF || b[1] != 0xBB || b[2] != 0xBF {
		t.Fatal("missing UTF-8 BOM")
	}
	content := string(b)
	if !strings.Contains(content, "张三") || !strings.Contains(content, "李四") {
		t.Fatalf("unexpected csv: %s", content)
	}
}

func TestSanitizeFormulaInjection(t *testing.T) {
	fields := []exportcsv.FieldCol{{ID: "q1", Label: "备注", Type: "text"}}
	rows := []exportcsv.Row{{
		ContactName: "=1+1",
		Email:       "a@test.com",
		Company:     "",
		SubmittedAt: time.Now(),
		Answers:     map[string]interface{}{"q1": "+cmd"},
	}}
	b, err := exportcsv.Build(fields, rows)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), "'=1+1") {
		t.Fatalf("formula not sanitized: %s", string(b))
	}
}
