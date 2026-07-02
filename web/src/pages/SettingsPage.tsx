import { Card, Descriptions } from 'antd'
import { PageContainer } from '@ant-design/pro-components'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await api.get('/config/public')).data,
  })

  return (
    <PageContainer header={{ title: t('settings.title') }}>
      <Card title={t('settings.branding')}>
        <Descriptions column={1}>
          <Descriptions.Item label={t('settings.orgName')}>{config?.org_name}</Descriptions.Item>
          <Descriptions.Item label={t('settings.primaryColor')}>{config?.brand_primary}</Descriptions.Item>
          <Descriptions.Item label={t('settings.logo')}>{config?.org_logo_url || t('common.notConfigured')}</Descriptions.Item>
        </Descriptions>
      </Card>
    </PageContainer>
  )
}
