import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { CouponField } from '../components/CouponField';
import { QuoteTotals } from '../components/QuoteTotals';
import { cartApi, promoCodeFromError, type PricedCart } from '../lib/api';
import { formatMinor } from '../lib/money';
import { clearCouponCode, getCouponCode, isAuthenticated, setCouponCode } from '../lib/session';

export function CartScreen() {
  const signedIn = isAuthenticated();
  const [cart, setCart] = useState<PricedCart | null>(null);
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated()) return;
    setLoading(true);
    setError(null);
    try {
      setCart(await cartApi.get(getCouponCode() || undefined));
      setPromoError(null);
    } catch (err) {
      setCart(null);
      setError(err instanceof Error ? err.message : 'Could not load cart');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!signedIn) {
    return (
      <section>
        <h1>Cart</h1>
        <Banner tone="empty">
          Guest cart is not on this Nest slice. <Link to="/login?next=/cart">Sign in</Link> to use
          the server cart.
        </Banner>
      </section>
    );
  }

  async function changeQty(id: string, quantity: number) {
    try {
      setCart(await cartApi.update(id, quantity, getCouponCode() || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function remove(id: string) {
    try {
      setCart(await cartApi.remove(id, getCouponCode() || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    }
  }

  async function applyCoupon(code: string) {
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
  }

  async function clearCoupon() {
    setPromoBusy(true);
    setPromoError(null);
    clearCouponCode();
    try {
      setCart(await cartApi.get());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load cart');
    } finally {
      setPromoBusy(false);
    }
  }

  const empty = !loading && !error && (cart?.items.length ?? 0) === 0;

  return (
    <section>
      <h1>Cart</h1>
      <p className="lede">
        Totals come from <code>GET /api/v1/cart</code>. Unavailable lines are excluded from the
        subtotal.
      </p>
      <StatusPanel
        loading={loading}
        error={error}
        empty={empty ? 'Your cart is empty.' : null}
        onRetry={() => void load()}
      >
        {cart?.items.map((line) => (
          <Card key={line.id}>
            <div className="row">
              <div>
                <strong>{line.name ?? 'Item'}</strong>
                <p className="lede">
                  {line.variantSnapshot ?? ''} ·{' '}
                  {formatMinor(line.unitPriceMinor, line.currencyCode)} × {line.quantity}
                  {line.modifierTotalMinor && Number(line.modifierTotalMinor) > 0
                    ? ` · customizations ${formatMinor(line.modifierTotalMinor, line.currencyCode)}`
                    : ''}
                </p>
                {line.addOns?.modifierGroups?.some((g) => (g.selections?.length ?? 0) > 0) ? (
                  <p className="lede">
                    {line.addOns.modifierGroups.reduce(
                      (n, g) => n + (g.selections?.length ?? 0),
                      0,
                    )}{' '}
                    selected option(s)
                  </p>
                ) : null}
                {!line.available ? (
                  <Badge tone="warning">Unavailable — not in subtotal</Badge>
                ) : null}
              </div>
              <div className="row-actions">
                <Button
                  variant="secondary"
                  disabled={line.quantity <= 1}
                  onClick={() => void changeQty(line.id, line.quantity - 1)}
                >
                  −
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void changeQty(line.id, line.quantity + 1)}
                >
                  +
                </Button>
                <Button variant="ghost" onClick={() => void remove(line.id)}>
                  Remove
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {cart ? (
          <Card>
            <CouponField
              applied={cart.promotion}
              error={promoError}
              busy={promoBusy}
              onApply={applyCoupon}
              onClear={clearCoupon}
            />
            <QuoteTotals
              currencyCode={cart.currencyCode}
              merchandiseSubtotalMinor={cart.merchandiseSubtotalMinor ?? cart.subtotalMinor}
              discountMinor={cart.discountMinor}
              taxTotalMinor={cart.taxTotalMinor}
              feeTotalMinor={cart.feeTotalMinor}
              grandTotalMinor={cart.grandTotalMinor ?? cart.subtotalMinor}
            />
          </Card>
        ) : null}
        {cart && cart.items.length > 0 ? (
          <div className="sticky-cta">
            <Link className="btn btn-primary" to="/checkout">
              Continue to checkout
            </Link>
          </div>
        ) : null}
      </StatusPanel>
    </section>
  );
}
