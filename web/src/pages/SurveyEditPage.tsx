import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button, Card, Col, Form, Input, Row, Select, Space, Tag, Typography, message, Drawer, Switch, Spin,
} from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

const { TextArea } = Input
const { Text } = Typography

type Field = {
  id: string
  type: string
  label: string
  required?: boolean
  options?: string[]
}

const fieldTypes = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '下拉选择' },
  { value: 'radio', label: '单选' },
  { value: 'checkbox', label: '多选' },
  { value: 'file', label: '文件上传' },
  { value: 'section', label: '分段标题' },
]

const promptChips = ['客户满意度', 'NPS 评分', '文件上传', '多选题']

function defaultHTML(fields: Field[]) {
  return `<form class="survey-form">${fields
    .map((f) => {
      if (f.type === 'section') {
        return `<h3 data-field-id="${f.id}" data-type="section">${f.label}</h3>`
      }
      if (f.type === 'textarea') {
        return `<label data-field-id="${f.id}">${f.label}</label><textarea data-field-id="${f.id}" data-type="textarea"></textarea>`
      }
      if (f.type === 'file') {
        return `<label data-field-id="${f.id}">${f.label}</label><input data-field-id="${f.id}" data-type="file" type="file" />`
      }
      return `<label data-field-id="${f.id}">${f.label}</label><input data-field-id="${f.id}" data-type="${f.type}" type="text" />`
    })
    .join('')}</form>`
}

