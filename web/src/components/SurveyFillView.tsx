import { useEffect, type ReactNode } from 'react'
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
  Typography,
} from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import { useTranslation } from 'react-i18next'
import type { SurveyField } from '../lib/surveyTemplate'
import '../styles/public.css'

const { Title, Paragraph, Text } = Typography
const { Dragger } = Upload

export const MAX_FILES_PER_FIELD = 10

export type UploadedFile = {
  file_id: string
  filename: string
}

type SurveyFillViewProps = {
  title: string
  description?: string
  fields: SurveyField[]
  mode: 'fill' | 'preview'
  submitting?: boolean
  fileMap?: Record<string, UploadedFile[]>
  onSubmit?: (values: Record<string, unknown>) => void
  onUpload?: (fieldId: string, file: File) => void | Promise<void>
  onRemoveFile?: (fieldId: string, fileId: string) => void | Promise<void>
}

function isEmptyValue(value: unknown) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function fileIdsFromItems(items: UploadedFile[]) {
  return items.map((f) => f.file_id)
}

export default function SurveyFillView({
  title,
  description,
  fields,
  mode,
  submitting = false,
  fileMap = {},
  onSubmit,
  onUpload,
  onRemoveFile,
}: SurveyFillViewProps) {
  const [form] = Form.useForm()
  const { t } = useTranslation()
  const { message } = App.useApp()
  const isPreview = mode === 'preview'

  useEffect(() => {
    if (isPreview) return
    Object.entries(fileMap).forEach(([fieldId, items]) => {
      form.setFieldValue(fieldId, fileIdsFromItems(items))
    })
  }, [fileMap, form, isPreview])

  const fieldRules = (f: SurveyField) => {
    if (isPreview || !f.required || f.type === 'section') return []
    return [{
      validator: (_: unknown, value: unknown) => {
        const filled = f.type === 'file'
          ? (fileMap[f.id]?.length ?? 0) > 0 || !isEmptyValue(value)
          : !isEmptyValue(value)
        return filled
          ? Promise.resolve()
          : Promise.reject(new Error(t('fill.fieldRequired', { label: f.label })))
      },
    }]
  }

  const renderField = (f: SurveyField) => {
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
      const uploaded = fileMap[f.id] ?? []
      const fileList: UploadFile[] = uploaded.map((file) => ({
        uid: file.file_id,
        name: file.filename,
        status: 'done',
      }))
      return item(
        <Dragger
          className="fill-page__upload"
          multiple
          disabled={isPreview}
          maxCount={MAX_FILES_PER_FIELD}
          fileList={isPreview ? [] : fileList}
          beforeUpload={(file) => {
            if (isPreview || !onUpload) return false
            void onUpload(f.id, file)
            return false
          }}
          onRemove={(file) => {
            if (isPreview || !onRemoveFile) return false
            void onRemoveFile(f.id, file.uid)
            return false
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{t('fill.uploadText')}</p>
          <p className="ant-upload-hint">{t('fill.uploadMultiHint', { count: MAX_FILES_PER_FIELD })}</p>
        </Dragger>,
      )
    }

    if (f.type === 'textarea') {
      return item(<Input.TextArea rows={4} disabled={isPreview} placeholder={t('fill.inputPlaceholder', { label: f.label })} />)
    }

    if (f.type === 'number') {
      return item(
        <InputNumber
          style={{ width: '100%' }}
          disabled={isPreview}
          placeholder={t('fill.inputPlaceholder', { label: f.label })}
          inputMode="decimal"
        />,
      )
    }

    if (f.type === 'select') {
      return item(
        <Select
          disabled={isPreview}
          placeholder={t('fill.selectPlaceholder', { label: f.label })}
          options={(f.options || []).map((o) => ({ label: o, value: o }))}
        />,
      )
    }

    if (f.type === 'radio') {
      return item(
        <Radio.Group disabled={isPreview} options={(f.options || []).map((o) => ({ label: o, value: o }))} />,
      )
    }

    if (f.type === 'checkbox') {
      return item(<Checkbox.Group disabled={isPreview} options={f.options || []} />)
    }

    return item(<Input disabled={isPreview} placeholder={t('fill.inputPlaceholder', { label: f.label })} />)
  }

  return (
    <div className="public-card survey-skin fill-page">
      <div className="fill-page__hero">
        <Text className="fill-page__badge">{t('fill.badge')}</Text>
        <Title level={2} className="fill-page__title">
          {title}
        </Title>
        {description && (
          <Paragraph className="fill-page__desc">
            {description}
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
        onFinish={(values) => onSubmit?.(values)}
        onFinishFailed={() => {
          if (!isPreview) {
            message.warning(t('fill.validationFailed'))
          }
        }}
      >
        {fields.map(renderField)}
        <Form.Item className="fill-page__submit">
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            disabled={isPreview}
            loading={submitting}
          >
            {submitting ? t('fill.submitting') : t('fill.submit')}
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}
