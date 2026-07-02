import { Result } from 'antd'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

export default function FillSuccessPage() {
  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await axios.get('/api/config/public')).data,
  })

  return (
    <div className="public-card fill-page__result">
      <Result
        status="success"
        title="提交成功"
        subTitle={config?.org_name ? `感谢您对 ${config.org_name} 的支持` : '感谢您的填写'}
      />
    </div>
  )
}
