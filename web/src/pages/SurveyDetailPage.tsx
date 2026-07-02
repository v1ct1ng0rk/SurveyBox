import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert, Button, Space, Table, Tabs, Tag, Typography, message, Modal, DatePicker, Checkbox,
} from 'antd'
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import { useApiError, useDateLocale, useShareStatus, useSurveyStatus } from '../i18n/hooks'
import ResponseAnswerCell from '../components/ResponseAnswerCell'
import ResponseDetailDrawer from '../components/ResponseDetailDrawer'
import ActionLink from '../components/ActionLink'
import { buildAnswerRows, type AnswerFileMeta } from '../lib/formatAnswers'
import dayjs from 'dayjs'

const { Text } = Typography

type ResponseItem = {
  id: string
  contact_name: string
  email: string
  company: string
  answers: Record<string, unknown>
  files?: Record<string, AnswerFileMeta>
  submitted_at: string
}

function normalizeFiles(raw?: Record<string, unknown>): Record<string, AnswerFileMeta> | undefined {
  if (!raw) return undefined
  const out: Record<string, AnswerFileMeta> = {}
  for (const [fieldId, val] of Object.entries(raw)) {
    if (val && typeof val === 'object' && 'filename' in val && 'file_id' in val) {
      out[fieldId] = val as AnswerFileMeta
    }
  }
  return Object.keys(out).length ? out : undefined
}

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const apiError = useApiError()
  const surveyStatus = useSurveyStatus()
  const shareStatus = useShareStatus()
  const dateLocale = useDateLocale()
  const [shareOpen, setShareOpen] = useState(false)
  const [guideDismissed, setGuideDismissed] = useState(false)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [expiresAt, setExpiresAt] = useState<dayjs.Dayjs | null>(null)
  const [shareResult, setShareResult] = useState<Array<{ contact_name: string; fill_url: string }>>([])
  const [detailResponse, setDetailResponse] = useState<ResponseItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { data: survey } = useQuery({
    queryKey: ['survey', id],
    queryFn: async () => (await api.get(`/surveys/${id}`)).data,
  })

  const { data: shares } = useQuery({
    queryKey: ['shares', id],
    queryFn: async () => (await api.get(`/surveys/${id}/shares`)).data,
    enabled: !!id,
  })

  const { data: responses } = useQuery({
    queryKey: ['responses', id],
    queryFn: async () => {
      const { data } = await api.get(`/surveys/${id}/responses`)
      return {
        items: (data.items || []).map((item: ResponseItem & { answers: unknown; files?: Record<string, unknown> }) => ({
          ...item,
          answers: typeof item.answers === 'object' && item.answers ? item.answers as Record<string, unknown> : {},
          files: normalizeFiles(item.files),
        })),
      }
    },
    enabled: !!id,
  })

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => (await api.get('/contacts')).data,
    enabled: shareOpen,
  })

  useEffect(() => {
    if (searchParams.get('share') === '1' && survey?.status === 'published') {
      setShareOpen(true)
      setShareResult([])
      const next = new URLSearchParams(searchParams)
      next.delete('share')
      setSearchParams(next, { replace: true })
    }
  }, [survey?.status, searchParams, setSearchParams])

  const showPublishGuide = useMemo(() => {
    if (guideDismissed || !survey || survey.status !== 'published') return false
    if (searchParams.get('published') === '1') return true
    return (shares?.items?.length ?? 0) === 0 && (responses?.items?.length ?? 0) === 0
  }, [guideDismissed, survey, searchParams, shares, responses])

  useEffect(() => {
    if (searchParams.get('published') === '1') {
      const next = new URLSearchParams(searchParams)
      next.delete('published')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const shareMutation = useMutation({
    mutationFn: async () =>
      api.post(`/surveys/${id}/shares`, {
        contact_ids: selectedContacts,
        expires_at: expiresAt?.toISOString() || null,
      }),
    onSuccess: (res) => {
      message.success(t('surveyDetail.shareSuccess'))
      setShareResult(res.data.items || [])
      setGuideDismissed(true)
      queryClient.invalidateQueries({ queryKey: ['shares', id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(apiError(msg, 'surveyDetail.shareFailed'))
    },
  })

  const renderCopyLink = (url: string, label?: string) => (
    <ActionLink icon={<CopyOutlined />} onClick={() => void copyToClipboard(url)}>
      {label ?? t('common.copyLink')}
    </ActionLink>
  )

  const exportResponses = async () => {
    try {
      const res = await api.get(`/surveys/${id}/responses/export`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${survey?.title || t('surveyDetail.exportFilename')}.zip`
      a.click()
      URL.revokeObjectURL(url)
      message.success(t('surveyDetail.exportSuccess'))
    } catch {
      message.error(t('surveyDetail.exportFailed'))
    }
  }

  const statusTag = survey ? surveyStatus(survey.status) : null
  const detailRows = detailResponse
    ? buildAnswerRows(survey?.schema, detailResponse.answers, detailResponse.files, t)
    : []

  return (
    <PageContainer
      header={{
        title: survey?.title || t('surveyDetail.title'),
        tags: statusTag ? [<Tag key="s" color={statusTag.color}>{statusTag.text}</Tag>] : [],
        extra: (
          <Space>
            {survey?.status === 'draft' && (
              <Button onClick={() => navigate(`/surveys/${id}/edit`)}>{t('common.edit')}</Button>
            )}
            {survey?.status === 'published' && (
              <Button type="primary" onClick={() => { setShareResult([]); setShareOpen(true) }}>
                {t('surveyDetail.batchShare')}
              </Button>
            )}
          </Space>
        ),
      }}
    >
      {showPublishGuide && (
        <Alert
          className="admin-guide-alert"
          type="info"
          showIcon
          closable
          onClose={() => setGuideDismissed(true)}
          message={t('surveyDetail.publishGuideTitle')}
          description={t('surveyDetail.publishGuideDesc')}
          action={(
            <Button size="small" type="primary" onClick={() => { setShareResult([]); setShareOpen(true) }}>
              {t('surveyDetail.publishGuideAction')}
            </Button>
          )}
        />
      )}

      <Tabs
        items={[
          {
            key: 'shares',
            label: t('surveyDetail.shareRecords'),
            children: (
              <Table
                rowKey="id"
                dataSource={shares?.items || []}
                columns={[
                  { title: t('surveyDetail.contact'), dataIndex: 'contact_name' },
                  { title: t('common.email'), dataIndex: 'contact_email' },
                  { title: t('common.company'), dataIndex: 'company' },
                  {
                    title: t('common.status'),
                    dataIndex: 'status',
                    render: (s: string) => <Tag>{shareStatus(s)}</Tag>,
                  },
                  {
                    title: t('surveyDetail.link'),
                    width: 120,
                    render: (_, r: { fill_url: string }) => renderCopyLink(r.fill_url),
                  },
                ]}
              />
            ),
          },
          {
            key: 'responses',
            label: t('surveyDetail.responses'),
            children: (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={exportResponses}
                    disabled={!responses?.items?.length}
                  >
                    {t('surveyDetail.exportZip')}
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  dataSource={responses?.items || []}
                  columns={[
                    { title: t('surveyDetail.contact'), dataIndex: 'contact_name' },
                    { title: t('common.email'), dataIndex: 'email' },
                    { title: t('common.company'), dataIndex: 'company' },
                    {
                      title: t('surveyDetail.submittedAt'),
                      dataIndex: 'submitted_at',
                      render: (val: string) => new Date(val).toLocaleString(dateLocale),
                    },
                    {
                      title: t('surveyDetail.answers'),
                      dataIndex: 'answers',
                      render: (answers: Record<string, unknown>, record: ResponseItem) => (
                        <ResponseAnswerCell
                          schema={survey?.schema}
                          answers={answers}
                          files={record.files}
                          onView={() => {
                            setDetailResponse(record)
                            setDetailOpen(true)
                          }}
                        />
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      <ResponseDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        response={detailResponse}
        rows={detailRows}
      />

      <Modal
        title={t('surveyDetail.batchShareTitle')}
        open={shareOpen}
        onCancel={() => {
          setShareOpen(false)
          setShareResult([])
        }}
        onOk={() => {
          if (shareResult.length > 0) {
            setShareOpen(false)
            setShareResult([])
            return
          }
          shareMutation.mutate()
        }}
        okText={shareResult.length > 0 ? t('common.done') : t('surveyDetail.generateLinks')}
        cancelText={t('common.cancel')}
        confirmLoading={shareMutation.isPending}
        width={640}
      >
        {shareResult.length === 0 ? (
          <>
            <Text type="secondary">{t('surveyDetail.selectContacts')}</Text>
            <div style={{ margin: '16px 0' }}>
              <DatePicker
                placeholder={t('surveyDetail.expiryPlaceholder')}
                style={{ width: '100%', marginBottom: 16 }}
                value={expiresAt}
                onChange={setExpiresAt}
              />
              <Checkbox.Group
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                value={selectedContacts}
                onChange={(v) => setSelectedContacts(v as string[])}
              >
                {(contacts?.items || []).map((c: { id: string; name: string; email: string }) => (
                  <Checkbox key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </div>
          </>
        ) : (
          <Table
            size="small"
            pagination={false}
            dataSource={shareResult}
            rowKey="fill_url"
            columns={[
              { title: t('surveyDetail.contact'), dataIndex: 'contact_name' },
              {
                title: t('surveyDetail.fillLink'),
                dataIndex: 'fill_url',
                ellipsis: true,
                render: (url: string) => (
                  <Text ellipsis={{ tooltip: url }} style={{ maxWidth: 280 }}>
                    {url}
                  </Text>
                ),
              },
              {
                title: t('common.actions'),
                width: 100,
                render: (_, r) => renderCopyLink(r.fill_url, t('common.copy')),
              },
            ]}
          />
        )}
      </Modal>
    </PageContainer>
  )
}
