import { Button, Checkbox, Form, Input, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import '../styles/public.css'

const { Title, Paragraph } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const onFinish = async (values: { username: string; password: string; remember: boolean }) => {
    try {
      const { data } = await api.post('/auth/login', values)
      localStorage.setItem('access_token', data.access_token)
      message.success('登录成功')
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(msg || '用户名或密码错误')
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <Title level={1} style={{ color: '#fff', marginBottom: 16 }}>
          SurveyBox
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18 }}>
          企业级智能问卷平台
        </Paragraph>
        <ul style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 2, marginTop: 32 }}>
          <li>大模型辅助设计问卷</li>
          <li>批量分享与答卷收集</li>
          <li>安全加密文件存储</li>
        </ul>
      </div>
      <div className="login-form-panel">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <Title level={3}>登录 SurveyBox</Title>
          <Paragraph type="secondary" style={{ marginBottom: 32 }}>
            使用管理员账号登录系统
          </Paragraph>
          <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ remember: true }}>
            <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input size="large" placeholder="admin" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password size="large" placeholder="请输入密码" />
            </Form.Item>
            <Form.Item name="remember" valuePropName="checked">
              <Checkbox>记住我</Checkbox>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" size="large" block>
                登录
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  )
}
