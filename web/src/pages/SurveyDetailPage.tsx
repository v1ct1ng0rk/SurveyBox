import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button, Space, Table, Tabs, Tag, Typography, message, Modal, DatePicker, Checkbox,
} from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import dayjs from 'dayjs'

const { Text, Paragraph } = Typography

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [shareOpen, setShareOpen] = useState(false)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [expiresAt, setExpiresAt] = useState<dayjs.Dayjs | null>(null)
  const [shareResult, setShareResult] = useState<Array<{ contact_name: string; fill_url: string }>>([])

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
    queryFn: async () => (await api.get(`/surveys/${id}/responses`)).data,
    enabled: !!id,
  })

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => (await api.get('/contacts')).data,
    enabled: shareOpen,
  })

  const shareMutation = useMutation({
    mutationFn: async () =>
      api.post(`/surveys/${id}/shares`, {
        contact_ids: selectedContacts,
        expires_at: expiresAt?.toISOString() || null,
      }),
    onSuccess: (res) => {
      message.success('分享成功')
      setShareResult(res.data.items || [])
      queryClient.invalidateQueries({ queryKey: ['shares', id] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(msg || '分享失败')
    },
  })

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url)
    message.success('链接已复制')
  }

  const exportResponses = async () => {
    try {
      const res = await api.get(`/surveys/${id}/responses/export`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${survey?.title || '问卷'}-答卷.zip`
      a.click()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch {
      message.error('导出失败')
    }
  }

  return (
    <PageContainer
      header={{
        title: survey?.title || '问卷详情',
        tags: survey ? [<Tag key="s">{survey.status}</Tag>] : [],
        extra: (
          <Space>
            {survey?.status === 'draft' && (
              <Button onClick={() => navigate(`/surveys/${id}/edit`)}>编辑</Button>
            )}
            {survey?.status === 'published' && (
              <Button type="primary" onClick={() => { setShareResult([]); setShareOpen(true) }}>
                批量分享
              </Button>
            )}
          </Space>
        ),
      }}
    >
      <Tabs
        items={[
          {
            key: 'shares',
            label: '分享记录',
            children: (
              <Table
                rowKey="id"
                dataSource={shares?.items || []}
                columns={[
                  { title: '联系人', dataIndex: 'contact_name' },
                  { title: '邮箱', dataIndex: 'contact_email' },
                  { title: '公司', dataIndex: 'company' },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    render: (s: string) => <Tag>{s}</Tag>,
                  },
                  {
                    title: '链接',
                    render: (_, r: { fill_url: string }) => (
                      <Button size="small" onClick={() => copyLink(r.fill_url)}>复制链接</Button>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'responses',
            label: '答卷',
            children: (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={exportResponses}
                    disabled={!responses?.items?.length}
                  >
                    导出 ZIP（含附件）
                  </Button>
                </div>
                <Table
                rowKey="id"
                dataSource={responses?.items || []}
                columns={[
                  { title: '联系人', dataIndex: 'contact_name' },
                  { title: '邮箱', dataIndex: 'email' },
                  { title: '公司', dataIndex: 'company' },
                  {
                    title: '提交时间',
                    dataIndex: 'submitted_at',
                    render: (t: string) => new Date(t).toLocaleString(),
                  },
                  {
                    title: '答案',
                    dataIndex: 'answers',
                    render: (a: Record<string, unknown>) => (
                      <Paragraph ellipsis={{ rows: 2 }}>{JSON.stringify(a)}</Paragraph>
                    ),
                  },
                ]}
              />
              </>
            ),
          },
        ]}
      />

      <Modal
        title="批量分享"
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        onOk={() => shareMutation.mutate()}
        confirmLoading={shareMutation.isPending}
        width={640}
      >
        {shareResult.length === 0 ? (
          <>
            <Text type="secondary">选择要分享的联系人</Text>
            <div style={{ margin: '16px 0' }}>
              <DatePicker
                placeholder="截止日期（可选）"
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
              { title: '联系人', dataIndex: 'contact_name' },
              {
                title: '操作',
                render: (_, r) => <Button size="small" onClick={() => copyLink(r.fill_url)}>复制</Button>,
              },
            ]}
          />
        )}
      </Modal>
    </PageContainer>
  )
}
