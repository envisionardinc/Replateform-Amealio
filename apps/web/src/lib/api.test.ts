import { describe, expect, it } from 'vitest';
import { messageFromBody } from './api';
import { formatMinor } from './money';

describe('messageFromBody', () => {
  it('prefers Nest message strings and arrays', () => {
    expect(messageFromBody({ message: 'Item is not available for checkout' }, 'x')).toBe(
      'Item is not available for checkout',
    );
    expect(messageFromBody({ message: ['restaurantId must be a UUID'] }, 'x')).toBe(
      'restaurantId must be a UUID',
    );
    expect(messageFromBody({ error: 'Not Found' }, 'x')).toBe('Not Found');
    expect(messageFromBody(null, 'Request failed')).toBe('Request failed');
  });
});

describe('formatMinor', () => {
  it('formats server paise strings without trusting client totals', () => {
    expect(formatMinor('24900', 'INR')).toContain('249');
    expect(formatMinor('10000', 'INR')).toContain('100');
  });
});
