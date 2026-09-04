import { isAllowedTransition, isPickupLike, isTerminalStatus } from './order-status-graph';

describe('order-status-graph', () => {
  it('allows the canonical one-hop edges and forbids ON_THE_WAY cancel', () => {
    expect(isAllowedTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(isAllowedTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(isAllowedTransition('ON_THE_WAY', 'DELIVERED')).toBe(true);
    expect(isAllowedTransition('ON_THE_WAY', 'CANCELLED')).toBe(false);
    expect(isAllowedTransition('INITIAL', 'CONFIRMED')).toBe(false);
  });

  it('treats COMPLETED/CANCELLED/RETURNED as terminal', () => {
    expect(isTerminalStatus('COMPLETED')).toBe(true);
    expect(isTerminalStatus('CANCELLED')).toBe(true);
    expect(isTerminalStatus('READY')).toBe(false);
  });

  it('classifies pickup-like types without inventing BUFFET/DRIVE_THRU', () => {
    expect(isPickupLike('TAKE_AWAY')).toBe(true);
    expect(isPickupLike('DINE_IN')).toBe(true);
    expect(isPickupLike('HOME_DELIVERY')).toBe(false);
  });
});
