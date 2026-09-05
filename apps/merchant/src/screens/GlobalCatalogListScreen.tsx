import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import { ApiError, platformCatalogApi, type GlobalCatalog } from '../lib/api';

export function GlobalCatalogListScreen() {
  const [catalogs, setCatalogs] = useState<GlobalCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setCatalogs(await platformCatalogApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load Global Catalog');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await platformCatalogApi.create({
        name: name.trim(),
        description: description.trim() || null,
        cuisineType: cuisineType.trim() || null,
        status: 'ACTIVE',
      });
      setName('');
      setDescription('');
      setCuisineType('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create Global Catalog');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>Global Catalog</h1>
      <p className="lede">
        Super Admin reusable item source. Merchant copies are independent. Changes here do not
        automatically update merchant copies.
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Card as="form" onSubmit={onCreate}>
        <h2>Create Global Catalog</h2>
        <Field label="Name">
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description">
          <input
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Cuisine type">
          <input
            name="cuisineType"
            value={cuisineType}
            onChange={(e) => setCuisineType(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create catalog'}
        </Button>
      </Card>
      {loading ? <Skeleton /> : null}
      {catalogs.map((catalog) => (
        <Card key={catalog.id}>
          <div className="row">
            <div>
              <h2>{catalog.name}</h2>
              <p className="lede">
                {catalog.cuisineType || 'No cuisine'} · {catalog.status}
              </p>
            </div>
            <Link to={`/global-catalog/${catalog.id}`}>Open</Link>
          </div>
        </Card>
      ))}
    </section>
  );
}
