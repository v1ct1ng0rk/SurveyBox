import { useState } from 'react'
import { App, Button, Modal, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageContainer } from '@ant-design/pro-components'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { useApiError, useSurveyStatus } from '../i18n/hooks'
import ActionLink from '../components/ActionLink'

type SurveyItem = {
  id: string
  title: string
  status: string
  share_count: number
  response_count: number
  created_at: string
  updated_at: string
}

export default function SurveysPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const apiError = useApiError()
  const surveyStatus = useSurveyStatus()
  const { message } = App.useApp()
  const [deleteTarget, setDeleteTarget] = useState<SurveyItem | null>(null)
  const [closeTarget, setCloseTarget] = useState<SurveyItem | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['surveys'],
    queryFn: async () => (await api.get('/surveys')).data,
  })

  const createMutation = useMutation({
    mutationFn: async () => (await api.post('/surveys')).data,
    onSuccess: (data) => {
      message.success(t('surveys.created'))
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
      navigate(`/surveys/${data.id}/edit`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (surveyId: string) => api.delete(`/surveys/${surveyId}`),
    onSuccess: () => {
      message.success(t('surveys.deleted'))
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(apiError(msg, 'surveys.deleteFailed'))
    },
  })

  const closeMutation = useMutation({
    mutationFn: async (surveyId: string) => api.post(`/surveys/${surveyId}/close`),
    onSuccess: () => {
      message.success(t('surveys.closeSuccess'))
      setCloseTarget(null)
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(apiError(msg, 'surveys.operationFailed'))
    },
  })

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteMutation.mutateAsync(deleteTarget.id)
  }

  const handleClose = async () => {
    if (!closeTarget) return
    await closeMutation.mutateAsync(closeTarget.id)
  }

  const columns: ProColumns<SurveyItem>[] = [
    { title: t('common.title'), dataIndex: 'title', ellipsis: true, minWidth: 160 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      render: (_, r) => {
        const s = surveyStatus(r.status)
        return <Tag color={s.color}>{s.text}</Tag>
      },
    },
    { title: t('surveys.shareCount'), dataIndex: 'share_count', width: 96, align: 'center' },
    { title: t('surveys.responseCount'), dataIndex: 'response_count', width: 112, align: 'center' },
    {
      title: t('common.updatedAt'),
      dataIndex: 'updated_at',
      valueType: 'dateTime',
      width: 176,
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 280,
      render: (_, r) => (
        <div className="admin-table-actions" onClick={(e) => e.stopPropagation()}>
          <ActionLink onClick={() => navigate(`/surveys/${r.id}/edit`)}>{t('common.edit')}</ActionLink>
          {r.status === 'draft' && (
            <ActionLink danger onClick={() => setDeleteTarget(r)}>{t('common.delete')}</ActionLink>
          )}
          {r.status === 'published' && (
            <ActionLink danger onClick={() => setCloseTarget(r)}>{t('common.close')}</ActionLink>
          )}
          {(r.status === 'published' || r.status === 'paused') && (
            <ActionLink onClick={() => navigate(`/surveys/${r.id}`)}>{t('common.detail')}</ActionLink>
          )}
        </div>
      ),
    },
  ]

  return (
    <PageContainer
      header={{
        title: t('surveys.title'),
        extra: [
          <Button
            key="new"
            type="primary"
            icon={<PlusOutlined />}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {t('surveys.newSurvey')}
          </Button>,
        ],
      }}
    >
      <ProTable<SurveyItem>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items || []}
        search={false}
        pagination={{
          pageSize: 20,
          showTotal: (total, range) =>
            t('common.tableTotal', { start: range[0], end: range[1], total }),
        }}
        scroll={{ x: 880 }}
        toolBarRender={false}
      />

      <Modal
        open={deleteTarget !== null}
        title={t('common.delete')}
        centered
        okText={t('common.delete')}
        okType="danger"
        cancelText={t('common.cancel')}
        confirmLoading={deleteMutation.isPending}
        onOk={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        {deleteTarget && t('surveys.confirmDelete', { title: deleteTarget.title })}
      </Modal>

      <Modal
        open={closeTarget !== null}
        title={t('surveys.closeTitle')}
        centered
        okText={t('common.close')}
        okType="danger"
        cancelText={t('common.cancel')}
        confirmLoading={closeMutation.isPending}
        onOk={handleClose}
        onCancel={() => setCloseTarget(null)}
      >
        {closeTarget && t('surveys.closeContent', { title: closeTarget.title })}
      </Modal>
    </PageContainer>
  )
}
