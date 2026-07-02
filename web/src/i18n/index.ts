import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh'
import en from './locales/en'
import { resolveInitialLocale } from './detectLocale'

export const LOCALE_STORAGE_KEY = 'surveybox_locale'
export type AppLocale = 'zh' | 'en'

export function normalizeSurveyLocale(value?: string | null): AppLocale {
  return value === 'en' ? 'en' : 'zh'
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: resolveInitialLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
