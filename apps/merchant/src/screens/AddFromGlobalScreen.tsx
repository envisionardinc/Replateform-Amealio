import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import {
  ApiError,
  merchantCatalogApi,
  platformCatalogApi,
  type GlobalCatalog,
  type GlobalItem,
  type MerchantMenu,
  type MerchantRestaurant,
  type MerchantSection,
} from '../lib/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function usableSections(rows: MerchantSection[]): MerchantSection[] {
  return rows.filter((section) => UUID_RE.test(section.id));
}

export function AddFromGlobalScreen() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [restaurants, setRestaurants] = useState<MerchantRestaurant[]>([]);
  const [catalogs, setCatalogs] = useState<GlobalCatalog[]>([]);
  const [items, setItems] = useState<GlobalItem[]>([]);
  const [menus, setMenus] = useState<MerchantMenu[]>([]);
  const [sections, setSections] = useState<MerchantSection[]>([]);
  const [restaurantId, setRestaurantId] = useState(search.get('restaurantId') ?? '');
  const [catalogId, setCatalogId] = useState('');
  const [sourceItemId, setSourceItemId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [menuSectionId, setMenuSectionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([merchantCatalogApi.restaurants(), platformCatalogApi.list()])
      .then(([nextRestaurants, nextCatalogs]) => {
        if (cancelled) return;
        setRestaurants(nextRestaurants);
        setCatalogs(nextCatalogs);
        setRestaurantId((current) => current || nextRestaurants[0]?.id || '');
        setCatalogId((current) => current || nextCatalogs[0]?.id || '');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load Add from Global');
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
    if (!catalogId) {
      setItems([]);
      setSourceItemId('');
      return;
    }
    let cancelled = false;
    platformCatalogApi
      .get(catalogId)
      .then((detail) => {
        if (cancelled) return;
        setItems(detail.items);
        setSourceItemId((current) =>
          detail.items.some((item) => item.id === current) ? current : detail.items[0]?.id || '',
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load Global Items');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [catalogId]);

  useEffect(() => {
    if (!restaurantId) {
      setMenus([]);
      setMenuId('');
      return;
    }
    let cancelled = false;
    merchantCatalogApi
      .menus(restaurantId)
      .then((rows) => {
        if (cancelled) return;
        setMenus(rows);
        setMenuId((current) => (rows.some((menu) => menu.id === current) ? current : rows[0]?.id || ''));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load menus');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!menuId) {
      setSections([]);
      setMenuSectionId('');
      return;
    }
    let cancelled = false;
    merchantCatalogApi
      .sections(menuId)
      .then((rows) => {
        if (cancelled) return;
        const next = usableSections(rows);
        setSections(next);
        setMenuSectionId((current) =>
          next.some((section) => section.id === current) ? current : next[0]?.id || '',
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load menu sections');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [menuId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await platformCatalogApi.materialize(sourceItemId, {
        restaurantId,
        catalogId,
        menuSectionId: menuSectionId || null,
      });
      navigate(`/catalog/items/${result.menuItemId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add from Global Catalog');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton />;

  return (
    <section>
      <p>
        <Link to="/catalog">Merchant Catalog</Link>
      </p>
      <h1>Add from Global</h1>
      <p className="lede">
        Copy a Global Item into this restaurant. The copy starts unpublished and is independently
        editable. It is not synced with the Global Catalog.
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Card as="form" onSubmit={onSubmit}>
        <Field label="Restaurant">
          <select
            name="restaurantId"
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            required
          >
            {restaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Global Catalog">
          <select
            name="catalogId"
            value={catalogId}
            onChange={(e) => setCatalogId(e.target.value)}
            required
          >
            {catalogs.map((catalog) => (
              <option key={catalog.id} value={catalog.id}>
                {catalog.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Global Item">
          <select
            name="sourceItemId"
            value={sourceItemId}
            onChange={(e) => setSourceItemId(e.target.value)}
            required
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Menu">
          <select name="menuId" value={menuId} onChange={(e) => setMenuId(e.target.value)}>
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menu.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Menu section">
          <select
            name="menuSectionId"
            value={menuSectionId}
            onChange={(e) => setMenuSectionId(e.target.value)}
          >
            <option value="">None</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={busy || !sourceItemId || !restaurantId}>
          {busy ? 'Adding…' : 'Add to merchant catalog'}
        </Button>
      </Card>
    </section>
  );
}
