/** Canonical consumer tokens (doc 93). Screens must not invent hex values. */
export const AMEALIO_TOKENS = {
  color: {
    navy: '#001D51',
    navyDeep: '#001640',
    blue: '#0B82E6',
    blueDeep: '#096DB8',
    page: '#F4F5FA',
    card: '#FFFFFF',
    text: '#001D51',
    textBody: '#3D3D3D',
    muted: '#5E6675',
    placeholder: '#8B95A4',
    border: '#E3E8F0',
    borderStrong: '#8A94A6',
    disabled: '#D1D1D1',
    error: '#DF031F',
    errorBg: '#FFF4F4',
    warning: '#BF6515',
    warningBg: '#FFF4D6',
    success: '#1B7A3A',
    successBg: '#E8F6EC',
    infoBg: '#D9ECFF',
  },
  font: {
    family: 'Inter',
  },
  radius: {
    sm: '8px',
    md: '12px',
    pill: '999px',
  },
  touch: 44,
} as const;

export const BRAND_NAME = 'amealio';
