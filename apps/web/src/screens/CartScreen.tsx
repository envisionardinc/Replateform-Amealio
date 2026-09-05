import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cartApi, type PricedCart } from '../lib/api';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';
import { StatusPanel } from '../components/StatusPanel';

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
        <p className="banner empty">
          Guest cart is not on this Nest slice. <Link to="/login?next=/cart">Sign in</Link> to use
          the server cart.
        </p>
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
      <p className="muted">
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
          <article className="card" key={line.id}>
            <div className="row">
              <div>
                <strong>{line.name ?? 'Item'}</strong>
                <p className="muted">
                  {line.variantSnapshot ?? ''} ·{' '}
                  {formatMinor(line.unitPriceMinor, line.currencyCode)} × {line.quantity}
                </p>
                {!line.available ? (
                  <span className="badge">Unavailable — not in subtotal</span>
                ) : null}
              </div>
              <div>
                <button
                  type="button"
                  className="secondary"
                  disabled={line.quantity <= 1}
                  onClick={() => void changeQty(line.id, line.quantity - 1)}
                >
                  −
                </button>{' '}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void changeQty(line.id, line.quantity + 1)}
                >
                  +
                </button>{' '}
                <button type="button" onClick={() => void remove(line.id)}>
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
        {cart ? (
          <p className="card">
            Server subtotal: <strong>{formatMinor(cart.subtotalMinor, cart.currencyCode)}</strong>
          </p>
        ) : null}
        {cart && cart.items.length > 0 ? <Link to="/checkout">Continue to checkout</Link> : null}
      </StatusPanel>
    </section>
  );
}
