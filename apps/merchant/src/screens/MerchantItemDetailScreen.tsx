import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../../web/src/design-system/Badge';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import {
  ApiError,
  ORDER_CHANNELS,
  merchantCatalogApi,
  type MerchantAddOn,
  type MerchantAddOnGroup,
  type MerchantCatalogItem,
  type MerchantSection,
  type MerchantVariant,
  type OrderChannel,
} from '../lib/api';
import {
  ITEM_AVAILABILITIES,
  catalogRestaurantHref,
  minorToRupees,
  parseNonNegativeInt,
  parseOptionalMaxSelect,
  rupeesToMinor,
} from '../lib/catalog-form';
import { formatMinor } from '../lib/money';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SectionOption = MerchantSection & { menuName: string };

export function MerchantItemDetailScreen() {
  const { itemId = '' } = useParams();
  const [item, setItem] = useState<MerchantCatalogItem | null>(null);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [availability, setAvailability] = useState('AVAILABLE');
  const [menuSectionId, setMenuSectionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [variantSize, setVariantSize] = useState('Regular');
  const [variantSku, setVariantSku] = useState('');
  const [variantPrice, setVariantPrice] = useState('');
  const [variantDefault, setVariantDefault] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [groupMin, setGroupMin] = useState('0');
  const [groupMax, setGroupMax] = useState('1');
  const [groupQty, setGroupQty] = useState(false);
  const [addOnName, setAddOnName] = useState<Record<string, string>>({});
  const [addOnPrice, setAddOnPrice] = useState<Record<string, string>>({});

  async function load() {
    const detail = await merchantCatalogApi.getItem(itemId);
    setItem(detail);
    setName(detail.name);
    setDescription(detail.description ?? '');
    setIsPublished(detail.isPublished);
    setAvailability(detail.availability);
    setMenuSectionId(detail.menuSectionId ?? '');
    const menus = await merchantCatalogApi.menus(detail.restaurantId);
    const options: SectionOption[] = [];
    for (const menu of menus) {
      const rows = await merchantCatalogApi.sections(menu.id);
      for (const section of rows.filter((row) => UUID_RE.test(row.id))) {
        options.push({ ...section, menuName: menu.name });
      }
    }
    setSections(options);
    return detail;
  }

  useEffect(() => {
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Could not load merchant item');
    });
  }, [itemId]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveIdentity(e: FormEvent) {
    e.preventDefault();
    await run(
      () =>
        merchantCatalogApi.updateItem(itemId, {
          name: name.trim(),
          description: description.trim() || null,
          isPublished,
          availability,
          menuSectionId: menuSectionId || null,
        }),
      'Could not update merchant item',
    );
  }

  async function onCreateVariant(e: FormEvent) {
    e.preventDefault();
    const priceMinor = rupeesToMinor(variantPrice);
    if (!priceMinor) {
      setError('Variant price is required and must be zero or greater');
      return;
    }
    await run(
      () =>
        merchantCatalogApi.createVariant(itemId, {
          size: variantSize.trim() || null,
          sku: variantSku.trim() || null,
          priceMinor,
          isDefault: variantDefault,
          available: true,
        }),
      'Could not create variant',
    );
    setVariantSku('');
    setVariantPrice('');
  }

  async function onSaveVariant(variant: MerchantVariant, patch: {
    size: string;
    sku: string;
    priceRupees: string;
    isDefault: boolean;
    available: boolean;
  }) {
    const priceMinor = rupeesToMinor(patch.priceRupees);
    if (!priceMinor) {
      setError('Variant price is required and must be zero or greater');
      return;
    }
    await run(
      () =>
        merchantCatalogApi.updateVariant(variant.id, {
          size: patch.size.trim() || null,
          sku: patch.sku.trim() || null,
          priceMinor,
          isDefault: patch.isDefault,
          available: patch.available,
        }),
      'Could not update variant',
    );
  }

  async function onCreateGroup(e: FormEvent) {
    e.preventDefault();
    await run(
      () =>
        merchantCatalogApi.createAddOnGroup(itemId, {
          name: groupName.trim(),
          minSelect: parseNonNegativeInt(groupMin, 0),
          maxSelect: parseOptionalMaxSelect(groupMax),
          allowQuantity: groupQty,
          available: true,
        }),
      'Could not create modifier group',
    );
    setGroupName('');
  }

  async function onSaveGroup(group: MerchantAddOnGroup, patch: {
    name: string;
    minSelect: string;
    maxSelect: string;
    allowQuantity: boolean;
    available: boolean;
    sortOrder: string;
  }) {
    await run(
      () =>
        merchantCatalogApi.updateAddOnGroup(group.id, {
          name: patch.name.trim(),
          minSelect: parseNonNegativeInt(patch.minSelect, 0),
          maxSelect: parseOptionalMaxSelect(patch.maxSelect),
          allowQuantity: patch.allowQuantity,
          available: patch.available,
          sortOrder: parseNonNegativeInt(patch.sortOrder, group.sortOrder ?? 0),
        }),
      'Could not update modifier group',
    );
  }

  async function onCreateAddOn(e: FormEvent, groupId: string) {
    e.preventDefault();
    const priceMinor = rupeesToMinor(addOnPrice[groupId] || '0') ?? '0';
    await run(
      () =>
        merchantCatalogApi.createAddOn(groupId, {
          name: (addOnName[groupId] ?? '').trim(),
          priceMinor,
          available: true,
        }),
      'Could not create add-on',
    );
    setAddOnName((current) => ({ ...current, [groupId]: '' }));
    setAddOnPrice((current) => ({ ...current, [groupId]: '' }));
  }

  async function onSaveAddOn(addOn: MerchantAddOn, patch: {
    name: string;
    priceRupees: string;
    available: boolean;
    isDefault: boolean;
  }) {
    const priceMinor = rupeesToMinor(patch.priceRupees);
    if (priceMinor == null) {
      setError('Add-on price must be zero or greater');
      return;
    }
    await run(
      () =>
        merchantCatalogApi.updateAddOn(addOn.id, {
          name: patch.name.trim(),
          priceMinor,
          available: patch.available,
          isDefault: patch.isDefault,
        }),
      'Could not update add-on',
    );
  }

  async function onSaveVariantPrice(addOnId: string, variantId: string, priceRupees: string) {
    const priceMinor = rupeesToMinor(priceRupees);
    if (priceMinor == null) {
      setError('Variant-specific add-on price must be zero or greater');
      return;
    }
    await run(
      () => merchantCatalogApi.setAddOnVariantPrice(addOnId, { variantId, priceMinor }),
      'Could not save variant-specific price',
    );
  }

  async function onToggleChannel(channel: OrderChannel, enabled: boolean) {
    await run(
      () => merchantCatalogApi.setChannelConfig(itemId, { channel, enabled }),
      'Could not update channel',
    );
  }

  if (!item && !error) return <Skeleton />;
  if (!item) return <Banner tone="error">{error}</Banner>;

  const catalogHref = catalogRestaurantHref('/catalog', item.restaurantId);
  const enabledChannels = new Set((item.channelConfigs ?? []).filter((row) => row.enabled).map((row) => row.channel));

  return (
    <section>
      <p>
        <Link to={catalogHref}>Merchant Catalog</Link>
      </p>
      <h1>{item.name}</h1>
      {item.globalSource ? (
        <Banner tone="info">
          Copied from Global Catalog: {item.globalSource.catalogName} / {item.globalSource.sourceItemName}.
          This is a merchant-owned MenuItem. Edits here do not change the Global source.
        </Banner>
      ) : (
        <Banner tone="info">Merchant-created item. Not copied from Global Catalog.</Banner>
      )}
      <div className="row-actions">
        <Badge tone={item.isPublished ? 'success' : 'warning'}>
          {item.isPublished ? 'Published' : 'Unpublished'}
        </Badge>
        <Badge tone={item.availability === 'AVAILABLE' ? 'success' : 'warning'}>
          {item.availability}
        </Badge>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Card as="form" onSubmit={onSaveIdentity}>
        <h2>Item</h2>
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
        <Field label="Menu section">
          <select
            name="menuSectionId"
            value={menuSectionId}
            onChange={(e) => setMenuSectionId(e.target.value)}
          >
            <option value="">None — Standard Menu only</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.menuName} / {section.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Availability">
          <select
            name="availability"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            {ITEM_AVAILABILITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Publication">
          <select
            name="isPublished"
            value={isPublished ? 'published' : 'unpublished'}
            onChange={(e) => setIsPublished(e.target.value === 'published')}
          >
            <option value="unpublished">Unpublished — hidden from consumers</option>
            <option value="published">Published — consumer visible when Stage C allows</option>
          </select>
        </Field>
        <p className="lede">
          Publication is not stock. Orderability stays on the server (published + available +
          channel + valid configuration).
        </p>
        <Button type="submit" disabled={busy}>
          Save item
        </Button>
      </Card>

      <Card>
        <h2>Variants (size)</h2>
        <p className="lede">SIZE = VARIANT. Price is converted to integer minor units. No variant deletion in this slice.</p>
        {(item.variants ?? []).map((variant) => (
          <VariantEditor
            key={variant.id}
            variant={variant}
            busy={busy}
            onSave={onSaveVariant}
          />
        ))}
        <form onSubmit={onCreateVariant}>
          <h3>Add variant</h3>
          <Field label="Size">
            <input name="variantSize" value={variantSize} onChange={(e) => setVariantSize(e.target.value)} />
          </Field>
          <Field label="SKU">
            <input name="variantSku" value={variantSku} onChange={(e) => setVariantSku(e.target.value)} />
          </Field>
          <Field label="Price (₹)">
            <input
              name="variantPrice"
              inputMode="decimal"
              value={variantPrice}
              onChange={(e) => setVariantPrice(e.target.value)}
              required
            />
          </Field>
          <Field label="Default variant">
            <select
              name="variantDefault"
              value={variantDefault ? 'yes' : 'no'}
              onChange={(e) => setVariantDefault(e.target.value === 'yes')}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          <Button type="submit" disabled={busy}>
            Add variant
          </Button>
        </form>
      </Card>

      <Card>
        <h2>Modifier groups</h2>
        <p className="lede">
          Required means min select ≥ 1. Single select means max select = 1. Empty max is unlimited.
        </p>
        {(item.addOnGroups ?? []).map((group) => (
          <GroupEditor
            key={group.id}
            group={group}
            variants={item.variants ?? []}
            busy={busy}
            addOnName={addOnName[group.id] ?? ''}
            addOnPrice={addOnPrice[group.id] ?? ''}
            onAddOnName={(value) => setAddOnName((current) => ({ ...current, [group.id]: value }))}
            onAddOnPrice={(value) => setAddOnPrice((current) => ({ ...current, [group.id]: value }))}
            onSaveGroup={onSaveGroup}
            onCreateAddOn={onCreateAddOn}
            onSaveAddOn={onSaveAddOn}
            onSaveVariantPrice={onSaveVariantPrice}
          />
        ))}
        <form onSubmit={onCreateGroup}>
          <h3>Add group</h3>
          <Field label="Group name">
            <input name="groupName" value={groupName} onChange={(e) => setGroupName(e.target.value)} required />
          </Field>
          <Field label="Min select">
            <input name="groupMin" inputMode="numeric" value={groupMin} onChange={(e) => setGroupMin(e.target.value)} />
          </Field>
          <Field label="Max select">
            <input name="groupMax" inputMode="numeric" value={groupMax} onChange={(e) => setGroupMax(e.target.value)} />
          </Field>
          <Field label="Allow quantity">
            <select
              name="groupQty"
              value={groupQty ? 'yes' : 'no'}
              onChange={(e) => setGroupQty(e.target.value === 'yes')}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          <Button type="submit" disabled={busy || !groupName.trim()}>
            Add modifier group
          </Button>
        </form>
      </Card>

      <Card>
        <h2>Channels</h2>
        <p className="lede">
          Channel enablement uses ItemChannelConfig. Disabled channels are not orderable on that
          channel. No new channel types.
        </p>
        {ORDER_CHANNELS.map((channel) => (
          <Field key={channel} label={channel}>
            <select
              name={`channel-${channel}`}
              value={enabledChannels.has(channel) ? 'yes' : 'no'}
              disabled={busy}
              onChange={(e) => void onToggleChannel(channel, e.target.value === 'yes')}
            >
              <option value="no">Disabled</option>
              <option value="yes">Enabled</option>
            </select>
          </Field>
        ))}
      </Card>
    </section>
  );
}

function VariantEditor({
  variant,
  busy,
  onSave,
}: {
  variant: MerchantVariant;
  busy: boolean;
  onSave: (
    variant: MerchantVariant,
    patch: { size: string; sku: string; priceRupees: string; isDefault: boolean; available: boolean },
  ) => Promise<void>;
}) {
  const [size, setSize] = useState(variant.size ?? '');
  const [sku, setSku] = useState(variant.sku ?? '');
  const [priceRupees, setPriceRupees] = useState(minorToRupees(variant.priceMinor));
  const [isDefault, setIsDefault] = useState(Boolean(variant.isDefault));
  const [available, setAvailable] = useState(variant.available !== false);

  useEffect(() => {
    setSize(variant.size ?? '');
    setSku(variant.sku ?? '');
    setPriceRupees(minorToRupees(variant.priceMinor));
    setIsDefault(Boolean(variant.isDefault));
    setAvailable(variant.available !== false);
  }, [variant]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(variant, { size, sku, priceRupees, isDefault, available });
      }}
    >
      <p className="lede">{formatMinor(variant.priceMinor)}</p>
      <Field label="Size">
        <input name={`variant-size-${variant.id}`} value={size} onChange={(e) => setSize(e.target.value)} />
      </Field>
      <Field label="SKU">
        <input name={`variant-sku-${variant.id}`} value={sku} onChange={(e) => setSku(e.target.value)} />
      </Field>
      <Field label="Price (₹)">
        <input
          name={`variant-price-${variant.id}`}
          inputMode="decimal"
          value={priceRupees}
          onChange={(e) => setPriceRupees(e.target.value)}
        />
      </Field>
      <Field label="Default">
        <select
          name={`variant-default-${variant.id}`}
          value={isDefault ? 'yes' : 'no'}
          onChange={(e) => setIsDefault(e.target.value === 'yes')}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </Field>
      <Field label="Available">
        <select
          name={`variant-available-${variant.id}`}
          value={available ? 'yes' : 'no'}
          onChange={(e) => setAvailable(e.target.value === 'yes')}
        >
          <option value="yes">Available</option>
          <option value="no">Unavailable</option>
        </select>
      </Field>
      <Button type="submit" disabled={busy}>
        Save variant
      </Button>
    </form>
  );
}

