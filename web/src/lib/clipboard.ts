import { message } from 'antd'
import i18n from '../i18n'

export async function copyToClipboard(text: string, successMsg?: string) {
  const copied = successMsg ?? i18n.t('clipboard.copied')
  const empty = i18n.t('clipboard.empty')
  const failed = i18n.t('clipboard.failed')

  if (!text) {
    message.warning(empty)
    return false
  }

  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.top = '0'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (!ok) throw new Error('execCommand failed')
    }
    message.success(copied)
    return true
  } catch {
    message.error(failed)
    return false
  }
}
