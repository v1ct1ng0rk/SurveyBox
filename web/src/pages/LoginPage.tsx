import { Button, Checkbox, Form, Input, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useApiError } from '../i18n/hooks'
import '../styles/public.css'

const { Title, Paragraph } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const { t } = useTranslation()
  const apiError = useApiError()

  const onFinish = async (values: { username: string; password: string; remember: boolean }) => {
    try {
      const { data } = await api.post('/auth/login', values)
      localStorage.setItem('access_token', data.access_token)
      message.success(t('login.success'))
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(apiError(msg, 'login.invalidCredentials'))
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <Title level={1} style={{ color: '#fff', marginBottom: 16 }}>
          SurveyBox
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18 }}>
          {t('login.tagline')}
        </Paragraph>
        <ul style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 2, marginTop: 32 }}>
          <li>{t('login.feature1')}</li>
          <li>{t('login.feature2')}</li>
          <li>{t('login.feature3')}</li>
        </ul>
      </div>
      <div className="login-form-panel">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <LanguageSwitcher size="small" />
          </div>
          <Title level={3}>{t('login.title')}</Title>
          <Paragraph type="secondary" style={{ marginBottom: 32 }}>
            {t('login.subtitle')}
          </Paragraph>
          <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ remember: true }}>
            <Form.Item name="username" label={t('login.username')} rules={[{ required: true, message: t('login.usernameRequired') }]}>
              <Input size="large" placeholder="admin" />
            </Form.Item>
            <Form.Item name="password" label={t('login.password')} rules={[{ required: true, message: t('login.passwordRequired') }]}>
              <Input.Password size="large" placeholder={t('login.passwordPlaceholder')} />
            </Form.Item>
            <Form.Item name="remember" valuePropName="checked">
              <Checkbox>{t('login.remember')}</Checkbox>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" size="large" block>
                {t('login.submit')}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  )
}
