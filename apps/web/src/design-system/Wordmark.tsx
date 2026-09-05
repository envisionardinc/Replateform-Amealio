import { BRAND_NAME } from './tokens';

export function Wordmark({ invert = false }: { invert?: boolean }) {
  return <span className={invert ? 'wordmark wordmark-invert' : 'wordmark'}>{BRAND_NAME}</span>;
}
