import { Card, Col, Row, Statistic, Button, List, Empty } from 'antd'
import { PlusOutlined, TeamOutlined, SendOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageContainer } from '@ant-design/pro-components'
import api from '../lib/api'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['surveys'],
    queryFn: async () => (await api.get('/surveys')).data,
  })
  const items = data?.items || []
  const published = items.filter((s: { status: string }) => s.status === 'published').length
  const responses = items.reduce((sum: number, s: { response_count: number }) => sum + s.response_count, 0)

  return (
    <PageContainer
      header={{
        title: '工作台',
        subTitle: '掌握问卷动态与快捷操作',
      }}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="问卷总数" value={items.length} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="进行中" value={published} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="总提交数" value={responses} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="待填分享" value={0} /></Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }} title="快捷操作">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/surveys/new/edit')} style={{ marginRight: 8 }}>
          新建问卷
        </Button>
        <Button icon={<TeamOutlined />} onClick={() => navigate('/contacts')} style={{ marginRight: 8 }}>
          联系人管理
        </Button>
        <Button icon={<SendOutlined />} onClick={() => navigate('/surveys')}>
          查看问卷
        </Button>
      </Card>

      <Card style={{ marginTop: 16 }} title="最近问卷">
        {items.length === 0 ? (
          <Empty description="暂无问卷">
            <Button type="primary" onClick={() => navigate('/surveys/new/edit')}>创建第一份问卷</Button>
          </Empty>
        ) : (
          <List
            dataSource={items.slice(0, 5)}
            renderItem={(item: { id: string; title: string; status: string; updated_at: string }) => (
              <List.Item
                actions={[
                  <a key="edit" onClick={() => navigate(`/surveys/${item.id}/edit`)}>编辑</a>,
                ]}
              >
                <List.Item.Meta
                  title={<a onClick={() => navigate(`/surveys/${item.id}/edit`)}>{item.title}</a>}
                  description={<span style={{ color: '#646a73' }}>{item.status} · {new Date(item.updated_at).toLocaleString()}</span>}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </PageContainer>
  )
}
