import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { Chip } from '../design-system/Chip';
import { Field } from '../design-system/Field';
import { profileApi, type ConsumerProfile } from '../lib/api';
import {
  PROFILE_COPY,
  buildProfilePatch,
  draftFromProfile,
  formatAllergyInput,
  parseAllergyInput,
  profileLoadState,
  toggleDietaryLabel,
  visibleDietaryLabels,
  type ProfileDraft,
} from '../lib/profile';
import { isAuthenticated } from '../lib/session';

export function ProfileScreen() {
  const [profile, setProfile] = useState<ConsumerProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [allergyText, setAllergyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      setProfile(null);
      setDraft(null);
      setError(PROFILE_COPY.signIn);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await profileApi.get();
      const nextDraft = draftFromProfile(next);
      setProfile(next);
      setDraft(nextDraft);
      setAllergyText(formatAllergyInput(nextDraft.allergies));
    } catch (err) {
      setProfile(null);
      setDraft(null);
      setError(err instanceof Error ? err.message : 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const view = profileLoadState({
    authenticated: isAuthenticated(),
    loading,
    error,
    hasProfile: Boolean(profile && draft),
  });

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!profile || !draft) return;
    const nextDraft: ProfileDraft = {
      ...draft,
      allergies: parseAllergyInput(allergyText),
    };
    const patch = buildProfilePatch(draftFromProfile(profile), nextDraft);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = patch ? await profileApi.patch(patch) : profile;
      const savedDraft = draftFromProfile(saved);
      setProfile(saved);
      setDraft(savedDraft);
      setAllergyText(formatAllergyInput(savedDraft.allergies));
      setSuccess(PROFILE_COPY.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h1>{PROFILE_COPY.title}</h1>
      <p className="lede">{PROFILE_COPY.lede}</p>
      {isAuthenticated() ? (
        <p>
          <Link to="/favorites">Favorites</Link>
          {' · '}
          <Link to="/addresses">Saved addresses</Link>
        </p>
      ) : null}
      {view.kind === 'unauthenticated' ? (
        <Banner tone="error">
          <p>{view.message}</p>
          <p>
            <Link to="/login?next=/profile">Sign in</Link>
          </p>
        </Banner>
      ) : null}
      {view.kind === 'loading' ? <StatusPanel loading /> : null}
      {view.kind === 'error' ? (
        <StatusPanel error={view.message} onRetry={() => void load()} />
      ) : null}
      {view.kind === 'ready' && profile && draft ? (
        <Card as="form" onSubmit={(e) => void onSave(e)}>
          {success ? <Banner tone="success">{success}</Banner> : null}
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Field label="Phone">
            <input
              value={`${profile.phoneCountryCode} ${profile.phone}`}
              readOnly
              aria-readonly="true"
            />
          </Field>
          <p className="lede">
            {profile.isVerified ? (
              <Badge tone="success">Verified</Badge>
            ) : (
              <Badge tone="warning">Unverified</Badge>
            )}
          </p>
          <Field label="Email">
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              autoComplete="email"
              placeholder="Optional"
            />
          </Field>
          <h2>{PROFILE_COPY.dietaryHeading}</h2>
          <div
            className="chip-rail chip-wrap"
            role="group"
            aria-label={PROFILE_COPY.dietaryHeading}
          >
            {visibleDietaryLabels(draft.dietary_preferences).map((label) => (
              <Chip
                key={label}
                selected={draft.dietary_preferences.includes(label)}
                onClick={() =>
                  setDraft({
                    ...draft,
                    dietary_preferences: toggleDietaryLabel(draft.dietary_preferences, label),
                  })
                }
              >
                {label}
              </Chip>
            ))}
          </div>
          <h2>{PROFILE_COPY.allergyHeading}</h2>
          <p className="lede">{PROFILE_COPY.allergyHint}</p>
          <Field label="Allergy labels">
            <input
              value={allergyText}
              onChange={(e) => setAllergyText(e.target.value)}
              placeholder="Nuts, Dairy"
            />
          </Field>
          <div className="row-actions">
            {parseAllergyInput(allergyText).map((label) => (
              <Badge key={label} tone="warning">
                {label}
              </Badge>
            ))}
          </div>
          <div className="form-actions">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
