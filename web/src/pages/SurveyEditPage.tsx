import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button, Card, Col, Empty, Form, Input, Modal, Result, Row, Select, Space, Tag, Typography, message, Switch, Spin,
} from 'antd'
import { EyeOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { buildPreviewDocument, defaultHTML, type SurveyField } from '../lib/surveyTemplate'

const { TextArea } = Input
const { Text } = Typography

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

function buildSurveyPayload(fields: SurveyField[], title: string, description: string, html: string) {
  return {
    title,
    description,
    schema: { version: 1, fields },
    html_template: html || defaultHTML(fields),
  }
}

async function persistSurvey(id: string | undefined, fields: SurveyField[], title: string, description: string, html: string) {
  const payload = buildSurveyPayload(fields, title, description, html)
  if (id === 'new') {
    const { data } = await api.post('/surveys')
    await api.put(`/surveys/${data.id}`, payload)
    return data.id as string
  }
  await api.put(`/surveys/${id}`, payload)
  return id!
}

export default function SurveyEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [fields, setFields] = useState<SurveyField[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [html, setHtml] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [llmPrompt, setLlmPrompt] = useState('')

  const { data: survey, isLoading, isError } = useQuery({
    queryKey: ['survey', id],
    queryFn: async () => (await api.get(`/surveys/${id}`)).data,
    enabled: !!id && id !== 'new',
    retry: false,
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
    mutationFn: async () => persistSurvey(id, fields, title, description, html),
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
    mutationFn: async () => {
      if (fields.length === 0) {
        throw new Error('请至少添加一个字段后再发布')
      }
      const surveyId = await persistSurvey(id, fields, title, description, html)
      await api.post(`/surveys/${surveyId}/publish`)
      return surveyId
    },
    onSuccess: (surveyId) => {
      message.success('发布成功')
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
      queryClient.invalidateQueries({ queryKey: ['survey', surveyId] })
      navigate(`/surveys/${surveyId}`)
    },
    onError: (err: unknown) => {
      const axiosMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      const msg = axiosMsg || (err instanceof Error ? err.message : '发布失败')
      message.error(msg)
    },
  })

  const previewSrcDoc = useMemo(
    () => buildPreviewDocument(html, fields),
    [html, fields],
  )

  const syncHTML = (next: SurveyField[]) => setHtml(defaultHTML(next))

  const addField = () => {
    const fid = `field_${Date.now()}`
    const next = [...fields, { id: fid, type: 'text', label: '新问题', required: false }]
    setFields(next)
    syncHTML(next)
  }

  if (isLoading && id !== 'new') return <Spin style={{ display: 'block', margin: '100px auto' }} />

  if (isError && id !== 'new') {
    return (
      <PageContainer>
        <Result
          status="404"
          title="问卷不存在"
          subTitle="该问卷可能已删除，或当前账号无权访问。请返回问卷管理重新创建。"
          extra={(
            <Button type="primary" onClick={() => navigate('/surveys')}>
              返回问卷管理
            </Button>
          )}
        />
      </PageContainer>
    )
  }

  const isDraft = id === 'new' || !survey || survey.status === 'draft'
  const canPublish = isDraft && fields.length > 0

  return (
    <PageContainer
      header={{
        title: title || '未命名问卷',
        tags: survey ? [<Tag key="s">{survey.status}</Tag>] : [<Tag key="s">草稿</Tag>],
        extra: (
          <Space>
            <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)} disabled={fields.length === 0}>
              预览
            </Button>
            <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>保存草稿</Button>
            {canPublish && (
              <Button
                type="primary"
                loading={publishMutation.isPending}
                disabled={saveMutation.isPending}
                onClick={() => publishMutation.mutate()}
              >
                发布
              </Button>
            )}
          </Space>
        ),
      }}
    >
      <Row gutter={16}>
        <Col xs={24} lg={9}>
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
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="请输入问卷标题" />
              </Form.Item>
              <Form.Item label="说明">
                <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="向填写者说明问卷目的" />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card
            title="字段结构"
            size="small"
            extra={<Button size="small" type="primary" onClick={addField}>添加字段</Button>}
            styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}
          >
            {fields.length === 0 ? (
              <Empty description="暂无字段，点击右上角添加" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              fields.map((f, idx) => (
                <Card key={f.id} size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: 12 } }}>
                  <Select
                    size="small"
                    style={{ width: '100%', marginBottom: 8 }}
                    value={f.type}
                    options={fieldTypes}
                    onChange={(v) => {
                      const next = [...fields]
                      next[idx] = { ...f, type: v }
                      setFields(next)
                      syncHTML(next)
                    }}
                  />
                  <Input
                    size="small"
                    value={f.label}
                    placeholder="字段标题"
                    onChange={(e) => {
                      const next = [...fields]
                      next[idx] = { ...f, label: e.target.value }
                      setFields(next)
                    }}
                    onBlur={() => syncHTML(fields)}
                  />
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      <Text type="secondary" style={{ fontSize: 12 }}>必填 </Text>
                      <Switch
                        size="small"
                        checked={!!f.required}
                        onChange={(v) => {
                          const next = [...fields]
                          next[idx] = { ...f, required: v }
                          setFields(next)
                        }}
                      />
                    </span>
                    <Button
                      type="link"
                      danger
                      size="small"
                      onClick={() => {
                        const next = fields.filter((_, i) => i !== idx)
                        setFields(next)
                        syncHTML(next)
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="填写预览"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={760}
        destroyOnClose
      >
        <Text type="secondary">预览模式，不可提交</Text>
        <iframe
          title="preview-modal"
          sandbox="allow-forms"
          style={{ width: '100%', height: '70vh', border: 'none', marginTop: 16, borderRadius: 8, background: '#f8fafc' }}
          srcDoc={previewSrcDoc}
        />
      </Modal>
    </PageContainer>
  )
}
