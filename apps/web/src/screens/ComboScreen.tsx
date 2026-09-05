import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { Chip } from '../design-system/Chip';
import { QuoteTotals } from '../components/QuoteTotals';
import {
  cartApi,
  discoverApi,
  type ComboSelectionPayload,
  type ConsumerCombo,
  type MerchandiseQuote,
} from '../lib/api';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';

export function ComboScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [combo, setCombo] = useState<ConsumerCombo | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<MerchandiseQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quoting, setQuoting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await discoverApi.combo(id, 'HOME_DELIVERY');
      const next: Record<string, string> = {};
      for (const slot of data.slots) {
        const def = slot.options.find((option) => option.isDefault) ?? slot.options[0];
        if (def) next[slot.id] = def.menuItemId;
      }
      setCombo(data);
      setPicks(next);
    } catch (err) {
      setCombo(null);
      setError(err instanceof Error ? err.message : 'Combo not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const selections: ComboSelectionPayload[] = useMemo(
    () =>
      combo
        ? combo.slots.map((slot) => ({
            slotId: slot.id,
            menuItemId: picks[slot.id] ?? slot.options[0]?.menuItemId ?? '',
          }))
        : [],
    [combo, picks],
  );

  const sellable = combo?.orderable !== false && combo?.availability === 'AVAILABLE';

  useEffect(() => {
    if (!combo || !sellable) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setQuoteError(null);
    void discoverApi
      .quote({
        comboId: combo.id,
        quantity: 1,
        type: 'HOME_DELIVERY',
        selections: combo.substitutable ? selections : undefined,
      })
      .then((data) => {
        if (!cancelled) setQuote(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(err instanceof Error ? err.message : 'Could not price this combo');
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [combo, sellable, selections]);

  async function addToCart() {
    if (!combo || !quote) return;
    if (!isAuthenticated()) {
      navigate(`/login?next=/combos/${combo.id}`);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await cartApi.add({
        comboId: combo.id,
        quantity: 1,
        restaurantId: combo.restaurantId,
        type: 'HOME_DELIVERY',
        selections: combo.substitutable ? selections : undefined,
      });
      navigate('/cart');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add to cart');
    } finally {
      setBusy(false);
    }
  }

  const nameByItem = new Map((combo?.components ?? []).map((row) => [row.menuItemId, row.name]));

  return (
    <section>
      <p>
        {combo ? (
          <Link to={`/restaurants/${combo.restaurantId}`}>← Menu</Link>
        ) : (
          <Link to="/">← Home</Link>
        )}
      </p>
      <StatusPanel loading={loading} error={error} onRetry={() => void load()}>
        {combo ? (
          <Card>
            <div className="row">
              <h1>{combo.name}</h1>
              {!sellable ? <Badge tone="warning">Not orderable</Badge> : null}
            </div>
            <p className="lede">
              {combo.description || 'Meal deal. Price is the fixed combo price from the server.'}
            </p>
            <p className="price">{formatMinor(combo.comboPriceMinor, combo.currencyCode)}</p>
            {combo.slots
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((slot) => (
                <div key={slot.id}>
                  <h2>{slot.name ?? 'Component'}</h2>
                  {combo.substitutable ? (
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      {slot.options.map((option) => (
                        <Chip
                          key={option.id}
                          selected={picks[slot.id] === option.menuItemId}
                          onClick={() =>
                            setPicks((prev) => ({ ...prev, [slot.id]: option.menuItemId }))
                          }
                        >
                          {nameByItem.get(option.menuItemId) ?? option.menuItemId}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <p className="lede">
                      {nameByItem.get(
                        slot.options.find((option) => option.isDefault)?.menuItemId ??
                          slot.options[0]?.menuItemId ??
                          '',
                      ) ?? 'Fixed component'}
                    </p>
                  )}
                </div>
              ))}
            {quoting ? <p className="lede">Updating server quote…</p> : null}
            {quoteError ? <Banner tone="warning">{quoteError}</Banner> : null}
            {actionError ? <Banner tone="warning">{actionError}</Banner> : null}
            {quote ? (
              <QuoteTotals
                currencyCode={quote.currencyCode}
                merchandiseSubtotalMinor={
                  quote.merchandiseSubtotalMinor ?? quote.lineMerchandiseMinor
                }
                discountMinor={quote.discountMinor}
                taxTotalMinor={quote.taxTotalMinor}
                feeTotalMinor={quote.feeTotalMinor}
                grandTotalMinor={quote.grandTotalMinor ?? quote.lineMerchandiseMinor}
              />
            ) : null}
            <div className="form-actions">
              <Button disabled={!sellable || !quote || busy} onClick={() => void addToCart()}>
                Add combo to cart
              </Button>
            </div>
          </Card>
        ) : null}
      </StatusPanel>
    </section>
  );
}
