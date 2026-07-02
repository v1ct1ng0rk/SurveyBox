import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Upload,
  Result,
  Spin,
  Typography,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import axios, { type AxiosError } from 'axios'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApiError } from '../i18n/hooks'
import { useFillSurveyLocale } from '../i18n/useFillSurveyLocale'

const { Title, Paragraph, Text } = Typography
const { Dragger } = Upload

type Field = {
  id: string
  type: string
  label: string
  required?: boolean
  options?: string[]
}

function getErrorMessage(err: unknown) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error
}

function isEmptyValue(value: unknown) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

export default function FillPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const { t } = useTranslation()
  const apiError = useApiError()
  const { message } = App.useApp()
  const [fileMap, setFileMap] = useState<Record<string, { file_id: string; filename: string }>>({})

  const publicApi = useMemo(
    () =>
      axios.create({
        baseURL: '/api/public',
        headers: { 'X-Share-Token': token || '' },
      }),
    [token],
  )

  const { data: survey, isLoading, error, refetch } = useQuery({
    queryKey: ['fill', token],
    queryFn: async () => (await publicApi.get(`/surveys/${token}`)).data,
    enabled: !!token,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  useFillSurveyLocale(survey?.display_locale)

  const submitMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload: Record<string, unknown> = { ...values }
      Object.entries(fileMap).forEach(([fieldId, f]) => {
        payload[fieldId] = f.file_id
      })
      return publicApi.post('/responses', { answers: payload })
    },
    onSuccess: async () => {
      message.success(t('fillSuccess.title'))
      await refetch()
      navigate(`/f/${token}/success`, { replace: true })
    },
    onError: async (err: unknown) => {
      const axiosErr = err as AxiosError<{ error?: string }>
      const status = axiosErr.response?.status
      if (status === 409) {
        message.info(t('fill.alreadySubmitted'))
        await refetch()
        return
      }
      message.error(apiError(getErrorMessage(err), 'fill.submitFailed'))
    },
  })

  const uploadFile = async (fieldId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('field_id', fieldId)
    try {
      const { data } = await publicApi.post('/files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setFileMap((m) => ({ ...m, [fieldId]: { file_id: data.file_id, filename: data.filename } }))
      form.setFieldValue(fieldId, data.file_id)
      message.success(t('fill.uploadSuccess'))
    } catch (err: unknown) {
      message.error(apiError(getErrorMessage(err), 'fill.submitFailed'))
    }
  }

  const fieldRules = (f: Field) => {
    if (!f.required || f.type === 'section') return []
    return [{
      validator: (_: unknown, value: unknown) => {
        const filled = f.type === 'file'
          ? !isEmptyValue(value) || !!fileMap[f.id]
          : !isEmptyValue(value)
        return filled
          ? Promise.resolve()
          : Promise.reject(new Error(t('fill.fieldRequired', { label: f.label })))
      },
    }]
  }

  if (isLoading) {
    return (
      <div className="public-card public-card--centered">
        <Spin size="large" />
      </div>
    )
  }

  if (error || !survey) {
    const errMsg = getErrorMessage(error)
    const translated = apiError(errMsg)
    const ended = errMsg === '问卷已结束' || translated === t('fill.surveyEnded')
    return (
      <div className="public-card fill-page__result">
        <Result
          status={ended ? 'info' : '404'}
          title={ended ? t('fill.surveyEnded') : t('fill.linkInvalid')}
          subTitle={ended ? t('fill.surveyEndedDesc') : t('fill.linkInvalidDesc')}
        />
      </div>
    )
  }

  if (survey.submitted && !survey.allow_multiple_submit) {
    return (
      <div className="public-card fill-page__result">
        <Result
          status="success"
          title={t('fill.alreadySubmitted')}
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
            void uploadFile(f.id, file)
            return false
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{t('fill.uploadText')}</p>
          {fileMap[f.id] && <p className="ant-upload-hint">{fileMap[f.id].filename}</p>}
        </Dragger>,
      )
    }

    if (f.type === 'textarea') {
      return item(<Input.TextArea rows={4} placeholder={t('fill.inputPlaceholder', { label: f.label })} />)
    }

    if (f.type === 'number') {
      return item(<InputNumber style={{ width: '100%' }} placeholder={t('fill.inputPlaceholder', { label: f.label })} inputMode="decimal" />)
    }

    if (f.type === 'select') {
      return item(
        <Select
          placeholder={t('fill.selectPlaceholder', { label: f.label })}
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

    return item(<Input placeholder={t('fill.inputPlaceholder', { label: f.label })} />)
  }

  return (
    <div className="public-card survey-skin fill-page">
      <div className="fill-page__hero">
        <Text className="fill-page__badge">{t('fill.badge')}</Text>
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
        scrollToFirstError={{ behavior: 'smooth', block: 'center' }}
        requiredMark={(label, { required }) => (
          required ? (
            <>
              {label}
              <span className="fill-page__required">*</span>
            </>
          ) : label
        )}
        onFinish={(values) => submitMutation.mutate(values)}
        onFinishFailed={() => {
          message.warning(t('fill.validationFailed'))
        }}
      >
        {fields.map(renderField)}
        <Form.Item className="fill-page__submit">
          <Button type="primary" htmlType="submit" size="large" block loading={submitMutation.isPending}>
            {submitMutation.isPending ? t('fill.submitting') : t('fill.submit')}
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}
