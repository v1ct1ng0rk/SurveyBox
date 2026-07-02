package exportzip

import (
	"archive/zip"
	"bytes"
	"io"
)

type FileEntry struct {
	Path string
	Open func() (io.ReadCloser, error)
}

func Build(csvData []byte, files []FileEntry) ([]byte, error) {
	buf := &bytes.Buffer{}
	zw := zip.NewWriter(buf)

	cw, err := zw.Create("答卷.csv")
	if err != nil {
		return nil, err
	}
	if _, err := cw.Write(csvData); err != nil {
		return nil, err
	}

	for _, f := range files {
		if f.Open == nil {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		w, err := zw.Create(f.Path)
		if err != nil {
			rc.Close()
			return nil, err
		}
		if _, err := io.Copy(w, rc); err != nil {
			rc.Close()
			return nil, err
		}
		rc.Close()
	}

	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
