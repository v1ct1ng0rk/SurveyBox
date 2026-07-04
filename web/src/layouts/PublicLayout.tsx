import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import PublicLayoutBrand from '../components/PublicLayoutBrand'
import '../styles/public.css'

const { Header, Content, Footer } = Layout

export default function PublicLayout() {
  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await api.get('/config/public')).data,
  })

  const orgName = config?.org_name || 'SurveyBox'

  return (
    <Layout className="public-layout">
      <Header className="public-layout__header">
        <PublicLayoutBrand orgName={orgName} orgLogoUrl={config?.org_logo_url} />
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
