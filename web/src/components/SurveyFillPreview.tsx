import { Layout } from 'antd'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { SurveyField } from '../lib/surveyTemplate'
import PublicLayoutBrand from './PublicLayoutBrand'
import SurveyFillView from './SurveyFillView'

const { Header, Content } = Layout

type SurveyFillPreviewProps = {
  title: string
  description?: string
  fields: SurveyField[]
}

export default function SurveyFillPreview({ title, description, fields }: SurveyFillPreviewProps) {
  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await api.get('/config/public')).data,
  })

  const orgName = config?.org_name || 'SurveyBox'

  return (
    <div className="survey-fill-preview">
      <Layout className="public-layout public-layout--embedded">
        <Header className="public-layout__header">
          <PublicLayoutBrand orgName={orgName} orgLogoUrl={config?.org_logo_url} />
        </Header>
        <Content className="public-layout__content">
          <SurveyFillView
            mode="preview"
            title={title}
            description={description}
            fields={fields}
          />
        </Content>
      </Layout>
    </div>
  )
}
