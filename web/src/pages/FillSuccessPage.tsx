import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Result, Spin } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { useFillSurveyLocale } from '../i18n/useFillSurveyLocale'

export default function FillSuccessPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()

  const publicApi = useMemo(
    () =>
      axios.create({
        baseURL: '/api/public',
        headers: { 'X-Share-Token': token || '' },
      }),
    [token],
  )

  const { data: survey, isLoading } = useQuery({
    queryKey: ['fill', token],
    queryFn: async () => (await publicApi.get(`/surveys/${token}`)).data,
    enabled: !!token,
    retry: false,
  })

  useFillSurveyLocale(survey?.display_locale)

  if (isLoading) {
    return (
      <div className="public-card public-card--centered">
        <Spin size="large" />
      </div>
    )
  }

  const subTitle = survey?.success_message?.trim()
    || t('surveyDefaults.successMessage')

  return (
    <div className="public-card fill-page__result">
      <Result
        status="success"
        title={t('fillSuccess.title')}
        subTitle={subTitle}
      />
    </div>
  )
}
