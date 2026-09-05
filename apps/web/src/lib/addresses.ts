import type { SavedAddress, SavedAddressWrite } from './api';

export const ADDRESS_LABEL_CHIPS = ['Home', 'Work', 'Other'] as const;
export type AddressLabelChip = (typeof ADDRESS_LABEL_CHIPS)[number];

export const ADDRESS_COPY = {
  title: 'Saved addresses',
  lede: 'Your address book. These do not change checkout, delivery, or map location.',
  signIn: 'Sign in to view and edit saved addresses.',
  empty: 'No saved addresses yet.',
  saved: 'Address saved.',
  deleted: 'Address deleted.',
  line1Required: 'Address line is required.',
  deleteTitle: 'Delete this saved address?',
  deleteConfirm: 'Delete',
  deleteCancel: 'Cancel',
  add: 'Add address',
  edit: 'Edit address',
  defaultBadge: 'Default',
  defaultLabel: 'Default address',
} as const;

export type AddressDraft = {
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pinCode: string;
  isDefault: boolean;
};

export type AddressLoadState =
  | { kind: 'unauthenticated'; message: string }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; message: string }
  | { kind: 'ready' };

export type DeleteConfirmState = {
  open: boolean;
  addressId: string | null;
};

export function emptyAddressDraft(isDefault = false): AddressDraft {
  return {
    label: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pinCode: '',
    isDefault,
  };
}

export function draftFromAddress(address: SavedAddress): AddressDraft {
  return {
    label: address.label ?? '',
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city ?? '',
    state: address.state ?? '',
    pinCode: address.pinCode ?? '',
    isDefault: address.isDefault,
  };
}

export function selectedLabelChip(label: string): AddressLabelChip | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  if (trimmed === 'Home' || trimmed === 'Work') return trimmed;
  return 'Other';
}

export function applyLabelChip(draft: AddressDraft, chip: AddressLabelChip): AddressDraft {
  if (chip === 'Other') {
    const current = selectedLabelChip(draft.label);
    return { ...draft, label: current === 'Other' ? draft.label : 'Other' };
  }
  return { ...draft, label: chip };
}

export function formatAddressLines(address: {
  line1: string;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
}): string {
  return [address.line1, address.line2, address.city, address.state, address.pinCode]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

export function validateAddressDraft(draft: AddressDraft): string | null {
  if (!draft.line1.trim()) return ADDRESS_COPY.line1Required;
  return null;
}

export function buildAddressWrite(draft: AddressDraft): SavedAddressWrite | { error: string } {
  const error = validateAddressDraft(draft);
  if (error) return { error };
  const nullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };
  return {
    label: nullable(draft.label),
    line1: draft.line1.trim(),
    line2: nullable(draft.line2),
    city: nullable(draft.city),
    state: nullable(draft.state),
    pinCode: nullable(draft.pinCode),
    isDefault: draft.isDefault,
  };
}

export function addressLoadState(input: {
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  count: number;
}): AddressLoadState {
  if (!input.authenticated) return { kind: 'unauthenticated', message: ADDRESS_COPY.signIn };
  if (input.loading) return { kind: 'loading' };
  if (input.error) return { kind: 'error', message: input.error };
  if (input.count === 0) return { kind: 'empty', message: ADDRESS_COPY.empty };
  return { kind: 'ready' };
}

export function openDeleteConfirm(addressId: string): DeleteConfirmState {
  return { open: true, addressId };
}

export function cancelDeleteConfirm(): DeleteConfirmState {
  return { open: false, addressId: null };
}

export function removeAddressFromList(rows: SavedAddress[], addressId: string): SavedAddress[] {
  return rows.filter((row) => row.id !== addressId);
}
