export const DIETARY_CHIP_LABELS = [
  'Vegetarian',
  'Vegan',
  'Jain',
  'Eggetarian',
  'Non-vegetarian',
  'Gluten-free',
] as const;

export const PROFILE_COPY = {
  title: 'Profile',
  lede: 'Phone is your sign-in credential. Dietary labels are preferences, not a medical or allergy-safety guarantee.',
  signIn: 'Sign in to view and edit your profile.',
  saved: 'Profile saved.',
  dietaryHeading: 'Dietary preferences',
  allergyHeading: 'Allergies',
  allergyHint: 'Comma-separated labels. These are stored as preference text, not clinical records.',
} as const;

export type ProfileDraft = {
  email: string;
  dietary_preferences: string[];
  allergies: string[];
};

export type ProfilePatchBody = {
  email?: string | null;
  preferences?: {
    dietary_preferences?: string[] | null;
    allergies?: string[] | null;
  };
};

export function draftFromProfile(profile: {
  email: string | null;
  preferences: { dietary_preferences: string[]; allergies: string[] };
}): ProfileDraft {
  return {
    email: profile.email ?? '',
    dietary_preferences: [...profile.preferences.dietary_preferences],
    allergies: [...profile.preferences.allergies],
  };
}

export function toggleDietaryLabel(current: string[], label: string): string[] {
  const trimmed = label.trim();
  if (!trimmed) return current;
  if (current.includes(trimmed)) return current.filter((item) => item !== trimmed);
  if (current.length >= 10) return current;
  return [...current, trimmed];
}

export function visibleDietaryLabels(selected: string[]): string[] {
  const extras = selected.filter(
    (label) => !(DIETARY_CHIP_LABELS as readonly string[]).includes(label),
  );
  return [...DIETARY_CHIP_LABELS, ...extras];
}

export function parseAllergyInput(text: string): string[] {
  const labels = text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(labels)].slice(0, 10);
}

export function formatAllergyInput(labels: string[]): string {
  return labels.join(', ');
}

export function sameLabels(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function buildProfilePatch(
  saved: ProfileDraft,
  draft: ProfileDraft,
): ProfilePatchBody | null {
  const patch: ProfilePatchBody = {};
  const savedEmail = saved.email.trim().toLowerCase();
  const draftEmail = draft.email.trim().toLowerCase();
  if (savedEmail !== draftEmail) {
    patch.email = draftEmail || null;
  }
  const preferences: NonNullable<ProfilePatchBody['preferences']> = {};
  if (!sameLabels(saved.dietary_preferences, draft.dietary_preferences)) {
    preferences.dietary_preferences = draft.dietary_preferences.length
      ? draft.dietary_preferences
      : null;
  }
  if (!sameLabels(saved.allergies, draft.allergies)) {
    preferences.allergies = draft.allergies.length ? draft.allergies : null;
  }
  if (Object.keys(preferences).length) patch.preferences = preferences;
  return Object.keys(patch).length ? patch : null;
}

export type ProfileLoadState =
  | { kind: 'unauthenticated'; message: string }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

export function profileLoadState(args: {
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  hasProfile: boolean;
}): ProfileLoadState {
  if (!args.authenticated) return { kind: 'unauthenticated', message: PROFILE_COPY.signIn };
  if (args.loading && !args.hasProfile) return { kind: 'loading' };
  if (args.error && !args.hasProfile) return { kind: 'error', message: args.error };
  return { kind: 'ready' };
}
