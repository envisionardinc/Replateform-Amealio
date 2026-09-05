const CANCELABLE = new Set(['INITIAL', 'PENDING']);
const TERMINAL = new Set(['COMPLETED', 'CANCELLED', 'RETURNED']);

export function canCancel(status: string): boolean {
  return CANCELABLE.has(status);
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL.has(status);
}

export function orderStatusTone(
  status: string,
): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger';
  if (status === 'DELIVERED' || status === 'COMPLETED') return 'success';
  if (status === 'ON_THE_WAY') return 'warning';
  if (status === 'PENDING' || status === 'CONFIRMED' || status === 'READY') return 'info';
  return 'neutral';
}
