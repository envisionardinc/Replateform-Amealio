import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../../web/src/design-system/Badge';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import { ApiError, merchantCatalogApi, type MerchantCatalogItem } from '../lib/api';
import { formatMinor } from '../lib/money';

export function MerchantItemDetailScreen() {
  const { itemId = '' } = useParams();
  const [item, setItem] = useState<MerchantCatalogItem | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const detail = await merchantCatalogApi.getItem(itemId);
    setItem(detail);
    setName(detail.name);
    setDescription(detail.description ?? '');
    setIsPublished(detail.isPublished);
  }

  useEffect(() => {
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Could not load merchant item');
    });
  }, [itemId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await merchantCatalogApi.updateItem(itemId, {
        name: name.trim(),
        description: description.trim() || null,
        isPublished,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update merchant item');
    } finally {
      setBusy(false);
    }
  }

  if (!item && !error) return <Skeleton />;
  if (!item) return <Banner tone="error">{error}</Banner>;

  return (
    <section>
      <p>
        <Link to="/catalog">Merchant Catalog</Link>
      </p>
      <h1>{item.name}</h1>
      {item.globalSource ? (
        <Banner tone="info">
          Added from Global Catalog: {item.globalSource.catalogName} / {item.globalSource.sourceItemName}.
          Edits here do not change the Global source.
        </Banner>
      ) : null}
      <Badge tone={item.isPublished ? 'success' : 'warning'}>
        {item.isPublished ? 'Published' : 'Unpublished'}
      </Badge>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Card as="form" onSubmit={onSave}>
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
        <Field label="Publication">
          <select
            name="isPublished"
            value={isPublished ? 'published' : 'unpublished'}
            onChange={(e) => setIsPublished(e.target.value === 'published')}
          >
            <option value="unpublished">Unpublished</option>
            <option value="published">Published</option>
          </select>
        </Field>
        <Button type="submit" disabled={busy}>
          Save merchant item
        </Button>
      </Card>
      <Card>
        <h2>Copied structure</h2>
        {(item.variants ?? []).map((variant) => (
          <p key={variant.id}>
            {variant.size || 'Variant'} · {variant.sku || 'no SKU'} ·{' '}
            {formatMinor(variant.priceMinor)}
          </p>
        ))}
        {(item.addOnGroups ?? []).map((group) => (
          <p key={group.id}>
            {group.name}: {group.addOns.map((addon) => addon.name).join(', ') || 'no add-ons'}
          </p>
        ))}
        {(item.channelConfigs ?? []).map((channel) => (
          <p key={channel.id}>
            {channel.channel} · {channel.enabled ? 'enabled' : 'disabled'}
          </p>
        ))}
      </Card>
    </section>
  );
}
