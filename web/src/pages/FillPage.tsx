import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Result, Spin } from 'antd'
import axios, { type AxiosError } from 'axios'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApiError } from '../i18n/hooks'
import { useFillSurveyLocale } from '../i18n/useFillSurveyLocale'
import SurveyFillView, { MAX_FILES_PER_FIELD, type UploadedFile } from '../components/SurveyFillView'

function getErrorMessage(err: unknown) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error
}

function fileIdsFromItems(items: UploadedFile[]) {
  return items.map((f) => f.file_id)
}

export default function FillPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const apiError = useApiError()
  const { message } = App.useApp()
  const [fileMap, setFileMap] = useState<Record<string, UploadedFile[]>>({})

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

  const syncFieldFiles = (fieldId: string, items: UploadedFile[]) => {
    setFileMap((m) => ({ ...m, [fieldId]: items }))
  }

  const submitMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload: Record<string, unknown> = { ...values }
      Object.entries(fileMap).forEach(([fieldId, items]) => {
        if (items.length > 0) {
          payload[fieldId] = fileIdsFromItems(items)
        }
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
    const current = fileMap[fieldId] ?? []
    if (current.length >= MAX_FILES_PER_FIELD) {
      message.warning(t('fill.uploadLimit', { count: MAX_FILES_PER_FIELD }))
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('field_id', fieldId)
    try {
      const { data } = await publicApi.post('/files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      syncFieldFiles(fieldId, [...current, { file_id: data.file_id, filename: data.filename }])
      message.success(t('fill.uploadSuccess'))
    } catch (err: unknown) {
      message.error(apiError(getErrorMessage(err), 'fill.submitFailed'))
    }
  }

  const removeFile = async (fieldId: string, fileId: string) => {
    try {
      await publicApi.delete(`/files/${fileId}`)
      syncFieldFiles(fieldId, (fileMap[fieldId] ?? []).filter((f) => f.file_id !== fileId))
    } catch (err: unknown) {
      message.error(apiError(getErrorMessage(err), 'fill.submitFailed'))
    }
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
    const expired = errMsg === '问卷已截止' || translated === t('fill.surveyExpired')
    return (
      <div className="public-card fill-page__result">
        <Result
          status={ended || expired ? 'info' : '404'}
          title={
            ended ? t('fill.surveyEnded')
              : expired ? t('fill.surveyExpired')
                : t('fill.linkInvalid')
          }
          subTitle={
            ended ? t('fill.surveyEndedDesc')
              : expired ? t('fill.surveyExpiredDesc')
                : t('fill.linkInvalidDesc')
          }
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

  const fields = survey.schema?.fields || []

  return (
    <SurveyFillView
      mode="fill"
      title={survey.title}
      description={survey.description}
      fields={fields}
      fileMap={fileMap}
      submitting={submitMutation.isPending}
      onSubmit={(values) => submitMutation.mutate(values)}
      onUpload={uploadFile}
      onRemoveFile={removeFile}
    />
  )
}
