import type { TFunction } from 'i18next'
import type { AppLocale } from '../i18n'

const FACTORY_TITLES = new Set(['未命名问卷'])
const FACTORY_SUCCESS_MESSAGES = new Set(['感谢您的填写！'])

function localizedUntitled(t: TFunction, locale: AppLocale): string {
  return t('surveyEdit.untitled', { lng: locale })
}

function localizedSuccessMessage(t: TFunction, locale: AppLocale): string {
  return t('surveyDefaults.successMessage', { lng: locale })
}

function isUntitledTitle(title: string, t: TFunction): boolean {
  if (!title || FACTORY_TITLES.has(title)) return true
  return title === localizedUntitled(t, 'zh') || title === localizedUntitled(t, 'en')
}

function isDefaultSuccessMessage(message: string, t: TFunction): boolean {
  if (!message || FACTORY_SUCCESS_MESSAGES.has(message)) return true
  return message === localizedSuccessMessage(t, 'zh') || message === localizedSuccessMessage(t, 'en')
}

export function localizeSurveyTitle(title: string, locale: AppLocale, t: TFunction): string {
  return isUntitledTitle(title, t) ? localizedUntitled(t, locale) : title
}

export function localizeSurveySuccessMessage(message: string, locale: AppLocale, t: TFunction): string {
  return isDefaultSuccessMessage(message, t) ? localizedSuccessMessage(t, locale) : message
}

export function surveyCreateLocale(language: string): AppLocale {
  return language === 'en' ? 'en' : 'zh'
}
