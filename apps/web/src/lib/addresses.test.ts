import { describe, expect, it } from 'vitest';
import type { SavedAddress } from './api';
import {
  ADDRESS_COPY,
  addressLoadState,
  applyLabelChip,
  buildAddressWrite,
  cancelDeleteConfirm,
  draftFromAddress,
  emptyAddressDraft,
  formatAddressLines,
  openDeleteConfirm,
  removeAddressFromList,
  selectedLabelChip,
  validateAddressDraft,
} from './addresses';

const home: SavedAddress = {
  id: 'a1',
  label: 'Home',
  line1: '12 MG Road',
  line2: 'Apt 4',
  city: 'Bengaluru',
  state: 'Karnataka',
  pinCode: '560001',
  isDefault: true,
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
};

const work: SavedAddress = {
  ...home,
  id: 'a2',
  label: 'Work',
  line1: '88 Residency',
  isDefault: false,
};

describe('consumer saved addresses (doc 98)', () => {
  it('formats a list line from structured fields', () => {
    expect(formatAddressLines(home)).toBe('12 MG Road, Apt 4, Bengaluru, Karnataka, 560001');
    expect(formatAddressLines({ line1: 'Only line' })).toBe('Only line');
  });

  it('models empty, loading, error, and ready list states', () => {
    expect(
      addressLoadState({ authenticated: false, loading: true, error: null, count: 0 }),
    ).toEqual({ kind: 'unauthenticated', message: ADDRESS_COPY.signIn });
    expect(addressLoadState({ authenticated: true, loading: true, error: null, count: 0 })).toEqual(
      {
        kind: 'loading',
      },
    );
    expect(
      addressLoadState({
        authenticated: true,
        loading: false,
        error: 'Could not load addresses',
        count: 0,
      }),
    ).toEqual({ kind: 'error', message: 'Could not load addresses' });
    expect(
      addressLoadState({ authenticated: true, loading: false, error: null, count: 0 }),
    ).toEqual({
      kind: 'empty',
      message: ADDRESS_COPY.empty,
    });
    expect(
      addressLoadState({ authenticated: true, loading: false, error: null, count: 1 }),
    ).toEqual({
      kind: 'ready',
    });
  });

  it('builds an add payload without userId, lat, or lon', () => {
    const write = buildAddressWrite({
      label: 'Home',
      line1: '  12 MG Road  ',
      line2: '',
      city: 'Bengaluru',
      state: '',
      pinCode: '560001',
      isDefault: true,
    });
    expect(write).toEqual({
      label: 'Home',
      line1: '12 MG Road',
      line2: null,
      city: 'Bengaluru',
      state: null,
      pinCode: '560001',
      isDefault: true,
    });
    expect(write).not.toHaveProperty('userId');
    expect(write).not.toHaveProperty('lat');
    expect(write).not.toHaveProperty('lon');
  });

  it('maps an existing address into an edit draft and write', () => {
    const draft = draftFromAddress(work);
    expect(draft.label).toBe('Work');
    expect(draft.isDefault).toBe(false);
    const write = buildAddressWrite({ ...draft, city: 'Pune', isDefault: true });
    expect(write).toEqual({
      label: 'Work',
      line1: '88 Residency',
      line2: 'Apt 4',
      city: 'Pune',
      state: 'Karnataka',
      pinCode: '560001',
      isDefault: true,
    });
  });

  it('validates line1 and keeps a first-address empty draft valid only after it is filled', () => {
    expect(validateAddressDraft(emptyAddressDraft(true))).toBe(ADDRESS_COPY.line1Required);
    expect(validateAddressDraft({ ...emptyAddressDraft(), line1: '12 MG Road' })).toBeNull();
    expect(buildAddressWrite(emptyAddressDraft())).toEqual({ error: ADDRESS_COPY.line1Required });
  });

  it('writes label chips, including free-text Other', () => {
    expect(selectedLabelChip('Home')).toBe('Home');
    expect(selectedLabelChip('Parents')).toBe('Other');
    expect(selectedLabelChip('')).toBeNull();
    expect(applyLabelChip(emptyAddressDraft(), 'Home').label).toBe('Home');
    expect(applyLabelChip({ ...emptyAddressDraft(), label: 'Home' }, 'Other').label).toBe('');
    expect(applyLabelChip({ ...emptyAddressDraft(), label: 'Parents' }, 'Other').label).toBe(
      'Parents',
    );
  });

  it('requires confirmation before removing a row from the list', () => {
    expect(openDeleteConfirm('a1')).toEqual({ open: true, addressId: 'a1' });
    expect(cancelDeleteConfirm()).toEqual({ open: false, addressId: null });
    expect(removeAddressFromList([home, work], 'a1')).toEqual([work]);
    expect(removeAddressFromList([home, work], 'missing')).toEqual([home, work]);
  });
});
