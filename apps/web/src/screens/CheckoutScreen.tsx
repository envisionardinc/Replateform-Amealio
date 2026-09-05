import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { Field } from '../design-system/Field';
import { CouponField } from '../components/CouponField';
import { QuoteTotals } from '../components/QuoteTotals';
import {
  addressesApi,
  cartApi,
  checkoutApi,
  promoCodeFromError,
  type PricedCart,
  type SavedAddress,
} from '../lib/api';
import { formatAddressLines } from '../lib/addresses';
import {
  clearCheckoutKey,
  clearCouponCode,
  getCouponCode,
  getOrCreateCheckoutKey,
  isAuthenticated,
  setCouponCode,
} from '../lib/session';

function requiresCheckoutAddress(type: string | null | undefined): boolean {
  return type === 'HOME_DELIVERY' || type === 'CATERING';
}

export function CheckoutScreen() {
  const navigate = useNavigate();
  const [cart, setCart] = useState<PricedCart | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<'COD' | 'PREPAID'>('COD');
  const [busy, setBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      navigate('/login?next=/checkout');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextCart = await cartApi.get(getCouponCode() || undefined);
      setCart(nextCart);
      setPromoError(null);
      if (requiresCheckoutAddress(nextCart.type ?? 'HOME_DELIVERY')) {
        const book = await addressesApi.list();
        setAddresses(book.data);
        setAddressId((current) => {
          if (current && book.data.some((row) => row.id === current)) return current;
          return book.data.find((row) => row.isDefault)?.id ?? book.data[0]?.id ?? '';
        });
      } else {
        setAddresses([]);
        setAddressId('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load cart');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const type = cart?.type ?? 'HOME_DELIVERY';
  const needsAddress = requiresCheckoutAddress(type);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cart) return;
    if (needsAddress && !addressId) {
      setError('Select a delivery address to place this order.');
      return;
    }
    setBusy(true);
    setError(null);
    const key = getOrCreateCheckoutKey();
    try {
      const result = await checkoutApi.place(
        {
          restaurantId: cart.restaurantId ?? undefined,
          type,
          settlement,
          couponCode: getCouponCode() || undefined,
          addressId: needsAddress ? addressId : undefined,
        },
        key,
      );
      clearCheckoutKey();
      clearCouponCode();
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
            <CouponField
              applied={cart.promotion}
              error={promoError}
              busy={promoBusy}
              onApply={async (code) => {
                setPromoBusy(true);
                setPromoError(null);
                try {
                  const next = await cartApi.get(code);
                  setCouponCode(code);
                  setCart(next);
                } catch (err) {
                  setPromoError(
                    promoCodeFromError(err)
                      ? `${promoCodeFromError(err)} — ${err instanceof Error ? err.message : 'Invalid code'}`
                      : err instanceof Error
                        ? err.message
                        : 'Invalid code',
                  );
                } finally {
                  setPromoBusy(false);
                }
              }}
              onClear={async () => {
                clearCouponCode();
                setPromoError(null);
                setCart(await cartApi.get());
              }}
            />
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
            {needsAddress ? (
              <fieldset>
                <legend>Delivery address</legend>
                <p className="lede">
                  The server copies this address onto the order. Later book edits do not change a
                  placed order.
                </p>
                {addresses.length === 0 ? (
                  <Banner tone="empty">
                    Add a saved address before placing a delivery order.{' '}
                    <Link to="/addresses">Open address book</Link>
                  </Banner>
                ) : (
                  addresses.map((row) => (
                    <label key={row.id} className="row">
                      <input
                        type="radio"
                        name="addressId"
                        value={row.id}
                        checked={addressId === row.id}
                        onChange={() => setAddressId(row.id)}
                      />
                      <span>
                        {row.label ? <strong>{row.label} · </strong> : null}
                        {formatAddressLines(row)}
                        {row.isDefault ? (
                          <>
                            {' '}
                            <Badge>Default</Badge>
                          </>
                        ) : null}
                      </span>
                    </label>
                  ))
                )}
                <p>
                  <Link to="/addresses">Manage saved addresses</Link>
                </p>
              </fieldset>
            ) : (
              <Banner tone="empty">
                {type.replaceAll('_', ' ')} does not require a delivery address.
              </Banner>
            )}
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
              <Button type="submit" disabled={busy || (needsAddress && !addressId)}>
                {busy ? 'Placing order…' : 'Place order'}
              </Button>
            </div>
          </Card>
        ) : null}
      </StatusPanel>
    </section>
  );
}
