import {
  DashboardOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { ProLayout } from '@ant-design/pro-components'
import { Dropdown, Spin } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

const menuRoutes = [
  { path: '/dashboard', name: '工作台', icon: <DashboardOutlined /> },
  { path: '/surveys', name: '问卷管理', icon: <FileTextOutlined /> },
  { path: '/contacts', name: '联系人', icon: <TeamOutlined /> },
  { path: '/settings', name: '设置', icon: <SettingOutlined /> },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    retry: false,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!user) {
    navigate('/login', { replace: true })
    return null
  }

  return (
    <ProLayout
      title="SurveyBox"
      logo={false}
      layout="mix"
      fixSiderbar
      location={{ pathname: location.pathname }}
      route={{ routes: menuRoutes }}
      menuItemRender={(item, dom) => (
        <a
          onClick={(e) => {
            e.preventDefault()
            navigate(item.path || '/dashboard')
          }}
        >
          {dom}
        </a>
      )}
      avatarProps={{
        title: user.username,
        render: (_, dom) => (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  label: '退出登录',
                  onClick: async () => {
                    await api.post('/auth/logout')
                    localStorage.removeItem('access_token')
                    navigate('/login')
                  },
                },
              ],
            }}
          >
            {dom}
          </Dropdown>
        ),
      }}
      contentStyle={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}
    >
      <Outlet />
    </ProLayout>
  )
}
