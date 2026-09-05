import { SubscriptionConfigService } from './subscription-config.service';

describe('SubscriptionConfigService', () => {
  const svc = new SubscriptionConfigService();

  const config = {
    casual_dining: true,
    fast_food_dining: false,
    hospitality_hotels: true,
    // note: multi_service_business intentionally absent
    casual_dining_status: {
      seating: {
        value: true,
        table_management: {
          value: true,
          table_setup: {
            standard: true,
            floors: [{ floor_number: '1', area: 'Main' }],
            table: [{ table_number: 'T1', pax_value: 4, status: 'AVAILABLE' }],
          },
        },
      },
    },
    an_unknown_future_key: { nested: 'preserved' },
  };

  it('is null/shape-safe and never throws', () => {
    expect(svc.getPath(null, ['a', 'b'])).toBeUndefined();
    expect(svc.getPath(undefined, ['a'])).toBeUndefined();
    expect(svc.getEnabledBusinessTypes(null)).toEqual([]);
    expect(svc.isBusinessTypeEnabled(null, 'casual_dining')).toBe(false);
    expect(svc.getTableSetup(null)).toBeUndefined();
  });

  it('reads CONFIRMED top-level business-type entitlements', () => {
    expect(svc.getEnabledBusinessTypes(config).sort()).toEqual(
      ['casual_dining', 'hospitality_hotels'].sort(),
    );
    expect(svc.isBusinessTypeEnabled(config, 'casual_dining')).toBe(true);
    expect(svc.isBusinessTypeEnabled(config, 'fast_food_dining')).toBe(false);
    expect(svc.isBusinessTypeEnabled(config, 'multi_service_business')).toBe(false);
  });

  it('locates the seating capability gate and raw table_setup (structure preserved)', () => {
    expect(svc.isSeatingEnabled(config, 'casual_dining')).toBe(true);
    expect(svc.isSeatingEnabled(config, 'fast_food_dining')).toBe(false); // absent block
    const ts = svc.getTableSetup(config, 'casual_dining') as Record<string, unknown>;
    expect(ts).toBeDefined();
    expect((ts.floors as unknown[]).length).toBe(1);
    expect((ts.table as Array<{ status: string }>)[0].status).toBe('AVAILABLE');
  });

  it('keeps unknown configuration keys reachable (nothing is dropped)', () => {
    expect(svc.getPath(config, ['an_unknown_future_key', 'nested'])).toBe('preserved');
    // a missing deep path is simply undefined, not an error
    expect(
      svc.getPath(config, ['casual_dining_status', 'seating', 'does_not_exist']),
    ).toBeUndefined();
  });
});
