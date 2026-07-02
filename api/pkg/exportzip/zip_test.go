package exportzip_test

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"

	exportzip "github.com/victorking528/SurveyBox/api/pkg/exportzip"
)

func TestBuildZipContainsCSVAndAttachment(t *testing.T) {
	csv := []byte("test,csv")
	content := []byte("file-bytes")
	zipBytes, err := exportzip.Build(csv, []exportzip.FileEntry{{
		Path: "attachments/01_张三_合同_file.pdf",
		Open: func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(content)), nil
		},
	}})
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, f := range zr.File {
		names[f.Name] = true
	}
	if !names["答卷.csv"] || !names["attachments/01_张三_合同_file.pdf"] {
		t.Fatalf("missing entries: %v", names)
	}
}

func TestBuildZipCSVALone(t *testing.T) {
	zipBytes, err := exportzip.Build([]byte("a,b"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(zipBytes), "PK") {
		t.Fatal("not a zip file")
	}
}
