import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { Field } from '../design-system/Field';
import { discoverApi, type HomeFeed } from '../lib/api';
import { isAuthenticated } from '../lib/session';

export function HomeScreen() {
  const [city, setCity] = useState('');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState({ city: '', q: '' });
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await discoverApi.home({
        city: applied.city || undefined,
        q: applied.q || undefined,
      });
      setFeed(data);
    } catch (err) {
      setFeed(null);
      setError(err instanceof Error ? err.message : 'Could not load restaurants');
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setApplied({ city: city.trim(), q: q.trim() });
  }

  const restaurants = feed?.sections[0]?.restaurants ?? [];

  return (
    <section>
      <h1>Restaurants</h1>
      <p className="lede">
        Canonical Home Page 1 discovery (<code>{feed?.source ?? 'CANONICAL'}</code>
        ). Home Page V2 recommendations are not the default home and are not called from these
        cards.
        {isAuthenticated() ? ' You are signed in.' : ' Browse without signing in.'}
      </p>
      <Card as="form" onSubmit={onSearch}>
        <Field label="City (optional — location denial does not block this list)">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Pune"
            name="city"
          />
        </Field>
        <Field label="Restaurant name">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" name="q" />
        </Field>
        <Button type="submit">Search</Button>
      </Card>
      <StatusPanel
        loading={loading}
        error={error}
        empty={!loading && !error && restaurants.length === 0 ? 'No restaurants found.' : null}
        onRetry={() => void load()}
      >
        {restaurants.map((r) => (
          <Card key={r.id} media={r.name}>
            <div className="row">
              <div>
                <h2>
                  <Link to={`/restaurants/${r.id}`}>{r.name}</Link>
                </h2>
                <p className="lede">
                  {r.city ?? 'City not set'} · <Badge tone="info">{r.status}</Badge>
                </p>
              </div>
              <Link to={`/restaurants/${r.id}`}>Menu</Link>
            </div>
          </Card>
        ))}
      </StatusPanel>
    </section>
  );
}
