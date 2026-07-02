import { useEffect, type ReactNode } from 'react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/en'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { buildAntdTheme } from '../theme/tokens'
import type { AppLocale } from './index'
import api from '../lib/api'

const antdLocales = { zh: zhCN, en: enUS } as const
const dayjsLocales = { zh: 'zh-cn', en: 'en' } as const

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const locale = (i18n.language === 'en' ? 'en' : 'zh') as AppLocale

  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await api.get('/config/public')).data,
  })

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    dayjs.locale(dayjsLocales[locale])
  }, [locale])

  return (
    <ConfigProvider locale={antdLocales[locale]} theme={buildAntdTheme(config?.brand_primary)}>
      {children}
    </ConfigProvider>
  )
}
