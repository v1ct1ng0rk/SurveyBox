import { useState, useMemo, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Upload,
  message,
  Result,
  Spin,
  Typography,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import axios from 'axios'
import { useQuery, useMutation } from '@tanstack/react-query'

const { Title, Paragraph, Text } = Typography
const { Dragger } = Upload

type Field = {
  id: string
  type: string
  label: string
  required?: boolean
  options?: string[]
}

function fieldRules(f: Field) {
  if (!f.required || f.type === 'section') return []
  return [{ required: true, message: `请填写${f.label}` }]
}

function getErrorMessage(err: unknown) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error
}

export default function FillPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [fileMap, setFileMap] = useState<Record<string, { file_id: string; filename: string }>>({})

  const publicApi = useMemo(
    () =>
      axios.create({
        baseURL: '/api/public',
        headers: { 'X-Share-Token': token || '' },
      }),
    [token],
  )

  const { data: survey, isLoading, error } = useQuery({
    queryKey: ['fill', token],
    queryFn: async () => (await publicApi.get(`/surveys/${token}`)).data,
    enabled: !!token,
    retry: false,
  })

  const submitMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload: Record<string, unknown> = { ...values }
      Object.entries(fileMap).forEach(([fieldId, f]) => {
        payload[fieldId] = f.file_id
      })
      return publicApi.post('/responses', { answers: payload })
    },
    onSuccess: () => navigate(`/f/${token}/success`),
    onError: (err: unknown) => {
      message.error(getErrorMessage(err) || '提交失败')
    },
  })

  const uploadFile = async (fieldId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('field_id', fieldId)
    const { data } = await publicApi.post('/files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    setFileMap((m) => ({ ...m, [fieldId]: { file_id: data.file_id, filename: data.filename } }))
    form.setFieldValue(fieldId, data.file_id)
    message.success('上传成功')
  }

  if (isLoading) {
    return (
      <div className="public-card public-card--centered">
        <Spin size="large" />
      </div>
    )
  }

  if (error || !survey) {
    const ended = getErrorMessage(error)?.includes('结束')
    return (
      <div className="public-card fill-page__result">
        <Result
          status={ended ? 'info' : '404'}
          title={ended ? '问卷已结束' : '链接已失效'}
          subTitle={ended ? '该问卷已停止收集，如有疑问请联系分享人' : '请确认链接是否正确或联系分享人'}
        />
      </div>
    )
  }

  if (survey.submitted && !survey.allow_multiple_submit) {
    return (
      <div className="public-card fill-page__result">
        <Result
          status="success"
          title="您已提交"
          subTitle={survey.submitted_at ? new Date(survey.submitted_at).toLocaleString() : ''}
        />
      </div>
    )
  }

  const fields: Field[] = survey.schema?.fields || []

  const renderField = (f: Field) => {
    if (f.type === 'section') {
      return (
        <div key={f.id} className="fill-page__field fill-page__field--section">
          <Title level={4} className="fill-page__section">
            {f.label}
          </Title>
        </div>
      )
    }

    const item = (children: ReactNode) => (
      <div key={f.id} className="fill-page__field">
        <Form.Item name={f.id} label={f.label} rules={fieldRules(f)} className="fill-page__form-item">
          {children}
        </Form.Item>
      </div>
    )

    if (f.type === 'file') {
      return item(
        <Dragger
          className="fill-page__upload"
          maxCount={1}
          beforeUpload={(file) => {
            uploadFile(f.id, file)
            return false
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽上传</p>
          {fileMap[f.id] && <p className="ant-upload-hint">{fileMap[f.id].filename}</p>}
        </Dragger>,
      )
    }

    if (f.type === 'textarea') {
      return item(<Input.TextArea rows={4} placeholder={`请输入${f.label}`} />)
    }

    if (f.type === 'number') {
      return item(<InputNumber style={{ width: '100%' }} placeholder={`请输入${f.label}`} inputMode="decimal" />)
    }

    if (f.type === 'select') {
      return item(
        <Select
          placeholder={`请选择${f.label}`}
          options={(f.options || []).map((o) => ({ label: o, value: o }))}
        />,
      )
    }

    if (f.type === 'radio') {
      return item(
        <Radio.Group options={(f.options || []).map((o) => ({ label: o, value: o }))} />,
      )
    }

    if (f.type === 'checkbox') {
      return item(<Checkbox.Group options={f.options || []} />)
    }

    return item(<Input placeholder={`请输入${f.label}`} />)
  }

  return (
    <div className="public-card survey-skin fill-page">
      <div className="fill-page__hero">
        <Text className="fill-page__badge">在线问卷</Text>
        <Title level={2} className="fill-page__title">
          {survey.title}
        </Title>
        {survey.description && (
          <Paragraph className="fill-page__desc">
            {survey.description}
          </Paragraph>
        )}
      </div>

      <Form
        form={form}
        layout="vertical"
        className="fill-page__form"
        requiredMark={(label, { required }) => (
          required ? (
            <>
              {label}
              <span className="fill-page__required">*</span>
            </>
          ) : label
        )}
        onFinish={(values) => submitMutation.mutate(values)}
      >
        {fields.map(renderField)}
        <Form.Item className="fill-page__submit">
          <Button type="primary" htmlType="submit" size="large" block loading={submitMutation.isPending}>
            提交问卷
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}
