import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ordersApi, type CheckoutResult, type Order } from '../lib/api';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';
import { StatusPanel } from '../components/StatusPanel';

export function OrderScreen() {
  const { id = '' } = useParams();
  const location = useLocation();
  const checkout = (location.state as { checkout?: CheckoutResult } | null)?.checkout;
  const [order, setOrder] = useState<Order | null>(checkout?.order ?? null);
  const [loading, setLoading] = useState(!checkout);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      setError('Sign in to view this order.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setOrder(await ordersApi.get(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <p>
        <Link to="/orders">← Orders</Link>
      </p>
      <h1>Order</h1>
      <StatusPanel loading={loading} error={error} onRetry={() => void load()}>
        {order ? (
          <article className="card">
            <p>
              <span className="badge">{order.status}</span> · {order.type}
            </p>
            <p className="muted">#{order.orderNumber ?? order.id}</p>
            <ul>
              {order.items.map((line) => (
                <li key={line.id}>
                  {line.nameSnapshot} × {line.quantity} —{' '}
                  {formatMinor(line.lineTotalMinor, order.currencyCode)}
                </li>
              ))}
            </ul>
            <p>
              Grand total <strong>{formatMinor(order.grandTotalMinor, order.currencyCode)}</strong>
            </p>
            {order.paymentIntents.map((p) => (
              <p className="muted" key={p.id}>
                Payment {p.method} · {p.status} · {formatMinor(p.amountMinor, order.currencyCode)}
                {p.razorpayOrderId ? ` · ${p.razorpayOrderId}` : ''}
              </p>
            ))}
            {checkout?.settlement === 'PREPAID' && checkout.payment?.status === 'CREATED' ? (
              <p className="banner warn">
                Payment intent created. Capture/verify is the existing payment API, not this page.
              </p>
            ) : null}
            <button type="button" className="secondary" onClick={() => void load()}>
              Refresh status
            </button>
          </article>
        ) : null}
      </StatusPanel>
    </section>
  );
}
