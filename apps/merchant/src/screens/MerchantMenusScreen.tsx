import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '../../../web/src/design-system/Badge';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import {
  ApiError,
  merchantCatalogApi,
  type MerchantMenu,
  type MerchantRestaurant,
  type MerchantSection,
} from '../lib/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function MerchantMenusScreen() {
  const [search, setSearch] = useSearchParams();
  const [restaurants, setRestaurants] = useState<MerchantRestaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState(search.get('restaurantId') ?? '');
  const [menus, setMenus] = useState<MerchantMenu[]>([]);
  const [sectionsByMenu, setSectionsByMenu] = useState<Record<string, MerchantSection[]>>({});
  const [menuName, setMenuName] = useState('');
  const [menuDescription, setMenuDescription] = useState('');
  const [sectionName, setSectionName] = useState<Record<string, string>>({});
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
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load restaurants');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMenus(id: string) {
    const rows = await merchantCatalogApi.menus(id);
    setMenus(rows);
    const next: Record<string, MerchantSection[]> = {};
    await Promise.all(
      rows.map(async (menu) => {
        const sections = await merchantCatalogApi.sections(menu.id);
        next[menu.id] = sections.filter((section) => UUID_RE.test(section.id));
      }),
    );
    setSectionsByMenu(next);
  }

  useEffect(() => {
    if (!restaurantId) {
      setMenus([]);
      setSectionsByMenu({});
      return;
    }
    setSearch({ restaurantId }, { replace: true });
    let cancelled = false;
    loadMenus(restaurantId).catch((err) => {
      if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load menus');
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  async function onCreateMenu(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await merchantCatalogApi.createMenu({
        restaurantId,
        name: menuName.trim(),
        description: menuDescription.trim() || null,
        type: 'CUSTOM',
        visibility: true,
      });
      setMenuName('');
      setMenuDescription('');
      await loadMenus(restaurantId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create menu');
    } finally {
      setBusy(false);
    }
  }

  async function onToggleVisibility(menu: MerchantMenu) {
    setBusy(true);
    setError(null);
    try {
      await merchantCatalogApi.updateMenu(menu.id, { visibility: menu.visibility === false });
      await loadMenus(restaurantId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update menu');
    } finally {
      setBusy(false);
    }
  }

  async function onRenameMenu(menu: MerchantMenu, name: string) {
    const next = name.trim();
    if (!next || next === menu.name) return;
    setBusy(true);
    setError(null);
    try {
      await merchantCatalogApi.updateMenu(menu.id, { name: next });
      await loadMenus(restaurantId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not rename menu');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateSection(e: FormEvent, menuId: string) {
    e.preventDefault();
    const name = (sectionName[menuId] ?? '').trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const existing = sectionsByMenu[menuId] ?? [];
      await merchantCatalogApi.createSection({
        menuId,
        name,
        sortOrder: existing.length,
      });
      setSectionName((current) => ({ ...current, [menuId]: '' }));
      await loadMenus(restaurantId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create section');
    } finally {
      setBusy(false);
    }
  }

  async function onRenameSection(section: MerchantSection, name: string) {
    const next = name.trim();
    if (!next || next === section.name) return;
    setBusy(true);
    setError(null);
    try {
      await merchantCatalogApi.updateSection(section.id, { name: next });
      await loadMenus(restaurantId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not rename section');
    } finally {
      setBusy(false);
    }
  }

  async function onMoveSection(menuId: string, index: number, direction: -1 | 1) {
    const sections = [...(sectionsByMenu[menuId] ?? [])];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    const [moved] = sections.splice(index, 1);
    sections.splice(nextIndex, 0, moved);
    setBusy(true);
    setError(null);
    try {
      await merchantCatalogApi.reorderSections(
        menuId,
        sections.map((section, sortOrder) => ({ sectionId: section.id, sortOrder })),
      );
      await loadMenus(restaurantId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reorder sections');
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
      <h1>Custom Menus</h1>
      <p className="lede">
        Custom Menus are restaurant presentation surfaces. Standard Menu is virtual and is not a
        menu row. An item belongs to at most one section.
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
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
      <Card as="form" onSubmit={onCreateMenu}>
        <h2>Create Custom Menu</h2>
        <Field label="Name">
          <input
            name="menuName"
            value={menuName}
            onChange={(e) => setMenuName(e.target.value)}
            required
          />
        </Field>
        <Field label="Description">
          <input
            name="menuDescription"
            value={menuDescription}
            onChange={(e) => setMenuDescription(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy || !restaurantId || !menuName.trim()}>
          Create Custom Menu
        </Button>
      </Card>
      {menus.length === 0 ? <p className="lede">No menus yet.</p> : null}
      {menus.map((menu) => (
        <Card key={menu.id}>
          <div className="row">
            <div>
              <h2>{menu.name}</h2>
              <Badge tone={menu.visibility === false ? 'warning' : 'success'}>
                {menu.visibility === false ? 'Hidden' : 'Visible'}
              </Badge>
              <p className="lede">{menu.type || 'CUSTOM'}</p>
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void onToggleVisibility(menu)}
            >
              {menu.visibility === false ? 'Show menu' : 'Hide menu'}
            </Button>
          </div>
          <Field label="Rename menu">
            <input
              defaultValue={menu.name}
              name={`menu-name-${menu.id}`}
              onBlur={(e) => void onRenameMenu(menu, e.target.value)}
            />
          </Field>
          <h3>Sections</h3>
          {(sectionsByMenu[menu.id] ?? []).map((section, index) => (
            <div className="row" key={section.id}>
              <Field label="Section name">
                <input
                  defaultValue={section.name}
                  name={`section-name-${section.id}`}
                  onBlur={(e) => void onRenameSection(section, e.target.value)}
                />
              </Field>
              <div className="row-actions">
                <Button
                  variant="ghost"
                  disabled={busy || index === 0}
                  onClick={() => void onMoveSection(menu.id, index, -1)}
                >
                  Up
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || index === (sectionsByMenu[menu.id] ?? []).length - 1}
                  onClick={() => void onMoveSection(menu.id, index, 1)}
                >
                  Down
                </Button>
              </div>
            </div>
          ))}
          <form onSubmit={(e) => void onCreateSection(e, menu.id)}>
            <Field label="New section">
              <input
                name={`new-section-${menu.id}`}
                value={sectionName[menu.id] ?? ''}
                onChange={(e) =>
                  setSectionName((current) => ({ ...current, [menu.id]: e.target.value }))
                }
              />
            </Field>
            <Button type="submit" disabled={busy || !(sectionName[menu.id] ?? '').trim()}>
              Add section
            </Button>
          </form>
        </Card>
      ))}
    </section>
  );
}
