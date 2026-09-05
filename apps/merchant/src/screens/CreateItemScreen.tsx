import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import { ApiError, merchantCatalogApi, type MerchantMenu, type MerchantRestaurant, type MerchantSection } from '../lib/api';
import { buildScratchItemPayload } from '../lib/catalog-form';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function usableSections(rows: MerchantSection[]): MerchantSection[] {
  return rows.filter((section) => UUID_RE.test(section.id));
}

export function CreateItemScreen() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [restaurants, setRestaurants] = useState<MerchantRestaurant[]>([]);
  const [menus, setMenus] = useState<MerchantMenu[]>([]);
  const [sections, setSections] = useState<MerchantSection[]>([]);
  const [restaurantId, setRestaurantId] = useState(search.get('restaurantId') ?? '');
  const [menuId, setMenuId] = useState('');
  const [menuSectionId, setMenuSectionId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [size, setSize] = useState('Regular');
  const [sku, setSku] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [homeDeliveryEnabled, setHomeDeliveryEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load menus');
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
          next.some((section) => section.id === current) ? current : '',
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load sections');
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
      const created = await merchantCatalogApi.createItem(
        buildScratchItemPayload({
          restaurantId,
          name,
          description,
          menuSectionId,
          size,
          sku,
          priceRupees,
          homeDeliveryEnabled,
        }),
      );
      navigate(`/catalog/items/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create merchant item');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton />;

  return (
    <section>
      <p>
        <Link to={restaurantId ? `/catalog?restaurantId=${restaurantId}` : '/catalog'}>
          Merchant Catalog
        </Link>
      </p>
      <h1>Create item</h1>
      <p className="lede">
        Merchant-owned draft. A Global Catalog item is not required. The item starts unpublished.
        Size is a variant. Leave price empty to create a name-only draft.
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
        <Field label="Custom menu">
          <select name="menuId" value={menuId} onChange={(e) => setMenuId(e.target.value)}>
            <option value="">None</option>
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menu.name}
                {menu.visibility === false ? ' (hidden)' : ''}
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
            <option value="">None — Standard Menu only</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </Field>
        <h2>Optional first variant</h2>
        <Field label="Size">
          <input name="size" value={size} onChange={(e) => setSize(e.target.value)} />
        </Field>
        <Field label="SKU">
          <input name="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
        </Field>
        <Field label="Price (₹)">
          <input
            name="priceRupees"
            inputMode="decimal"
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
          />
        </Field>
        <Field label="Home delivery channel">
          <select
            name="homeDeliveryEnabled"
            value={homeDeliveryEnabled ? 'yes' : 'no'}
            onChange={(e) => setHomeDeliveryEnabled(e.target.value === 'yes')}
          >
            <option value="yes">Enabled</option>
            <option value="no">Omit</option>
          </select>
        </Field>
        <Button type="submit" disabled={busy || !restaurantId || !name.trim()}>
          {busy ? 'Creating…' : 'Create draft item'}
        </Button>
      </Card>
    </section>
  );
}
