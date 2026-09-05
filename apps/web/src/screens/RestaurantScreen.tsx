import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { discoverApi, type MenuItem, type Restaurant } from '../lib/api';
import { formatMinor } from '../lib/money';
import { StatusPanel } from '../components/StatusPanel';

export function RestaurantScreen() {
  const { id = '' } = useParams();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [place, menu] = await Promise.all([discoverApi.restaurant(id), discoverApi.menu(id)]);
      setRestaurant(place);
      setItems(menu.items);
    } catch (err) {
      setRestaurant(null);
      setItems([]);
      setError(err instanceof Error ? err.message : 'Restaurant unavailable');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <p>
        <Link to="/">← Home</Link>
      </p>
      <StatusPanel
        loading={loading}
        error={error}
        empty={
          !loading && !error && items.length === 0
            ? 'This restaurant has no published items.'
            : null
        }
        onRetry={() => void load()}
      >
        <h1>{restaurant?.name}</h1>
        <p className="muted">
          {restaurant?.city ?? ''} · only published items are listed. Unpublished catalog rows stay
          staff-only.
        </p>
        {items.map((item) => {
          const variant = item.variants[0];
          const sellable = item.availability === 'AVAILABLE' && variant?.available;
          return (
            <article className="card" key={item.id}>
              <div className="row">
                <div>
                  <h2>
                    <Link to={`/items/${item.id}`}>{item.name}</Link>
                  </h2>
                  <p className="muted">{item.description || item.availability}</p>
                  {variant ? (
                    <p>
                      {formatMinor(variant.priceMinor, variant.currencyCode)}
                      {variant.size ? ` · ${variant.size}` : ''}
                    </p>
                  ) : null}
                  {!sellable ? <span className="badge">Unavailable</span> : null}
                </div>
                <Link to={`/items/${item.id}`}>Details</Link>
              </div>
            </article>
          );
        })}
      </StatusPanel>
    </section>
  );
}
