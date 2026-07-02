import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALE_STORAGE_KEY, normalizeSurveyLocale } from './index'

/** Apply survey-configured locale on public fill pages without persisting to localStorage. */
export function useFillSurveyLocale(displayLocale?: string | null) {
  const { i18n } = useTranslation()
  const locale = normalizeSurveyLocale(displayLocale)

  useEffect(() => {
    if (i18n.language === locale) return
    void i18n.changeLanguage(locale)
  }, [displayLocale, i18n, locale])

  useEffect(() => {
    return () => {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
      const restore = saved === 'en' || saved === 'zh' ? saved : 'zh'
      if (i18n.language !== restore) {
        void i18n.changeLanguage(restore)
      }
    }
  }, [i18n])
}
