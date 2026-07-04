import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import {
  Button, Card, Col, DatePicker, Empty, Form, Input, Modal, Result, Row, Select, Space, Tag, Typography, message, Switch, Spin,
} from 'antd'
import { EyeOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '../lib/api'
import { localizeSurveySuccessMessage, localizeSurveyTitle } from '../lib/surveyDefaults'
import { buildPreviewDocument, defaultHTML, type SurveyField, type SurveyTemplateLabels } from '../lib/surveyTemplate'
import { useApiError, useSurveyStatus } from '../i18n/hooks'
import { normalizeSurveyLocale, type AppLocale } from '../i18n'
import PublishSuccessModal from '../components/PublishSuccessModal'

const { TextArea } = Input
const { Text } = Typography

const FIELD_TYPE_KEYS = ['text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'file', 'section'] as const
const PROMPT_CHIP_KEYS = ['chipSatisfaction', 'chipNps', 'chipFile', 'chipMulti'] as const

function buildSurveyPayload(
  fields: SurveyField[],
  title: string,
  description: string,
  html: string,
  labels: SurveyTemplateLabels,
  displayLocale: AppLocale,
  successMessage: string,
  expiresAt: dayjs.Dayjs | null,
) {
  return {
    title,
    description,
    display_locale: displayLocale,
    success_message: successMessage,
    expires_at: expiresAt ? expiresAt.endOf('day').toISOString() : null,
    schema: { version: 1, fields },
    html_template: html || defaultHTML(fields, labels),
  }
}

async function persistSurvey(
  id: string | undefined,
  fields: SurveyField[],
  title: string,
  description: string,
  html: string,
  labels: SurveyTemplateLabels,
  displayLocale: AppLocale,
  successMessage: string,
  expiresAt: dayjs.Dayjs | null,
) {
  const payload = buildSurveyPayload(fields, title, description, html, labels, displayLocale, successMessage, expiresAt)
  if (id === 'new') {
    const { data } = await api.post('/surveys', { locale: displayLocale })
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
  const { t, i18n } = useTranslation()
  const apiError = useApiError()
  const surveyStatus = useSurveyStatus()
  const [fields, setFields] = useState<SurveyField[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [expiresAt, setExpiresAt] = useState<dayjs.Dayjs | null>(null)
  const [html, setHtml] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [llmPrompt, setLlmPrompt] = useState('')
  const [publishSuccessOpen, setPublishSuccessOpen] = useState(false)
  const [publishedId, setPublishedId] = useState<string | null>(null)

  const templateLabels = useMemo<SurveyTemplateLabels>(
    () => ({
      option1: t('template.option1'),
      option2: t('template.option2'),
      inputPlaceholder: t('template.inputPlaceholder'),
      fileUpload: t('template.fileUpload'),
    }),
    [t, i18n.language],
  )

  const fieldTypes = useMemo(
    () => FIELD_TYPE_KEYS.map((value) => ({ value, label: t(`fieldType.${value}`) })),
    [t, i18n.language],
  )

  const promptChips = useMemo(
    () => PROMPT_CHIP_KEYS.map((key) => ({ key, label: t(`surveyEdit.${key}`) })),
    [t, i18n.language],
  )

  const surveyLocale = useMemo(
    () => normalizeSurveyLocale(i18n.language === 'en' ? 'en' : 'zh'),
    [i18n.language],
  )

  const defaultSuccessMessage = useMemo(
    () => t('surveyDefaults.successMessage', { lng: surveyLocale }),
    [t, surveyLocale],
  )

  const { data: survey, isLoading, isError } = useQuery({
    queryKey: ['survey', id],
    queryFn: async () => (await api.get(`/surveys/${id}`)).data,
    enabled: !!id && id !== 'new',
    retry: false,
  })

  useEffect(() => {
    if (!survey) return
    setTitle(localizeSurveyTitle(survey.title, surveyLocale, t))
    setDescription(survey.description)
    setSuccessMessage(localizeSurveySuccessMessage(survey.success_message || '', surveyLocale, t))
    setExpiresAt(survey.expires_at ? dayjs(survey.expires_at) : null)
    const schema = survey.schema || { fields: [] }
    setFields(schema.fields || [])
    setHtml(survey.html_template || '')
    // Only re-sync from server when survey payload changes, not on UI locale switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey])

  useEffect(() => {
    setTitle((prev) => localizeSurveyTitle(prev, surveyLocale, t))
    setSuccessMessage((prev) => localizeSurveySuccessMessage(prev, surveyLocale, t))
  }, [surveyLocale, t])

  const syncHTML = (next: SurveyField[]) => setHtml(defaultHTML(next, templateLabels))

  const saveMutation = useMutation({
    mutationFn: async () => persistSurvey(
      id,
      fields,
      title,
      description,
      html,
      templateLabels,
      surveyLocale,
      successMessage.trim() || defaultSuccessMessage,
      expiresAt,
    ),
    onSuccess: (surveyId) => {
      message.success(t('surveyEdit.saved'))
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
      queryClient.invalidateQueries({ queryKey: ['survey', surveyId] })
      if (id === 'new') navigate(`/surveys/${surveyId}/edit`, { replace: true })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(apiError(msg, 'surveyEdit.saveFailed'))
    },
  })

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/surveys/${id}/generate`, {
        prompt: llmPrompt,
        mode: 'full',
        locale: surveyLocale,
      })
      return data
    },
    onSuccess: (data) => {
      message.success(t('surveyEdit.generateSuccess'))
      if (data.title) setTitle(data.title)
      if (data.description) setDescription(data.description)
      if (data.schema?.fields) setFields(data.schema.fields)
      if (data.html) setHtml(data.html)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(apiError(msg, 'surveyEdit.generateFailed'))
    },
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (fields.length === 0) {
        throw new Error(t('surveyEdit.publishNeedFields'))
      }
      const surveyId = await persistSurvey(
        id,
        fields,
        title,
        description,
        html,
        templateLabels,
        surveyLocale,
        successMessage.trim() || defaultSuccessMessage,
        expiresAt,
      )
      await api.post(`/surveys/${surveyId}/publish`)
      return surveyId
    },
    onSuccess: (surveyId) => {
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
      queryClient.invalidateQueries({ queryKey: ['survey', surveyId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      setPublishedId(surveyId)
      setPublishSuccessOpen(true)
    },
    onError: (err: unknown) => {
      const axiosMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      const msg = axiosMsg
        ? apiError(axiosMsg)
        : (err instanceof Error ? err.message : t('surveyEdit.publishFailed'))
      message.error(msg)
    },
  })

  const previewSrcDoc = useMemo(
    () => buildPreviewDocument(html, fields, templateLabels),
    [html, fields, templateLabels],
  )

  const addField = () => {
    const fid = `field_${Date.now()}`
    const next = [...fields, { id: fid, type: 'text', label: t('surveyEdit.newQuestion'), required: false }]
    setFields(next)
    syncHTML(next)
  }

  if (isLoading && id !== 'new') return <Spin style={{ display: 'block', margin: '100px auto' }} />

  if (isError && id !== 'new') {
    return (
      <PageContainer>
        <Result
          status="404"
          title={t('surveyEdit.notFoundTitle')}
          subTitle={t('surveyEdit.notFoundDesc')}
          extra={(
            <Button type="primary" onClick={() => navigate('/surveys')}>
              {t('surveyEdit.backToList')}
            </Button>
          )}
        />
      </PageContainer>
    )
  }

  if (survey && survey.status !== 'draft') {
    return <Navigate to={`/surveys/${id}`} replace />
  }

  const isDraft = id === 'new' || !survey || survey.status === 'draft'
  const canPublish = isDraft && fields.length > 0
  const statusTag = survey ? surveyStatus(survey.status) : { color: 'default', text: t('surveyStatus.draft') }

  return (
    <PageContainer
      header={{
        title: localizeSurveyTitle(title, surveyLocale, t) || t('surveyEdit.untitled'),
        tags: [<Tag key="s" color={statusTag.color}>{statusTag.text}</Tag>],
        extra: (
          <Space>
            <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)} disabled={fields.length === 0}>
              {t('common.preview')}
            </Button>
            <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{t('surveyEdit.saveDraft')}</Button>
            {canPublish && (
              <Button
                type="primary"
                loading={publishMutation.isPending}
                disabled={saveMutation.isPending}
                onClick={() => publishMutation.mutate()}
              >
                {t('common.publish')}
              </Button>
            )}
          </Space>
        ),
      }}
    >
      <Row gutter={16}>
        <Col xs={24} lg={9}>
          <Card title={t('surveyEdit.aiGenerate')} size="small" style={{ marginBottom: 16 }}>
            <TextArea
              rows={4}
              placeholder={t('surveyEdit.aiPromptPlaceholder')}
              value={llmPrompt}
              onChange={(e) => setLlmPrompt(e.target.value)}
              disabled={id === 'new'}
            />
            <Space wrap style={{ margin: '8px 0' }}>
              {promptChips.map((c) => (
                <Button key={c.key} size="small" onClick={() => setLlmPrompt((p) => (p ? `${p}、${c.label}` : c.label))}>
                  {c.label}
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
              {t('surveyEdit.generateSurvey')}
            </Button>
            {id === 'new' && <Text type="secondary" style={{ fontSize: 12 }}>{t('surveyEdit.saveBeforeAi')}</Text>}
          </Card>
          <Card title={t('surveyEdit.surveyInfo')} size="small">
            <Form layout="vertical">
              <Form.Item label={t('surveyEdit.surveyTitle')}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('surveyEdit.surveyTitlePlaceholder')} />
              </Form.Item>
              <Form.Item label={t('surveyEdit.surveyDesc')}>
                <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('surveyEdit.surveyDescPlaceholder')} />
              </Form.Item>
              <Form.Item label={t('surveyEdit.successMessage')}>
                <TextArea
                  rows={3}
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  placeholder={defaultSuccessMessage}
                />
              </Form.Item>
              <Form.Item label={t('surveyEdit.expiresAt')} extra={t('surveyEdit.expiresAtHint')}>
                <DatePicker
                  style={{ width: '100%' }}
                  value={expiresAt}
                  onChange={setExpiresAt}
                  placeholder={t('surveyEdit.expiresAtPlaceholder')}
                  allowClear
                  disabledDate={(d) => !!d && d < dayjs().startOf('day')}
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card
            title={t('surveyEdit.fieldStructure')}
            size="small"
            extra={<Button size="small" type="primary" onClick={addField}>{t('surveyEdit.addField')}</Button>}
            styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}
          >
            {fields.length === 0 ? (
              <Empty description={t('surveyEdit.emptyFields')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
                    placeholder={t('surveyEdit.fieldTitle')}
                    onChange={(e) => {
                      const next = [...fields]
                      next[idx] = { ...f, label: e.target.value }
                      setFields(next)
                    }}
                    onBlur={() => syncHTML(fields)}
                  />
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('surveyEdit.required')} </Text>
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
                      {t('common.delete')}
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title={t('surveyEdit.previewTitle')}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={760}
        destroyOnClose
      >
        <Text type="secondary">{t('surveyEdit.previewHint')}</Text>
        <iframe
          title="preview-modal"
          sandbox="allow-forms"
          style={{ width: '100%', height: '70vh', border: 'none', marginTop: 16, borderRadius: 8, background: '#f8fafc' }}
          srcDoc={previewSrcDoc}
        />
      </Modal>

      <PublishSuccessModal
        open={publishSuccessOpen}
        title={title || t('surveyEdit.untitled')}
        onShareNow={() => {
          setPublishSuccessOpen(false)
          if (publishedId) navigate(`/surveys/${publishedId}?share=1`)
        }}
        onLater={() => {
          setPublishSuccessOpen(false)
          if (publishedId) navigate(`/surveys/${publishedId}?published=1`)
        }}
      />
    </PageContainer>
  )
}
