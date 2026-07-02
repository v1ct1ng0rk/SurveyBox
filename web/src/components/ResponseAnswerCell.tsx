import { Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import ActionLink from './ActionLink'
import { buildAnswerRows, summarizeAnswerRows, type AnswerFileMeta, type SurveyField } from '../lib/formatAnswers'

const { Text } = Typography

type Props = {
  schema?: { fields?: SurveyField[] }
  answers: Record<string, unknown>
  files?: Record<string, AnswerFileMeta>
  onView: () => void
}

export default function ResponseAnswerCell({ schema, answers, files, onView }: Props) {
  const { t } = useTranslation()
  const rows = buildAnswerRows(schema, answers, files, t)
  const summary = summarizeAnswerRows(rows, t)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <Text ellipsis={{ tooltip: summary }} style={{ maxWidth: 280 }}>
        {summary}
      </Text>
      <ActionLink onClick={onView}>{t('surveyDetail.viewResponse')}</ActionLink>
    </div>
  )
}
