import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../../web/src/design-system/Banner';
import { Card } from '../../../web/src/design-system/Card';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import { ApiError, platformCatalogApi, type GlobalItem } from '../lib/api';

export function GlobalItemDetailScreen() {
  const { catalogId = '', itemId = '' } = useParams();
  const [item, setItem] = useState<GlobalItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    platformCatalogApi
      .getItem(itemId)
      .then((row) => {
        if (!cancelled) setItem(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load Global Item');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!item) return <Skeleton />;

  return (
    <section>
      <p>
        <Link to={`/global-catalog/${catalogId}`}>Back to catalog</Link>
      </p>
      <h1>{item.name}</h1>
      <Banner tone="info">
        Changes to this Global Item do not automatically update merchant copies.
      </Banner>
      <Card>
        <p>{item.description || 'No description'}</p>
        <p className="lede">Source catalog id: {item.catalogId}</p>
        <h2>Source product snapshot</h2>
        <pre className="source-payload">{JSON.stringify(item.sourcePayload, null, 2)}</pre>
      </Card>
    </section>
  );
}
