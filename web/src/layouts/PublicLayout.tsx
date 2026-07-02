import { Layout, Space, Typography } from 'antd'
import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'
import '../styles/public.css'

const { Header, Content, Footer } = Layout
const { Text } = Typography

export default function PublicLayout() {
  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await api.get('/config/public')).data,
  })

  const orgName = config?.org_name || 'SurveyBox'

  return (
    <Layout className="public-layout">
      <Header className="public-layout__header">
        {config?.org_logo_url ? (
          <img src={config.org_logo_url} alt={orgName} className="public-layout__logo" />
        ) : (
          <Text className="public-layout__brand">{orgName}</Text>
        )}
        <Space style={{ marginLeft: 'auto' }}>
          <LanguageSwitcher size="small" />
        </Space>
      </Header>
      <Content className="public-layout__content">
        <Outlet />
      </Content>
      <Footer className="public-layout__footer">
        © {new Date().getFullYear()} {orgName}
      </Footer>
    </Layout>
  )
}
