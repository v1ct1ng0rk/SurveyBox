import type { TFunction } from 'i18next'

export type SurveyField = {
  id: string
  type: string
  label: string
  options?: string[]
}

export type AnswerFileMeta = {
  file_id: string
  filename: string
}

export type AnswerRow = {
  key: string
  label: string
  value: string
  type: string
  fileMeta?: AnswerFileMeta
}

export function formatAnswerValue(
  field: SurveyField,
  value: unknown,
  files: Record<string, AnswerFileMeta> | undefined,
  t: TFunction,
): { text: string; fileMeta?: AnswerFileMeta } {
  if (value == null || value === '') {
    return { text: t('surveyDetail.noAnswer') }
  }

  if (field.type === 'checkbox') {
    if (Array.isArray(value)) return { text: value.join(', ') }
    return { text: String(value) }
  }

  if (field.type === 'file') {
    const fileId = String(value)
    const meta = files?.[field.id] ?? (files?.[fileId] ? files[fileId] : undefined)
    if (meta?.filename) {
      return { text: meta.filename, fileMeta: meta }
    }
    return { text: t('surveyDetail.fileAttached') }
  }

  if (field.type === 'section') {
    return { text: '' }
  }

  return { text: String(value) }
}

export function buildAnswerRows(
  schema: { fields?: SurveyField[] } | undefined,
  answers: Record<string, unknown>,
  files: Record<string, AnswerFileMeta> | undefined,
  t: TFunction,
): AnswerRow[] {
  const fields = schema?.fields ?? []
  return fields
    .filter((f) => f.type !== 'section')
    .map((f) => {
      const { text, fileMeta } = formatAnswerValue(f, answers[f.id], files, t)
      return {
        key: f.id,
        label: f.label,
        value: text,
        type: f.type,
        fileMeta,
      }
    })
}

export function summarizeAnswerRows(rows: AnswerRow[], t: TFunction, max = 2): string {
  if (rows.length === 0) return t('surveyDetail.noAnswer')
  const shown = rows.slice(0, max).map((r) => `${r.label}: ${r.value}`)
  if (rows.length > max) {
    shown.push(t('surveyDetail.moreFields', { count: rows.length - max }))
  }
  return shown.join(' · ')
}
