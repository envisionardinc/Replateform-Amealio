import { describe, expect, it } from 'vitest';
import {
  PROFILE_COPY,
  buildProfilePatch,
  draftFromProfile,
  formatAllergyInput,
  parseAllergyInput,
  profileLoadState,
  sameLabels,
  toggleDietaryLabel,
  visibleDietaryLabels,
} from './profile';

const saved = {
  email: 'keep@example.test',
  dietary_preferences: ['Vegetarian'],
  allergies: ['Nuts'],
};

describe('consumer profile (doc 96)', () => {
  it('maps a GET payload into an editable draft', () => {
    const draft = draftFromProfile({
      email: null,
      preferences: { dietary_preferences: ['Jain'], allergies: [] },
    });
    expect(draft).toEqual({
      email: '',
      dietary_preferences: ['Jain'],
      allergies: [],
    });
  });

  it('toggles dietary chips and keeps extras from the server visible', () => {
    expect(toggleDietaryLabel([], 'Vegetarian')).toEqual(['Vegetarian']);
    expect(toggleDietaryLabel(['Vegetarian'], 'Vegetarian')).toEqual([]);
    expect(toggleDietaryLabel(['Vegetarian'], 'Vegan')).toEqual(['Vegetarian', 'Vegan']);
    expect(visibleDietaryLabels(['Kosher'])).toContain('Kosher');
    expect(visibleDietaryLabels(['Kosher'])).toContain('Vegetarian');
    const ten = Array.from({ length: 10 }, (_, i) => `L${i}`);
    expect(toggleDietaryLabel(ten, 'Extra')).toEqual(ten);
  });

  it('parses allergy labels and formats them for the field', () => {
    expect(parseAllergyInput(' Nuts, Dairy , nuts ')).toEqual(['Nuts', 'Dairy']);
    expect(formatAllergyInput(['Nuts', 'Dairy'])).toBe('Nuts, Dairy');
    expect(sameLabels(['Nuts'], ['Nuts'])).toBe(true);
    expect(sameLabels(['Nuts'], ['Dairy'])).toBe(false);
  });

  it('builds a partial PATCH: omitted unchanged, value update, null clear', () => {
    expect(buildProfilePatch(saved, saved)).toBeNull();
    expect(buildProfilePatch(saved, { ...saved, email: 'Next@example.test' })).toEqual({
      email: 'next@example.test',
    });
    expect(buildProfilePatch(saved, { ...saved, email: '  ' })).toEqual({ email: null });
    expect(buildProfilePatch(saved, { ...saved, dietary_preferences: ['Vegan'] })).toEqual({
      preferences: { dietary_preferences: ['Vegan'] },
    });
    expect(buildProfilePatch(saved, { ...saved, allergies: [] })).toEqual({
      preferences: { allergies: null },
    });
  });

  it('never sends userId or server-owned fields on save', () => {
    const patch = buildProfilePatch(saved, {
      email: 'new@example.test',
      dietary_preferences: ['Jain'],
      allergies: ['Dairy'],
    });
    expect(patch).toEqual({
      email: 'new@example.test',
      preferences: { dietary_preferences: ['Jain'], allergies: ['Dairy'] },
    });
    expect(patch).not.toHaveProperty('userId');
    expect(patch).not.toHaveProperty('detailsSubmitted');
    expect(patch).not.toHaveProperty('completionPercentage');
    expect(patch).not.toHaveProperty('phone');
  });

  it('models loading, error, and unauthenticated render states', () => {
    expect(
      profileLoadState({ authenticated: false, loading: true, error: null, hasProfile: false }),
    ).toEqual({
      kind: 'unauthenticated',
      message: PROFILE_COPY.signIn,
    });
    expect(
      profileLoadState({ authenticated: true, loading: true, error: null, hasProfile: false }),
    ).toEqual({
      kind: 'loading',
    });
    expect(
      profileLoadState({
        authenticated: true,
        loading: false,
        error: 'Could not load profile',
        hasProfile: false,
      }),
    ).toEqual({ kind: 'error', message: 'Could not load profile' });
    expect(
      profileLoadState({
        authenticated: true,
        loading: false,
        error: null,
        hasProfile: true,
      }),
    ).toEqual({ kind: 'ready' });
  });
});
