import { describe, expect, it } from 'vitest';
import { messageFromBody } from './api';
import { formatMinor, isCapturedPayment } from './money';

describe('merchant api helpers', () => {
  it('reads Nest error messages', () => {
    expect(messageFromBody({ message: 'Cross-merchant access denied' }, 'x')).toBe(
      'Cross-merchant access denied',
    );
  });

  it('does not compute refunds — only formats server money', () => {
    expect(formatMinor('10000', 'INR')).toContain('100');
    expect(isCapturedPayment('CAPTURED')).toBe(true);
    expect(isCapturedPayment('PENDING')).toBe(false);
  });
});
