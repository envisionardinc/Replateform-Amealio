import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import {
  ApiError,
  platformCatalogApi,
  type GlobalCatalog,
  type GlobalCategory,
  type GlobalItem,
} from '../lib/api';
import { buildGlobalItemSourcePayload } from '../lib/global-item-payload';

export function GlobalCatalogDetailScreen() {
  const { catalogId = '' } = useParams();
  const [catalog, setCatalog] = useState<GlobalCatalog | null>(null);
  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [items, setItems] = useState<GlobalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [categoryName, setCategoryName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [size, setSize] = useState('Regular');
  const [sku, setSku] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [groupName, setGroupName] = useState('');
  const [addOnName, setAddOnName] = useState('');
  const [addOnPriceRupees, setAddOnPriceRupees] = useState('');
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const detail = await platformCatalogApi.get(catalogId);
      setCatalog(detail.catalog);
      setCategories(detail.categories);
      setItems(detail.items);
      setName(detail.catalog.name);
      setDescription(detail.catalog.description ?? '');
      setCuisineType(detail.catalog.cuisineType ?? '');
      setStatus(detail.catalog.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load Global Catalog');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [catalogId]);

  async function onSaveCatalog(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await platformCatalogApi.update(catalogId, {
        name: name.trim(),
        description: description.trim() || null,
        cuisineType: cuisineType.trim() || null,
        status,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update catalog');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCategory(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await platformCatalogApi.createCategory(catalogId, { name: categoryName.trim() });
      setCategoryName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create category');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateItem(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await platformCatalogApi.createItem(catalogId, {
        name: itemName.trim(),
        description: itemDescription.trim() || null,
        categoryId: categoryId || null,
        sourcePayload: buildGlobalItemSourcePayload({
          size,
          sku,
          priceRupees,
          groupName,
          addOnName,
          addOnPriceRupees,
          deliveryEnabled,
        }),
      });
      setItemName('');
      setItemDescription('');
      setSku('');
      setPriceRupees('');
      setGroupName('');
      setAddOnName('');
      setAddOnPriceRupees('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create Global Item');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !catalog) return <Skeleton />;
  if (!catalog) return <Banner tone="error">{error ?? 'Global Catalog not found'}</Banner>;

  return (
    <section>
      <p>
        <Link to="/global-catalog">Global Catalog</Link>
      </p>
      <h1>{catalog.name}</h1>
      <p className="lede">
        Changes to this Global Catalog do not automatically update merchant copies.
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Card as="form" onSubmit={onSaveCatalog}>
        <h2>Catalog details</h2>
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
        <Field label="Status">
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DRAFT">DRAFT</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </Field>
        <Button type="submit" disabled={busy}>
          Save catalog
        </Button>
      </Card>
      <Card as="form" onSubmit={onCreateCategory}>
        <h2>Create Global Category</h2>
        <Field label="Category name">
          <input
            name="categoryName"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" disabled={busy}>
          Create category
        </Button>
      </Card>
      <Card as="form" onSubmit={onCreateItem}>
        <h2>Create Global Item</h2>
        <Field label="Item name">
          <input
            name="itemName"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
          />
        </Field>
        <Field label="Description">
          <input
            name="itemDescription"
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <select name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default size">
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
        <Field label="Add-on group">
          <input name="groupName" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
        </Field>
        <Field label="Add-on name">
          <input name="addOnName" value={addOnName} onChange={(e) => setAddOnName(e.target.value)} />
        </Field>
        <Field label="Add-on price (₹)">
          <input
            name="addOnPriceRupees"
            inputMode="decimal"
            value={addOnPriceRupees}
            onChange={(e) => setAddOnPriceRupees(e.target.value)}
          />
        </Field>
        <Field label="Home delivery channel">
          <select
            name="deliveryEnabled"
            value={deliveryEnabled ? 'yes' : 'no'}
            onChange={(e) => setDeliveryEnabled(e.target.value === 'yes')}
          >
            <option value="yes">Enabled</option>
            <option value="no">Omit</option>
          </select>
        </Field>
        <Button type="submit" disabled={busy}>
          Create Global Item
        </Button>
      </Card>
      <h2>Categories</h2>
      {categories.length === 0 ? <p className="lede">No categories yet.</p> : null}
      {categories.map((category) => (
        <Card key={category.id}>
          <strong>{category.name}</strong>
        </Card>
      ))}
      <h2>Global Items</h2>
      {items.length === 0 ? <p className="lede">No Global Items yet.</p> : null}
      {items.map((item) => (
        <Card key={item.id}>
          <div className="row">
            <div>
              <h3>{item.name}</h3>
              <p className="lede">{item.description || 'No description'}</p>
            </div>
            <Link to={`/global-catalog/${catalogId}/items/${item.id}`}>View</Link>
          </div>
        </Card>
      ))}
    </section>
  );
}
