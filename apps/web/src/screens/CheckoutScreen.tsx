import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { Field } from '../design-system/Field';
import { QuoteTotals } from '../components/QuoteTotals';
import { cartApi, checkoutApi, type PricedCart } from '../lib/api';
import { clearCheckoutKey, getOrCreateCheckoutKey, isAuthenticated } from '../lib/session';

export function CheckoutScreen() {
  const navigate = useNavigate();
  const [cart, setCart] = useState<PricedCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<'COD' | 'PREPAID'>('COD');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      navigate('/login?next=/checkout');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCart(await cartApi.get());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load cart');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cart) return;
    setBusy(true);
    setError(null);
    const key = getOrCreateCheckoutKey();
    try {
      const result = await checkoutApi.place(
        {
          restaurantId: cart.restaurantId ?? undefined,
          type: cart.type ?? 'HOME_DELIVERY',
          settlement,
        },
        key,
      );
      clearCheckoutKey();
      navigate(`/orders/${result.order.id}`, { state: { checkout: result } });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Checkout failed — retry uses the same Idempotency-Key',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p>
        <Link to="/cart">← Cart</Link>
      </p>
      <h1>Checkout</h1>
      <StatusPanel
        loading={loading}
        error={error}
        empty={!loading && !error && (cart?.items.length ?? 0) === 0 ? 'Cart is empty.' : null}
        onRetry={() => void load()}
      >
        {cart && cart.items.length > 0 ? (
          <Card as="form" onSubmit={(e) => void onSubmit(e)}>
            <QuoteTotals
              currencyCode={cart.currencyCode}
              merchandiseSubtotalMinor={cart.merchandiseSubtotalMinor ?? cart.subtotalMinor}
              discountMinor={cart.discountMinor}
              taxTotalMinor={cart.taxTotalMinor}
              feeTotalMinor={cart.feeTotalMinor}
              grandTotalMinor={cart.grandTotalMinor ?? cart.subtotalMinor}
            />
            <p className="lede">
              Totals come from the server quote. This page never sends a price, tax, or fee.
            </p>
            <Field label="Settlement">
              <select
                value={settlement}
                onChange={(e) => setSettlement(e.target.value as 'COD' | 'PREPAID')}
              >
                <option value="COD">Cash on delivery</option>
                <option value="PREPAID">
                  Prepaid (creates a Razorpay intent; verify is not in this UI)
                </option>
              </select>
            </Field>
            {settlement === 'PREPAID' ? (
              <Banner tone="warning">
                Prepaid checkout is a real API call. Completing payment needs Razorpay credentials
                and <code>POST /api/v1/payments/verify</code> — not configured in this consumer
                slice.
              </Banner>
            ) : null}
            <div className="sticky-cta">
              <Button type="submit" disabled={busy}>
                {busy ? 'Placing order…' : 'Place order'}
              </Button>
            </div>
          </Card>
        ) : null}
      </StatusPanel>
    </section>
  );
}
