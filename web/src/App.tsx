import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import zhCN from 'antd/locale/zh_CN'
import { buildAntdTheme } from './theme/tokens'
import AdminLayout from './layouts/AdminLayout'
import PublicLayout from './layouts/PublicLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SurveysPage from './pages/SurveysPage'
import SurveyEditPage from './pages/SurveyEditPage'
import SurveyDetailPage from './pages/SurveyDetailPage'
import FillPage from './pages/FillPage'
import FillSuccessPage from './pages/FillSuccessPage'
import ContactsPage from './pages/ContactsPage'
import SettingsPage from './pages/SettingsPage'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN} theme={buildAntdTheme()}>
        <AntApp>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AdminLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/surveys" element={<SurveysPage />} />
                <Route path="/surveys/new" element={<Navigate to="/surveys/new/edit" replace />} />
                <Route path="/surveys/new/edit" element={<SurveyEditPage />} />
                <Route path="/surveys/:id/edit" element={<SurveyEditPage />} />
                <Route path="/surveys/:id" element={<SurveyDetailPage />} />
                <Route path="/contacts" element={<ContactsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route element={<PublicLayout />}>
                <Route path="/f/:token" element={<FillPage />} />
                <Route path="/f/:token/success" element={<FillSuccessPage />} />
              </Route>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  )
}

export default App
