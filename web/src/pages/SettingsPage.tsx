import { Card, Descriptions } from 'antd'
import { PageContainer } from '@ant-design/pro-components'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export default function SettingsPage() {
  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await api.get('/config/public')).data,
  })

  return (
    <PageContainer header={{ title: '系统设置' }}>
      <Card title="品牌配置">
        <Descriptions column={1}>
          <Descriptions.Item label="组织名称">{config?.org_name}</Descriptions.Item>
          <Descriptions.Item label="主色">{config?.brand_primary}</Descriptions.Item>
          <Descriptions.Item label="Logo">{config?.org_logo_url || '未配置'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </PageContainer>
  )
}
