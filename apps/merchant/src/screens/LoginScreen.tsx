import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { ApiError, staffAuthApi } from '../lib/api';
import { setSession } from '../lib/session';

export function LoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('dev.owner@example.test');
  const [password, setPassword] = useState('MerchantSecret123!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await staffAuthApi.login({ email: email.trim(), password });
      setSession(res.accessToken, res.refreshToken, res.staff);
      navigate(res.staff.staffRole === 'SUPER_ADMIN' ? '/global-catalog' : '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>Staff sign in</h1>
      <p className="lede">
        Super Admin and merchant staff use the same login. Consumer sessions are not used here.
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Card as="form" onSubmit={onSubmit}>
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Card>
    </section>
  );
}
