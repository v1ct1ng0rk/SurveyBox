import { Card, Col, Row, Statistic, Button, List, Empty, Tag } from 'antd'
import { PlusOutlined, TeamOutlined, SendOutlined, ShareAltOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageContainer } from '@ant-design/pro-components'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { useDateLocale, useSurveyStatus } from '../i18n/hooks'
import ActionLink from '../components/ActionLink'
import { tokens } from '../theme/tokens'

type SurveyListItem = {
  id: string
  title: string
  status: string
  share_count: number
  response_count: number
  updated_at: string
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const surveyStatus = useSurveyStatus()

  const { data: summary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => (await api.get('/dashboard/summary')).data,
  })

  const { data: surveysData } = useQuery({
    queryKey: ['surveys'],
    queryFn: async () => (await api.get('/surveys')).data,
  })

  const items: SurveyListItem[] = surveysData?.items || []

  return (
    <PageContainer
      header={{
        title: t('dashboard.title'),
        subTitle: t('dashboard.subtitle'),
      }}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="admin-stat-card">
            <Statistic title={t('dashboard.totalSurveys')} value={summary?.total_surveys ?? items.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="admin-stat-card">
            <Statistic
              title={t('dashboard.activeSurveys')}
              value={summary?.active_surveys ?? 0}
              valueStyle={{ color: tokens.brandPrimary }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="admin-stat-card">
            <Statistic
              title={t('dashboard.totalResponses')}
              value={summary?.total_responses ?? 0}
              valueStyle={{ color: tokens.colorSuccess }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="admin-stat-card">
            <Statistic title={t('dashboard.pendingShares')} value={summary?.pending_shares ?? 0} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }} title={t('dashboard.quickActions')}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/surveys/new/edit')} style={{ marginRight: 8 }}>
          {t('dashboard.newSurvey')}
        </Button>
        <Button icon={<TeamOutlined />} onClick={() => navigate('/contacts')} style={{ marginRight: 8 }}>
          {t('dashboard.manageContacts')}
        </Button>
        <Button icon={<SendOutlined />} onClick={() => navigate('/surveys')}>
          {t('dashboard.viewSurveys')}
        </Button>
      </Card>

      <Card style={{ marginTop: 16 }} title={t('dashboard.recentSurveys')}>
        {items.length === 0 ? (
          <Empty description={t('dashboard.empty')}>
            <Button type="primary" onClick={() => navigate('/surveys/new/edit')}>{t('dashboard.createFirst')}</Button>
          </Empty>
        ) : (
          <List
            dataSource={items.slice(0, 5)}
            renderItem={(item) => {
              const status = surveyStatus(item.status)
              const needsShare = item.status === 'published' && item.share_count === 0
              return (
                <List.Item
                  actions={[
                    <div key="actions" className="admin-table-actions">
                      <ActionLink onClick={() => navigate(`/surveys/${item.id}/edit`)}>{t('common.edit')}</ActionLink>
                      {item.status === 'published' && (
                        <ActionLink icon={<ShareAltOutlined />} onClick={() => navigate(`/surveys/${item.id}?share=1`)}>
                          {t('dashboard.share')}
                        </ActionLink>
                      )}
                      {(item.status === 'published' || item.status === 'paused') && (
                        <ActionLink onClick={() => navigate(`/surveys/${item.id}`)}>{t('common.detail')}</ActionLink>
                      )}
                    </div>,
                  ]}
                >
                  <List.Item.Meta
                    title={<a onClick={() => navigate(`/surveys/${item.id}/edit`)}>{item.title}</a>}
                    description={(
                      <span style={{ color: tokens.colorTextSecondary }}>
                        <Tag color={status.color} style={{ marginRight: 8 }}>{status.text}</Tag>
                        {needsShare && <Tag color="warning">{t('dashboard.pendingShareTag')}</Tag>}
                        {new Date(item.updated_at).toLocaleString(dateLocale)}
                      </span>
                    )}
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Card>
    </PageContainer>
  )
}