function GroupEditor({
  group,
  variants,
  busy,
  addOnName,
  addOnPrice,
  onAddOnName,
  onAddOnPrice,
  onSaveGroup,
  onCreateAddOn,
  onSaveAddOn,
  onSaveVariantPrice,
}: {
  group: MerchantAddOnGroup;
  variants: MerchantVariant[];
  busy: boolean;
  addOnName: string;
  addOnPrice: string;
  onAddOnName: (value: string) => void;
  onAddOnPrice: (value: string) => void;
  onSaveGroup: (
    group: MerchantAddOnGroup,
    patch: {
      name: string;
      minSelect: string;
      maxSelect: string;
      allowQuantity: boolean;
      available: boolean;
      sortOrder: string;
    },
  ) => Promise<void>;
  onCreateAddOn: (e: FormEvent, groupId: string) => Promise<void>;
  onSaveAddOn: (
    addOn: MerchantAddOn,
    patch: { name: string; priceRupees: string; available: boolean; isDefault: boolean },
  ) => Promise<void>;
  onSaveVariantPrice: (addOnId: string, variantId: string, priceRupees: string) => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
  const [minSelect, setMinSelect] = useState(String(group.minSelect));
  const [maxSelect, setMaxSelect] = useState(group.maxSelect == null ? '' : String(group.maxSelect));
  const [allowQuantity, setAllowQuantity] = useState(Boolean(group.allowQuantity));
  const [available, setAvailable] = useState(group.available !== false);
  const [sortOrder, setSortOrder] = useState(String(group.sortOrder ?? 0));

  useEffect(() => {
    setName(group.name);
    setMinSelect(String(group.minSelect));
    setMaxSelect(group.maxSelect == null ? '' : String(group.maxSelect));
    setAllowQuantity(Boolean(group.allowQuantity));
    setAvailable(group.available !== false);
    setSortOrder(String(group.sortOrder ?? 0));
  }, [group]);

  return (
    <div>
      <h3>{group.name}</h3>
      <p className="lede">
        {group.minSelect >= 1 ? 'Required' : 'Optional'}
        {group.maxSelect === 1 ? ' · single select' : ' · multi select'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSaveGroup(group, { name, minSelect, maxSelect, allowQuantity, available, sortOrder });
        }}
      >
        <Field label="Name">
          <input name={`group-name-${group.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Min select">
          <input
            name={`group-min-${group.id}`}
            inputMode="numeric"
            value={minSelect}
            onChange={(e) => setMinSelect(e.target.value)}
          />
        </Field>
        <Field label="Max select">
          <input
            name={`group-max-${group.id}`}
            inputMode="numeric"
            value={maxSelect}
            onChange={(e) => setMaxSelect(e.target.value)}
          />
        </Field>
        <Field label="Allow quantity">
          <select
            name={`group-qty-${group.id}`}
            value={allowQuantity ? 'yes' : 'no'}
            onChange={(e) => setAllowQuantity(e.target.value === 'yes')}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="Available">
          <select
            name={`group-available-${group.id}`}
            value={available ? 'yes' : 'no'}
            onChange={(e) => setAvailable(e.target.value === 'yes')}
          >
            <option value="yes">Available</option>
            <option value="no">Unavailable</option>
          </select>
        </Field>
        <Field label="Sort order">
          <input
            name={`group-sort-${group.id}`}
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          Save group
        </Button>
      </form>
      {group.addOns.map((addOn) => (
        <AddOnEditor
          key={addOn.id}
          addOn={addOn}
          variants={variants}
          busy={busy}
          onSave={onSaveAddOn}
          onSaveVariantPrice={onSaveVariantPrice}
        />
      ))}
      <form onSubmit={(e) => void onCreateAddOn(e, group.id)}>
        <Field label="Add-on name">
          <input
            name={`addon-name-${group.id}`}
            value={addOnName}
            onChange={(e) => onAddOnName(e.target.value)}
            required
          />
        </Field>
        <Field label="Add-on price (₹)">
          <input
            name={`addon-price-${group.id}`}
            inputMode="decimal"
            value={addOnPrice}
            onChange={(e) => onAddOnPrice(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy || !addOnName.trim()}>
          Add add-on
        </Button>
      </form>
    </div>
  );
}

function AddOnEditor({
  addOn,
  variants,
  busy,
  onSave,
  onSaveVariantPrice,
}: {
  addOn: MerchantAddOn;
  variants: MerchantVariant[];
  busy: boolean;
  onSave: (
    addOn: MerchantAddOn,
    patch: { name: string; priceRupees: string; available: boolean; isDefault: boolean },
  ) => Promise<void>;
  onSaveVariantPrice: (addOnId: string, variantId: string, priceRupees: string) => Promise<void>;
}) {
  const [name, setName] = useState(addOn.name);
  const [priceRupees, setPriceRupees] = useState(minorToRupees(addOn.priceMinor));
  const [available, setAvailable] = useState(addOn.available !== false);
  const [isDefault, setIsDefault] = useState(Boolean(addOn.isDefault));
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    setName(addOn.name);
    setPriceRupees(minorToRupees(addOn.priceMinor));
    setAvailable(addOn.available !== false);
    setIsDefault(Boolean(addOn.isDefault));
    const next: Record<string, string> = {};
    for (const price of addOn.variantPrices ?? []) {
      next[price.variantId] = minorToRupees(price.priceMinor);
    }
    setVariantPrices(next);
  }, [addOn]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(addOn, { name, priceRupees, available, isDefault });
      }}
    >
      <Field label="Add-on">
        <input name={`addon-edit-name-${addOn.id}`} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Price (₹)">
        <input
          name={`addon-edit-price-${addOn.id}`}
          inputMode="decimal"
          value={priceRupees}
          onChange={(e) => setPriceRupees(e.target.value)}
        />
      </Field>
      <Field label="Available">
        <select
          name={`addon-available-${addOn.id}`}
          value={available ? 'yes' : 'no'}
          onChange={(e) => setAvailable(e.target.value === 'yes')}
        >
          <option value="yes">Available</option>
          <option value="no">Unavailable</option>
        </select>
      </Field>
      <Field label="Default">
        <select
          name={`addon-default-${addOn.id}`}
          value={isDefault ? 'yes' : 'no'}
          onChange={(e) => setIsDefault(e.target.value === 'yes')}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </Field>
      <Button type="submit" disabled={busy}>
        Save add-on
      </Button>
      {variants.map((variant) => (
        <Field key={variant.id} label={`Price for ${variant.size || 'variant'} (₹)`}>
          <input
            name={`addon-variant-price-${addOn.id}-${variant.id}`}
            inputMode="decimal"
            value={variantPrices[variant.id] ?? ''}
            onChange={(e) =>
              setVariantPrices((current) => ({ ...current, [variant.id]: e.target.value }))
            }
            onBlur={() => {
              const value = variantPrices[variant.id];
              if (!value?.trim()) return;
              void onSaveVariantPrice(addOn.id, variant.id, value);
            }}
          />
        </Field>
      ))}
    </form>
  );
}
