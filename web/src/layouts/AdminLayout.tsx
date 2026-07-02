import { useEffect, useMemo } from 'react'
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
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'
import '../styles/admin.css'

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const menuRoutes = useMemo(
    () => [
      { path: '/dashboard', name: t('nav.dashboard'), icon: <DashboardOutlined /> },
      { path: '/surveys', name: t('nav.surveys'), icon: <FileTextOutlined /> },
      { path: '/contacts', name: t('nav.contacts'), icon: <TeamOutlined /> },
      { path: '/settings', name: t('nav.settings'), icon: <SettingOutlined /> },
    ],
    [t, i18n.language],
  )

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      navigate('/login', { replace: true })
    }
  }, [isLoading, isError, user, navigate])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (isError || !user) {
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
      actionsRender={() => (
        <div className="admin-header-lang">
          <LanguageSwitcher size="small" className="admin-language-switcher" />
        </div>
      )}
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
                  label: t('nav.logout'),
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
      <div className="admin-page">
        <Outlet />
      </div>
    </ProLayout>
  )
}
