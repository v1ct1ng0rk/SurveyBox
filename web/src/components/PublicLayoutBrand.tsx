import { Typography } from 'antd'

const { Text } = Typography

type PublicLayoutBrandProps = {
  orgName: string
  orgLogoUrl?: string | null
}

export default function PublicLayoutBrand({ orgName, orgLogoUrl }: PublicLayoutBrandProps) {
  if (orgLogoUrl) {
    return <img src={orgLogoUrl} alt={orgName} className="public-layout__logo" />
  }
  return <Text className="public-layout__brand">{orgName}</Text>
}
