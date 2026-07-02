import type { AppLocale } from './index'
import { LOCALE_STORAGE_KEY } from './index'

export function detectSystemLocale(): AppLocale {
  const langs = navigator.languages?.length ? [...navigator.languages] : [navigator.language]
  const prefersZh = langs.some((lang) => lang.toLowerCase().startsWith('zh'))
  return prefersZh ? 'zh' : 'en'
}

export function resolveInitialLocale(): AppLocale {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (saved === 'zh' || saved === 'en') return saved
  return detectSystemLocale()
}
