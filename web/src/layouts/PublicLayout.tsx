import { Layout, Typography } from 'antd'
import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { tokens } from '../theme/tokens'
import '../styles/public.css'

const { Header, Content, Footer } = Layout
const { Text } = Typography

export default function PublicLayout() {
  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await api.get('/config/public')).data,
  })

  return (
    <Layout className="public-layout" style={{ minHeight: '100vh', background: '#F7F9FC' }}>
      <Header
        style={{
          background: tokens.colorBgContainer,
          borderBottom: `1px solid ${tokens.colorBorder}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
        }}
      >
        {config?.org_logo_url ? (
          <img src={config.org_logo_url} alt="logo" height={28} />
        ) : (
          <Text strong style={{ fontSize: 18 }}>
            {config?.org_name || 'SurveyBox'}
          </Text>
        )}
      </Header>
      <Content style={{ padding: '32px 16px' }}>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: 'center', background: 'transparent', color: tokens.colorTextSecondary }}>
        © {new Date().getFullYear()} {config?.org_name || 'SurveyBox'}
      </Footer>
    </Layout>
  )
}
