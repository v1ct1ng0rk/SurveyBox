export const tokens = {
  brandPrimary: '#1677FF',
  brandPrimaryHover: '#4096FF',
  colorBgLayout: '#F5F7FA',
  colorBgContainer: '#FFFFFF',
  colorText: '#1F2329',
  colorTextSecondary: '#646A73',
  colorBorder: '#DEE0E3',
  borderRadius: 8,
  fontSizeBase: 14,
  fontSizeHeading1: 28,
} as const

export function buildAntdTheme(brandPrimary = tokens.brandPrimary) {
  return {
    token: {
      colorPrimary: brandPrimary,
      borderRadius: tokens.borderRadius,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Inter, system-ui, sans-serif',
      colorBgLayout: tokens.colorBgLayout,
      colorText: tokens.colorText,
      colorTextSecondary: tokens.colorTextSecondary,
    },
    components: {
      Layout: {
        bodyBg: tokens.colorBgLayout,
        headerBg: tokens.colorBgContainer,
        siderBg: tokens.colorBgContainer,
      },
    },
  }
}
