import type { ReactNode } from 'react'
import { Button } from 'antd'

type ActionLinkProps = {
  children: ReactNode
  onClick?: () => void
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
}

export default function ActionLink({ children, onClick, icon, danger, disabled }: ActionLinkProps) {
  return (
    <Button
      type="link"
      size="small"
      icon={icon}
      danger={danger}
      disabled={disabled}
      onClick={onClick}
      style={{ paddingInline: 0, height: 'auto', minHeight: 32 }}
    >
      {children}
    </Button>
  )
}
