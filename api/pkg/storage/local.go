package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"

	"github.com/victorking528/SurveyBox/api/pkg/crypto"
)

type LocalProvider struct {
	basePath string
	key      []byte
}

func NewLocalProvider(basePath string, key []byte) (*LocalProvider, error) {
	if err := os.MkdirAll(basePath, 0o750); err != nil {
		return nil, err
	}
	return &LocalProvider{basePath: basePath, key: key}, nil
}

func (p *LocalProvider) Put(_ context.Context, plaintext io.Reader) (storageKey string, err error) {
	id := uuid.New()
	shard := id.String()[:2]
	dir := filepath.Join(p.basePath, shard)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", err
	}
	storageKey = filepath.Join(shard, id.String()+".enc")
	full := filepath.Join(p.basePath, storageKey)

	data, err := io.ReadAll(plaintext)
	if err != nil {
		return "", err
	}
	enc, err := crypto.Encrypt(p.key, data)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(full, enc, 0o600); err != nil {
		return "", err
	}
	return storageKey, nil
}

func (p *LocalProvider) Get(_ context.Context, storageKey string) (io.ReadCloser, error) {
	full := filepath.Join(p.basePath, storageKey)
	if !isPathInside(p.basePath, full) {
		return nil, fmt.Errorf("invalid storage key")
	}
	enc, err := os.ReadFile(full)
	if err != nil {
		return nil, err
	}
	plain, err := crypto.Decrypt(p.key, enc)
	if err != nil {
		return nil, err
	}
	return io.NopCloser(bytes.NewReader(plain)), nil
}

func (p *LocalProvider) Delete(_ context.Context, storageKey string) error {
	full := filepath.Join(p.basePath, storageKey)
	if !isPathInside(p.basePath, full) {
		return fmt.Errorf("invalid storage key")
	}
	return os.Remove(full)
}

func isPathInside(base, target string) bool {
	absBase, _ := filepath.Abs(base)
	absTarget, _ := filepath.Abs(target)
	rel, err := filepath.Rel(absBase, absTarget)
	return err == nil && rel != ".." && !filepath.IsAbs(rel) && rel != ""
}
