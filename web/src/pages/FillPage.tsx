import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Form, Input, Upload, message, Result, Spin, Typography } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import axios from 'axios'
import { useQuery, useMutation } from '@tanstack/react-query'

const { Title, Paragraph } = Typography
const { Dragger } = Upload

type Field = { id: string; type: string; label: string; required?: boolean }

export default function FillPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
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
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...answers }
      Object.entries(fileMap).forEach(([fieldId, f]) => {
        payload[fieldId] = f.file_id
      })
      return publicApi.post('/responses', { answers: payload })
    },
    onSuccess: () => navigate(`/f/${token}/success`),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(msg || '提交失败')
    },
  })

  const uploadFile = async (fieldId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('field_id', fieldId)
    const { data } = await publicApi.post('/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    setFileMap((m) => ({ ...m, [fieldId]: { file_id: data.file_id, filename: data.filename } }))
    message.success('上传成功')
  }

  if (isLoading) {
    return (
      <div className="public-card" style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error || !survey) {
    return (
      <div className="public-card">
        <Result status="404" title="链接已失效" subTitle="请确认链接是否正确或联系分享人" />
      </div>
    )
  }

  if (survey.submitted && !survey.allow_multiple_submit) {
    return (
      <div className="public-card">
        <Result status="success" title="您已提交" subTitle={survey.submitted_at ? new Date(survey.submitted_at).toLocaleString() : ''} />
      </div>
    )
  }

  const fields: Field[] = survey.schema?.fields || []

  return (
    <div className="public-card survey-skin">
      <Title level={2}>{survey.title}</Title>
      {survey.description && <Paragraph type="secondary">{survey.description}</Paragraph>}

      <Form layout="vertical" onFinish={() => submitMutation.mutate()}>
        {fields.map((f) => {
          if (f.type === 'section') {
            return <Title key={f.id} level={4}>{f.label}</Title>
          }
          if (f.type === 'file') {
            return (
              <Form.Item key={f.id} label={f.label} required={f.required}>
                <Dragger
                  maxCount={1}
                  beforeUpload={(file) => {
                    uploadFile(f.id, file)
                    return false
                  }}
                >
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p>点击或拖拽上传</p>
                  {fileMap[f.id] && <p>{fileMap[f.id].filename}</p>}
                </Dragger>
              </Form.Item>
            )
          }
          if (f.type === 'textarea') {
            return (
              <Form.Item key={f.id} label={f.label} required={f.required}>
                <Input.TextArea
                  rows={4}
                  onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))}
                />
              </Form.Item>
            )
          }
          return (
            <Form.Item key={f.id} label={f.label} required={f.required}>
              <Input onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))} />
            </Form.Item>
          )
        })}
        <Button type="primary" htmlType="submit" size="large" block loading={submitMutation.isPending}>
          提交
        </Button>
      </Form>
    </div>
  )
}
