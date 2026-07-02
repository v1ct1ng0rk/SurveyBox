import { Segmented } from 'antd'
import { useTranslation } from 'react-i18next'
import { LOCALE_STORAGE_KEY, type AppLocale } from '../i18n'

type Props = {
  size?: 'small' | 'middle'
  className?: string
}

export default function LanguageSwitcher({ size = 'middle', className }: Props) {
  const { t, i18n } = useTranslation()
  const locale = (i18n.language === 'en' ? 'en' : 'zh') as AppLocale

  const changeLocale = (value: AppLocale) => {
    void i18n.changeLanguage(value)
    localStorage.setItem(LOCALE_STORAGE_KEY, value)
  }

  return (
    <Segmented<AppLocale>
      className={className}
      size={size === 'small' ? 'small' : 'middle'}
      value={locale}
      onChange={changeLocale}
      options={[
        { value: 'zh', label: t('common.zh') },
        { value: 'en', label: t('common.en') },
      ]}
    />
  )
}
