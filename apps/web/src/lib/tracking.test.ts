import { describe, expect, it } from 'vitest';
import { canCancel, isTerminalStatus, orderStatusTone } from './tracking';

describe('consumer order tracking (doc 95)', () => {
  it('allows cancel only before merchant accept', () => {
    expect(canCancel('INITIAL')).toBe(true);
    expect(canCancel('PENDING')).toBe(true);
    expect(canCancel('CONFIRMED')).toBe(false);
    expect(canCancel('ON_THE_WAY')).toBe(false);
  });

  it('treats completed cancelled returned as history terminals', () => {
    expect(isTerminalStatus('COMPLETED')).toBe(true);
    expect(isTerminalStatus('CANCELLED')).toBe(true);
    expect(isTerminalStatus('READY')).toBe(false);
  });

  it('maps named statuses to badge tones without a client machine', () => {
    expect(orderStatusTone('CANCELLED')).toBe('danger');
    expect(orderStatusTone('COMPLETED')).toBe('success');
    expect(orderStatusTone('ON_THE_WAY')).toBe('warning');
    expect(orderStatusTone('PENDING')).toBe('info');
  });
});
