import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FavoriteButton } from '../components/FavoriteButton';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { Chip } from '../design-system/Chip';
import {
  cartApi,
  discoverApi,
  type CatalogModifierGroup,
  type MenuItem,
  type MerchandiseQuote,
} from '../lib/api';
import {
  catalogAdjustmentMinor,
  initialSelections,
  setModifierQuantity,
  toModifierGroupPayload,
  toggleModifier,
  type SelectionMap,
} from '../lib/merchandise';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';

export function ItemScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<MenuItem | null>(null);
  const [variantId, setVariantId] = useState('');
  const [selections, setSelections] = useState<SelectionMap>({});
  const [quote, setQuote] = useState<MerchandiseQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quoting, setQuoting] = useState(false);

  const groups = useMemo(
    () => (item?.modifierGroups ?? []).filter((group) => group.available).sort(bySort),
    [item],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await discoverApi.item(id);
      const firstAvailable = data.variants.find((row) => row.available) ?? data.variants[0];
      setItem(data);
      setVariantId(firstAvailable?.id ?? '');
      setSelections(initialSelections(data.modifierGroups ?? []));
    } catch (err) {
      setItem(null);
      setError(err instanceof Error ? err.message : 'Item not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const variant = item?.variants.find((row) => row.id === variantId) ?? item?.variants[0];
  const sellable = item?.availability === 'AVAILABLE' && variant?.available === true;
  const payload = useMemo(() => toModifierGroupPayload(groups, selections), [groups, selections]);

  useEffect(() => {
    if (!item || !variant || !sellable) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setQuoteError(null);
    void discoverApi
      .quote({
        variantId: variant.id,
        quantity: 1,
        type: 'HOME_DELIVERY',
        modifierGroups: payload,
      })
      .then((data) => {
        if (!cancelled) setQuote(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(err instanceof Error ? err.message : 'Could not price this configuration');
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item, variant, sellable, payload]);

  function updateGroup(group: CatalogModifierGroup, next: SelectionMap[string], message?: string) {
    setSelections((prev) => ({ ...prev, [group.id]: next }));
    setActionError(message ?? null);
  }

  async function addToCart() {
    if (!item || !variant || !quote) return;
    if (!isAuthenticated()) {
      navigate(`/login?next=/items/${item.id}`);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await cartApi.add({
        variantId: variant.id,
        quantity: 1,
        restaurantId: item.restaurantId,
        type: 'HOME_DELIVERY',
        modifierGroups: payload,
      });
      navigate('/cart');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add to cart');
    } finally {
      setBusy(false);
    }
  }

  const merchandise = quote
    ? formatMinor(quote.unitMerchandiseMinor, quote.currencyCode)
    : variant
      ? formatMinor(variant.priceMinor, variant.currencyCode)
      : null;

  return (
    <section>
      <p>
        {item ? (
          <Link to={`/restaurants/${item.restaurantId}`}>← Menu</Link>
        ) : (
          <Link to="/">← Home</Link>
        )}
      </p>
      <StatusPanel loading={loading} error={error} onRetry={() => void load()}>
        {item ? (
          <Card>
            <div className="row">
              <h1>{item.name}</h1>
              <FavoriteButton
                targetType="MENU_ITEM"
                targetId={item.id}
                next={`/items/${item.id}`}
              />
            </div>
            <p className="lede">{item.description || 'No description'}</p>

            <div className="modifier-group">
              <div className="modifier-group-head">
                <h2>Size</h2>
              </div>
              <div className="chip-rail chip-wrap">
                {item.variants.map((row) => (
                  <Chip
                    key={row.id}
                    selected={row.id === variantId}
                    unavailable={!row.available}
                    onClick={() => setVariantId(row.id)}
                  >
                    {row.size ?? 'Regular'} · {formatMinor(row.priceMinor, row.currencyCode)}
                  </Chip>
                ))}
              </div>
            </div>

            {groups.map((group) => (
              <ModifierGroupFields
                key={group.id}
                group={group}
                variantId={variantId}
                selected={selections[group.id] ?? {}}
                onToggle={(modifierId) => {
                  const result = toggleModifier(group, selections[group.id] ?? {}, modifierId);
                  updateGroup(group, result.selected, result.error);
                }}
                onQuantity={(modifierId, quantity) => {
                  const result = setModifierQuantity(
                    group,
                    selections[group.id] ?? {},
                    modifierId,
                    quantity,
                  );
                  updateGroup(group, result.selected, result.error);
                }}
              />
            ))}

            {!sellable ? (
              <Banner tone="warning">
                This item is not available. The server will reject add-to-cart.
              </Banner>
            ) : null}
            {quoteError ? <Banner tone="error">{quoteError}</Banner> : null}
            <StatusPanel error={actionError} />

            <p className="price" aria-live="polite">
              {quoting && !quote ? 'Pricing…' : merchandise}
            </p>
            <p className="lede">
              Merchandise total is quoted by the server. This screen never sends a price.
            </p>

            <div className="sticky-cta">
              <Button
                type="button"
                disabled={!sellable || busy || !quote || Boolean(quoteError)}
                onClick={() => void addToCart()}
              >
                {busy ? 'Adding…' : merchandise ? `Add to cart · ${merchandise}` : 'Add to cart'}
              </Button>
            </div>
          </Card>
        ) : null}
      </StatusPanel>
    </section>
  );
}

function ModifierGroupFields({
  group,
  variantId,
  selected,
  onToggle,
  onQuantity,
}: {
  group: CatalogModifierGroup;
  variantId: string;
  selected: Record<string, number>;
  onToggle: (modifierId: string) => void;
  onQuantity: (modifierId: string, quantity: number) => void;
}) {
  const rule =
    group.minSelect === group.maxSelect && group.minSelect > 0
      ? `Choose ${group.minSelect}`
      : `Choose ${group.minSelect}${group.maxSelect != null ? `–${group.maxSelect}` : '+'}`;

  return (
    <div className="modifier-group">
      <div className="modifier-group-head">
        <h2>{group.name}</h2>
        <span className="lede">
          {group.required ? <Badge tone="info">Required</Badge> : <Badge>Optional</Badge>} {rule}
        </span>
      </div>
      <div className="chip-rail chip-wrap">
        {group.modifiers.map((modifier) => {
          const qty = selected[modifier.id] ?? 0;
          const adjustment = catalogAdjustmentMinor(modifier, variantId);
          const priced =
            Number(adjustment) > 0 ? ` · +${formatMinor(adjustment, modifier.currencyCode)}` : '';
          return (
            <span key={modifier.id} className="modifier-choice">
              <Chip
                selected={qty > 0}
                unavailable={!modifier.available}
                onClick={() => onToggle(modifier.id)}
              >
                {modifier.name}
                {priced}
              </Chip>
              {group.allowQuantity && qty > 0 ? (
                <span className="modifier-qty">
                  <Button
                    variant="secondary"
                    disabled={qty <= 1 && group.minSelect > 0}
                    onClick={() => onQuantity(modifier.id, qty - 1)}
                  >
                    −
                  </Button>
                  <span>{qty}</span>
                  <Button variant="secondary" onClick={() => onQuantity(modifier.id, qty + 1)}>
                    +
                  </Button>
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function bySort(a: { sortOrder: number }, b: { sortOrder: number }): number {
  return a.sortOrder - b.sortOrder;
}
