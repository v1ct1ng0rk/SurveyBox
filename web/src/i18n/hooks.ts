import { useTranslation } from 'react-i18next'

export function useApiError() {
  const { t, i18n } = useTranslation()

  return (message?: string, fallbackKey?: string) => {
    if (!message) {
      return fallbackKey ? t(fallbackKey) : ''
    }
    if (i18n.language === 'zh') {
      return message
    }
    const translated = t(`apiErrors.${message}`, { defaultValue: '' })
    return translated || message
  }
}

export function useSurveyStatus() {
  const { t } = useTranslation()
  const colors: Record<string, string> = {
    draft: 'default',
    published: 'success',
    paused: 'warning',
    archived: 'default',
  }

  return (status: string) => ({
    color: colors[status] || 'default',
    text: t(`surveyStatus.${status}`, { defaultValue: status }),
  })
}

export function useShareStatus() {
  const { t } = useTranslation()
  return (status: string) => t(`shareStatus.${status}`, { defaultValue: status })
}

export function useDateLocale() {
  const { i18n } = useTranslation()
  return i18n.language === 'en' ? 'en-US' : 'zh-CN'
}
