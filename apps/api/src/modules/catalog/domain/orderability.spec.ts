import {
  appearsOnConsumerMenu,
  isChannelAllowed,
  isConsumerOrderable,
  isConsumerVisible,
} from './orderability';

const base = {
  deletedAt: null,
  isPublished: true,
  availability: 'AVAILABLE' as const,
  channelEnabled: null,
  variants: [{ available: true }],
  groups: [{ available: true, minSelect: 1 }],
};

describe('consumer orderability (Stage B)', () => {
  it('treats unpublished and deleted items as invisible', () => {
    expect(isConsumerVisible({ ...base, isPublished: false })).toBe(false);
    expect(isConsumerVisible({ ...base, deletedAt: new Date() })).toBe(false);
    expect(isConsumerVisible(base)).toBe(true);
  });

  it('keeps sold-out published items visible but not orderable', () => {
    const sold = { ...base, availability: 'SOLDOUT' as const };
    expect(isConsumerVisible(sold)).toBe(true);
    expect(isConsumerOrderable(sold)).toBe(false);
    expect(appearsOnConsumerMenu(sold, 'HOME_DELIVERY')).toBe(true);
  });

  it('hides channel-disabled items from a channel menu and rejects orderability', () => {
    const disabled = { ...base, channelEnabled: false };
    expect(isChannelAllowed(false)).toBe(false);
    expect(appearsOnConsumerMenu(disabled, 'HOME_DELIVERY')).toBe(false);
    expect(appearsOnConsumerMenu(disabled)).toBe(true);
    expect(isConsumerOrderable(disabled)).toBe(false);
  });

  it('rejects items with no available variant or an unavailable required group', () => {
    expect(isConsumerOrderable({ ...base, variants: [{ available: false }] })).toBe(false);
    expect(isConsumerOrderable({ ...base, groups: [{ available: false, minSelect: 1 }] })).toBe(
      false,
    );
    expect(isConsumerOrderable({ ...base, groups: [{ available: false, minSelect: 0 }] })).toBe(
      true,
    );
  });
});