export default function SurveyEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [fields, setFields] = useState<Field[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [html, setHtml] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [llmPrompt, setLlmPrompt] = useState('')

  const { data: survey, isLoading } = useQuery({
    queryKey: ['survey', id],
    queryFn: async () => (await api.get(`/surveys/${id}`)).data,
    enabled: !!id && id !== 'new',
  })

  useEffect(() => {
    if (survey) {
      setTitle(survey.title)
      setDescription(survey.description)
      const schema = survey.schema || { fields: [] }
      setFields(schema.fields || [])
      setHtml(survey.html_template || '')
    }
  }, [survey])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const schema = { version: 1, fields }
      const htmlTemplate = html || defaultHTML(fields)
      if (id === 'new') {
        const { data } = await api.post('/surveys')
        await api.put(`/surveys/${data.id}`, { title, description, schema, html_template: htmlTemplate })
        return data.id
      }
      await api.put(`/surveys/${id}`, { title, description, schema, html_template: htmlTemplate })
      return id
    },
    onSuccess: (surveyId) => {
      message.success('已保存')
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
      queryClient.invalidateQueries({ queryKey: ['survey', surveyId] })
      if (id === 'new') navigate(`/surveys/${surveyId}/edit`, { replace: true })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(msg || '保存失败')
    },
  })

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/surveys/${id}/generate`, { prompt: llmPrompt, mode: 'full' })
      return data
    },
    onSuccess: (data) => {
      message.success('生成成功')
      if (data.title) setTitle(data.title)
      if (data.description) setDescription(data.description)
      if (data.schema?.fields) setFields(data.schema.fields)
      if (data.html) setHtml(data.html)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(msg || '生成失败，请检查 LLM_API_KEY 配置')
    },
  })

  const publishMutation = useMutation({
    mutationFn: async () => api.post(`/surveys/${id}/publish`),
    onSuccess: () => {
      message.success('发布成功')
      queryClient.invalidateQueries({ queryKey: ['survey', id] })
      navigate(`/surveys/${id}`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(msg || '发布失败')
    },
  })

  const previewSrcDoc = useMemo(
    () => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,"PingFang SC",sans-serif;padding:24px;color:#1f2329;margin:0;word-break:break-word}
      input,textarea,select{width:100%;max-width:100%;min-height:44px;border:1px solid #d9dde4;border-radius:6px;padding:8px 12px;margin-bottom:16px;font-size:16px}
      textarea{min-height:96px;resize:vertical}
      label{display:block;margin-bottom:8px;font-weight:500;line-height:1.5}
      img,video{max-width:100%;height:auto}
      @media (max-width:480px){body{padding:16px}}
    </style></head><body class="survey-skin">${html || defaultHTML(fields)}</body></html>`,
    [html, fields],
  )

  const addField = () => {
    const fid = `field_${Date.now()}`
    const next = [...fields, { id: fid, type: 'text', label: '新问题', required: false }]
    setFields(next)
    if (!html) setHtml(defaultHTML(next))
  }

  if (isLoading && id !== 'new') return <Spin style={{ display: 'block', margin: '100px auto' }} />

  const isDraft = !survey || survey.status === 'draft'

  return (
    <PageContainer
      header={{
        title: title || '未命名问卷',
        tags: survey ? [<Tag key="s">{survey.status}</Tag>] : [<Tag key="s">草稿</Tag>],
        extra: (
          <Space>
            <Button onClick={() => setPreviewOpen(true)}>预览</Button>
            <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>保存草稿</Button>
            {isDraft && id !== 'new' && (
              <Button type="primary" loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
                发布
              </Button>
            )}
          </Space>
        ),
      }}
    >
      <Row gutter={16}>
        <Col span={8}>
          <Card title="AI 生成" size="small" style={{ marginBottom: 16 }}>
            <TextArea
              rows={4}
              placeholder="描述您想要的问卷，如：客户满意度调查，含 NPS 和合同上传"
              value={llmPrompt}
              onChange={(e) => setLlmPrompt(e.target.value)}
              disabled={id === 'new'}
            />
            <Space wrap style={{ margin: '8px 0' }}>
              {promptChips.map((c) => (
                <Button key={c} size="small" onClick={() => setLlmPrompt((p) => (p ? p + '、' + c : c))}>
                  {c}
                </Button>
              ))}
            </Space>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              block
              loading={generateMutation.isPending}
              disabled={id === 'new' || !llmPrompt}
              onClick={() => generateMutation.mutate()}
            >
              生成问卷
            </Button>
            {id === 'new' && <Text type="secondary" style={{ fontSize: 12 }}>请先保存草稿后再使用 AI 生成</Text>}
          </Card>
          <Card title="问卷信息" size="small">
            <Form layout="vertical">
              <Form.Item label="标题">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Form.Item>
              <Form.Item label="说明">
                <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Form.Item>
            </Form>
          </Card>
          <Card title="字段结构" size="small" style={{ marginTop: 16 }} extra={<Button size="small" onClick={addField}>添加字段</Button>}>
            {fields.map((f, idx) => (
              <Card key={f.id} size="small" style={{ marginBottom: 8 }}>
                <Select
                  size="small"
                  style={{ width: '100%', marginBottom: 8 }}
                  value={f.type}
                  options={fieldTypes}
                  onChange={(v) => {
                    const next = [...fields]
                    next[idx] = { ...f, type: v }
                    setFields(next)
                    setHtml(defaultHTML(next))
                  }}
                />
                <Input
                  size="small"
                  value={f.label}
                  onChange={(e) => {
                    const next = [...fields]
                    next[idx] = { ...f, label: e.target.value }
                    setFields(next)
                  }}
                  onBlur={() => setHtml(defaultHTML(fields))}
                />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">必填 </Text>
                  <Switch
                    size="small"
                    checked={!!f.required}
                    onChange={(v) => {
                      const next = [...fields]
                      next[idx] = { ...f, required: v }
                      setFields(next)
                    }}
                  />
                  <Button
                    type="link"
                    danger
                    size="small"
                    onClick={() => {
                      const next = fields.filter((_, i) => i !== idx)
                      setFields(next)
                      setHtml(defaultHTML(next))
                    }}
                  >
                    删除
                  </Button>
                </div>
              </Card>
            ))}
          </Card>
        </Col>
        <Col span={16}>
          <Card title="HTML 预览" size="small">
            <iframe
              title="preview"
              sandbox="allow-forms"
              style={{ width: '100%', height: 520, border: '1px solid #dee0e3', borderRadius: 8 }}
              srcDoc={previewSrcDoc}
            />
          </Card>
        </Col>
      </Row>

      <Drawer title="填写预览" width={720} open={previewOpen} onClose={() => setPreviewOpen(false)}>
        <Text type="secondary">预览模式，不可提交</Text>
        <iframe
          title="preview-drawer"
          sandbox="allow-forms"
          style={{ width: '100%', height: '80vh', border: 'none', marginTop: 16 }}
          srcDoc={previewSrcDoc}
        />
      </Drawer>
    </PageContainer>
  )
}
