import { describe, expect, it } from 'vitest';
import { merchantActions } from './transitions';

describe('merchantActions', () => {
  it('offers accept/reject on pending and assign only at unassigned READY delivery', () => {
    const pending = merchantActions({
      status: 'PENDING',
      type: 'HOME_DELIVERY',
      deliveryPersonId: null,
    });
    expect(pending.map((a) => a.toStatus)).toContain('CONFIRMED');
    expect(pending.map((a) => a.toStatus)).toContain('CANCELLED');

    const ready = merchantActions({
      status: 'READY',
      type: 'HOME_DELIVERY',
      deliveryPersonId: null,
    });
    expect(ready.some((a) => a.kind === 'assign')).toBe(true);
    expect(ready.some((a) => a.toStatus === 'COMPLETED')).toBe(false);

    const handed = merchantActions({
      status: 'READY',
      type: 'HOME_DELIVERY',
      deliveryPersonId: 'rider-1',
    });
    expect(handed.some((a) => a.kind === 'rider')).toBe(true);
    expect(handed.some((a) => a.kind === 'assign')).toBe(false);
  });
});
