import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '../../../web/src/design-system/Badge';
import { Banner } from '../../../web/src/design-system/Banner';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import {
  ApiError,
  merchantCatalogApi,
  type MerchantCatalogItem,
  type MerchantRestaurant,
} from '../lib/api';
import { catalogRestaurantHref } from '../lib/catalog-form';

export function MerchantCatalogScreen() {
  const [search, setSearch] = useSearchParams();
  const [restaurants, setRestaurants] = useState<MerchantRestaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState(search.get('restaurantId') ?? '');
  const [items, setItems] = useState<MerchantCatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    merchantCatalogApi
      .restaurants()
      .then((rows) => {
        if (cancelled) return;
        setRestaurants(rows);
        setRestaurantId((current) => current || rows[0]?.id || '');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load restaurants');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restaurantId) {
      setItems([]);
      return;
    }
    setSearch({ restaurantId }, { replace: true });
    let cancelled = false;
    merchantCatalogApi
      .items(restaurantId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load merchant catalog');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return (
    <section>
      <h1>Merchant Catalog</h1>
      <p className="lede">
        Restaurant-owned MenuItems. Create an item from scratch, or copy one from Global Catalog.
        Global import is optional. Unpublished items stay hidden from consumers.
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="row-actions">
        <Link className="btn btn-primary" to={catalogRestaurantHref('/catalog/items/new', restaurantId)}>
          Create item
        </Link>
        <Link className="btn btn-secondary" to={catalogRestaurantHref('/catalog/add-from-global', restaurantId)}>
          Add from Global
        </Link>
        <Link className="btn btn-secondary" to={catalogRestaurantHref('/catalog/menus', restaurantId)}>
          Custom Menus
        </Link>
      </div>
      <Field label="Restaurant">
        <select
          name="restaurantId"
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
        >
          {restaurants.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>
              {restaurant.name}
            </option>
          ))}
        </select>
      </Field>
      {loading ? <Skeleton /> : null}
      {!loading && items.length === 0 ? <p className="lede">No items yet. Create one or add from Global.</p> : null}
      {items.map((item) => (
        <Card key={item.id}>
          <div className="row">
            <div>
              <h2>{item.name}</h2>
              <p className="lede">{item.description || 'No description'}</p>
              <div className="row-actions">
                <Badge tone={item.globalSource ? 'info' : 'neutral'}>
                  {item.globalSource ? 'Imported from Global' : 'Merchant created'}
                </Badge>
                <Badge tone={item.isPublished ? 'success' : 'warning'}>
                  {item.isPublished ? 'Published' : 'Unpublished'}
                </Badge>
                <Badge tone={item.availability === 'AVAILABLE' ? 'success' : 'warning'}>
                  {item.availability}
                </Badge>
              </div>
            </div>
            <Link to={`/catalog/items/${item.id}`}>Open</Link>
          </div>
        </Card>
      ))}
    </section>
  );
}
