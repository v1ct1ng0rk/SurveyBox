import { Modal, Typography } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Paragraph } = Typography

type Props = {
  open: boolean
  title: string
  onShareNow: () => void
  onLater: () => void
}

export default function PublishSuccessModal({ open, title, onShareNow, onLater }: Props) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      title={(
        <span>
          <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          {t('publishSuccess.title')}
        </span>
      )}
      onCancel={onLater}
      onOk={onShareNow}
      okText={t('publishSuccess.shareNow')}
      cancelText={t('publishSuccess.later')}
      centered
    >
      <Paragraph>{t('publishSuccess.desc', { title })}</Paragraph>
    </Modal>
  )
}
