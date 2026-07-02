import { Button, Modal, Tag, message } from 'antd'
import { ExclamationCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageContainer } from '@ant-design/pro-components'
import api from '../lib/api'

type SurveyItem = {
  id: string
  title: string
  status: string
  share_count: number
  response_count: number
  created_at: string
  updated_at: string
}

const statusMap: Record<string, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  published: { color: 'success', text: '进行中' },
  paused: { color: 'warning', text: '已结束' },
  archived: { color: 'default', text: '已归档' },
}

export default function SurveysPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['surveys'],
    queryFn: async () => (await api.get('/surveys')).data,
  })

  const createMutation = useMutation({
    mutationFn: async () => (await api.post('/surveys')).data,
    onSuccess: (data) => {
      message.success('已创建问卷')
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
      navigate(`/surveys/${data.id}/edit`)
    },
  })

  const closeMutation = useMutation({
    mutationFn: async (surveyId: string) => api.post(`/surveys/${surveyId}/close`),
    onSuccess: () => {
      message.success('问卷已结束，分享链接将无法打开')
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(msg || '操作失败')
    },
  })

  const confirmClose = (item: SurveyItem) => {
    Modal.confirm({
      title: '结束问卷',
      icon: <ExclamationCircleOutlined />,
      content: `确定结束「${item.title}」吗？结束后将不再接收新的回答，已发出的分享链接将无法打开。`,
      okText: '结束',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => closeMutation.mutateAsync(item.id),
    })
  }

  const columns: ProColumns<SurveyItem>[] = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      render: (_, r) => {
        const s = statusMap[r.status] || { color: 'default', text: r.status }
        return <Tag color={s.color}>{s.text}</Tag>
      },
    },
    { title: '分享数', dataIndex: 'share_count', width: 80 },
    { title: '提交数', dataIndex: 'response_count', width: 80 },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      valueType: 'dateTime',
      width: 180,
    },
    {
      title: '操作',
      valueType: 'option',
      width: 220,
      render: (_, r) => [
        <a key="edit" onClick={() => navigate(`/surveys/${r.id}/edit`)}>编辑</a>,
        r.status === 'published' && (
          <a key="close" onClick={() => confirmClose(r)}>结束</a>
        ),
        (r.status === 'published' || r.status === 'paused') && (
          <a key="detail" onClick={() => navigate(`/surveys/${r.id}`)}>详情</a>
        ),
      ],
    },
  ]

  return (
    <PageContainer
      header={{
        title: '问卷管理',
        extra: [
          <Button
            key="new"
            type="primary"
            icon={<PlusOutlined />}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            新建问卷
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
        pagination={{ pageSize: 20 }}
        toolBarRender={false}
      />
    </PageContainer>
  )
}
