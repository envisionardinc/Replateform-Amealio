import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { Field } from '../design-system/Field';
import { authApi } from '../lib/api';
import { setSession } from '../lib/session';

export function LoginScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phoneCountryCode, setCc] = useState('+91');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        await authApi.register({ phoneCountryCode, phone, password });
      }
      const tokens = await authApi.login({ phoneCountryCode, phone, password });
      setSession(tokens.accessToken, tokens.refreshToken);
      navigate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      <p className="lede">
        Target consumer auth (doc 25): phone + password, <code>Authorization: Bearer</code>. OTP and
        social login are not on this Nest slice.
      </p>
      <StatusPanel error={error} />
      <Card as="form" onSubmit={(e) => void onSubmit(e)}>
        <Field label="Country code">
          <input
            value={phoneCountryCode}
            onChange={(e) => setCc(e.target.value)}
            autoComplete="tel-country-code"
            required
          />
        </Field>
        <Field label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            autoComplete="tel-national"
            required
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
        </Field>
        <div className="form-actions">
          <Button type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Register and sign in'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Need an account?' : 'Have an account?'}
          </Button>
        </div>
      </Card>
    </section>
  );
}
