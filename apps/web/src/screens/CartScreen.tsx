import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { QuoteTotals } from '../components/QuoteTotals';
import { cartApi, type PricedCart } from '../lib/api';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';

export function CartScreen() {
  const signedIn = isAuthenticated();
  const [cart, setCart] = useState<PricedCart | null>(null);
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated()) return;
    setLoading(true);
    setError(null);
    try {
      setCart(await cartApi.get());
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
      setCart(await cartApi.update(id, quantity));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function remove(id: string) {
    try {
      setCart(await cartApi.remove(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
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
