import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FavoriteButton } from '../components/FavoriteButton';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Card } from '../design-system/Card';
import { discoverApi, type MenuItem, type Restaurant } from '../lib/api';
import { formatMinor } from '../lib/money';

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
      <StatusPanel loading={loading} error={error} onRetry={() => void load()}>
        <div className="row">
          <h1>{restaurant?.name}</h1>
          {restaurant ? (
            <FavoriteButton
              targetType="RESTAURANT"
              targetId={restaurant.id}
              next={`/restaurants/${restaurant.id}`}
            />
          ) : null}
        </div>
        <p className="lede">
          {restaurant?.city ?? ''} · only published items are listed. Unpublished catalog rows stay
          staff-only.
        </p>
        {items.length === 0 ? (
          <Banner tone="empty">This restaurant has no published items.</Banner>
        ) : null}
        {items.map((item) => {
          const variant = item.variants[0];
          const sellable = item.availability === 'AVAILABLE' && variant?.available;
          return (
            <Card key={item.id} media={item.name}>
              <div className="row">
                <div>
                  <h2>
                    <Link to={`/items/${item.id}`}>{item.name}</Link>
                  </h2>
                  <p className="lede">{item.description || item.availability}</p>
                  {variant ? (
                    <p className="price">
                      {formatMinor(variant.priceMinor, variant.currencyCode)}
                      {variant.size ? ` · ${variant.size}` : ''}
                    </p>
                  ) : null}
                  {!sellable ? <Badge tone="warning">Unavailable</Badge> : null}
                </div>
                <Link to={`/items/${item.id}`}>Details</Link>
              </div>
            </Card>
          );
        })}
      </StatusPanel>
    </section>
  );
}
