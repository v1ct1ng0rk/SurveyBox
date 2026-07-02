import { Select } from 'antd'
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
    <Select<AppLocale>
      size={size}
      className={className}
      value={locale}
      onChange={changeLocale}
      style={{ width: size === 'small' ? 108 : 120 }}
      options={[
        { value: 'zh', label: t('common.zh') },
        { value: 'en', label: t('common.en') },
      ]}
    />
  )
}
