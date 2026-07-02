import { Result } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import axios from 'axios'

export default function FillSuccessPage() {
  const { t } = useTranslation()
  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await axios.get('/api/config/public')).data,
  })

  return (
    <div className="public-card fill-page__result">
      <Result
        status="success"
        title={t('fillSuccess.title')}
        subTitle={
          config?.org_name
            ? t('fillSuccess.thanksOrg', { org: config.org_name })
            : t('fillSuccess.thanks')
        }
      />
    </div>
  )
}
