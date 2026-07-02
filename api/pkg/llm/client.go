package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	baseURL string
	apiKey  string
	model   string
	http    *http.Client
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model          string         `json:"model"`
	Messages       []ChatMessage  `json:"messages"`
	Temperature    float64        `json:"temperature"`
	ResponseFormat map[string]string `json:"response_format,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func NewClient(baseURL, apiKey, model string, timeout time.Duration) *Client {
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		model:   model,
		http:    &http.Client{Timeout: timeout},
	}
}

func (c *Client) ChatCompletion(ctx context.Context, messages []ChatMessage) (string, error) {
	body, _ := json.Marshal(chatRequest{
		Model:          c.model,
		Messages:       messages,
		Temperature:    0.3,
		ResponseFormat: map[string]string{"type": "json_object"},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("LLM API error %d: %s", resp.StatusCode, string(raw))
	}
	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.Error != nil {
		return "", fmt.Errorf("LLM: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("LLM returned empty response")
	}
	return out.Choices[0].Message.Content, nil
}

const systemPromptZH = `你是问卷设计助手。输出必须是单个 JSON 对象，包含字段：
- title: 问卷标题
- description: 问卷说明
- schema: { "version": 1, "fields": [ { "id": "field_1", "type": "text|textarea|number|select|radio|checkbox|file|section", "label": "标签", "required": true/false, "options": ["选项"] } ] }
- html: 表单 HTML，每个可填字段必须有 data-field-id 与 schema 中 id 一致，文件字段 data-type="file"
禁止 script、iframe、on* 事件属性。只输出 JSON，不要 markdown。所有面向填写者的文案（标题、说明、字段标签、选项）必须使用简体中文。`

const systemPromptEN = `You are a survey design assistant. Output must be a single JSON object with:
- title: survey title
- description: survey introduction
- schema: { "version": 1, "fields": [ { "id": "field_1", "type": "text|textarea|number|select|radio|checkbox|file|section", "label": "Label", "required": true/false, "options": ["Option"] } ] }
- html: form HTML; each fillable field must have data-field-id matching schema id; file fields use data-type="file"
No script, iframe, or on* event attributes. Output JSON only, no markdown. All respondent-facing text (title, description, field labels, options) MUST be in English.`

// SystemPrompt is kept for backward compatibility.
const SystemPrompt = systemPromptZH

func systemPromptForLocale(locale string) string {
	if locale == "en" {
		return systemPromptEN
	}
	return systemPromptZH
}

type GenerateResult struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Schema      json.RawMessage `json:"schema"`
	HTML        string          `json:"html"`
}

func (c *Client) GenerateSurvey(ctx context.Context, userPrompt string, mode string, locale string) (*GenerateResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("LLM_API_KEY 未配置")
	}
	systemPrompt := systemPromptForLocale(locale)
	userContent := userPrompt
	if mode == "html_only" {
		if locale == "en" {
			userContent = "Regenerate only the html field from this description; keep schema unchanged:\n" + userPrompt
		} else {
			userContent = "仅根据以下描述重新生成 html 字段，保持 schema 不变：\n" + userPrompt
		}
	} else if locale == "en" {
		userContent = "Generate the survey in English.\n" + userPrompt
	} else {
		userContent = "请使用简体中文生成问卷。\n" + userPrompt
	}
	content, err := c.ChatCompletion(ctx, []ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userContent},
	})
	if err != nil {
		return nil, err
	}
	var result GenerateResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		// retry with fix hint
		fixHint := "输出不是合法 JSON，请只返回修正后的 JSON 对象。解析错误: " + err.Error()
		if locale == "en" {
			fixHint = "Output is not valid JSON. Return only the corrected JSON object. Parse error: " + err.Error()
		}
		fix, err2 := c.ChatCompletion(ctx, []ChatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userContent},
			{Role: "assistant", Content: content},
			{Role: "user", Content: fixHint},
		})
		if err2 != nil {
			return nil, fmt.Errorf("JSON 解析失败: %w", err)
		}
		if err := json.Unmarshal([]byte(fix), &result); err != nil {
			return nil, fmt.Errorf("JSON 解析失败: %w", err)
		}
	}
	return &result, nil
}

func Ping(ctx context.Context, c *Client) error {
	_, err := c.ChatCompletion(ctx, []ChatMessage{
		{Role: "user", Content: `回复 {"ok":true} 的 JSON`},
	})
	return err
}
