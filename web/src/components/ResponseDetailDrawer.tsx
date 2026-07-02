import { Descriptions, Drawer, Typography } from 'antd'
import { PaperClipOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { AnswerRow } from '../lib/formatAnswers'
import { useDateLocale } from '../i18n/hooks'

const { Text } = Typography

type ResponseItem = {
  id: string
  contact_name: string
  email: string
  company: string
  submitted_at: string
}

type Props = {
  open: boolean
  onClose: () => void
  response: ResponseItem | null
  rows: AnswerRow[]
}

export default function ResponseDetailDrawer({ open, onClose, response, rows }: Props) {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  return (
    <Drawer
      title={t('surveyDetail.responseDetail')}
      open={open}
      onClose={onClose}
      width={520}
      destroyOnClose
    >
      {response && (
        <>
          <Text strong>{response.contact_name}</Text>
          <div style={{ marginBottom: 16, color: '#646a73', fontSize: 13 }}>
            {response.email}
            {response.company ? ` · ${response.company}` : ''}
            <br />
            {new Date(response.submitted_at).toLocaleString(dateLocale)}
          </div>
          <Descriptions column={1} bordered size="small">
            {rows.map((row) => (
              <Descriptions.Item key={row.key} label={row.label}>
                {row.type === 'file' ? (
                  <span>
                    <PaperClipOutlined style={{ marginRight: 6 }} />
                    {row.value}
                  </span>
                ) : (
                  row.value
                )}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </>
      )}
    </Drawer>
  )
}
