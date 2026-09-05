import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { setSession } from '../lib/session';
import { StatusPanel } from '../components/StatusPanel';

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
      <p className="muted">
        Target consumer auth (doc 25): phone + password, <code>Authorization: Bearer</code>. OTP and
        social login are not on this Nest slice.
      </p>
      <StatusPanel error={error} />
      <form className="card" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Country code
          <input
            value={phoneCountryCode}
            onChange={(e) => setCc(e.target.value)}
            autoComplete="tel-country-code"
            required
          />
        </label>
        <label>
          Phone
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            autoComplete="tel-national"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
        </label>
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Register and sign in'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Need an account?' : 'Have an account?'}
          </button>
        </div>
      </form>
    </section>
  );
}
