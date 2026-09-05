import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { ordersApi, type CheckoutResult, type Order } from '../lib/api';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';

function statusTone(status: string): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger';
  if (status === 'DELIVERED' || status === 'COMPLETED') return 'success';
  if (status === 'PENDING' || status === 'CONFIRMED') return 'info';
  return 'neutral';
}

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
          <Card>
            <p>
              <Badge tone={statusTone(order.status)}>{order.status}</Badge> · {order.type}
            </p>
            <p className="lede">#{order.orderNumber ?? order.id}</p>
            <ul>
              {order.items.map((line) => (
                <li key={line.id}>
                  {line.nameSnapshot} × {line.quantity} —{' '}
                  {formatMinor(line.lineTotalMinor, order.currencyCode)}
                </li>
              ))}
            </ul>
            <p className="price">
              Grand total {formatMinor(order.grandTotalMinor, order.currencyCode)}
            </p>
            {order.paymentIntents.map((p) => (
              <p className="lede" key={p.id}>
                Payment {p.method} · {p.status} · {formatMinor(p.amountMinor, order.currencyCode)}
                {p.razorpayOrderId ? ` · ${p.razorpayOrderId}` : ''}
              </p>
            ))}
            {checkout?.settlement === 'PREPAID' && checkout.payment?.status === 'CREATED' ? (
              <Banner tone="warning">
                Payment intent created. Capture/verify is the existing payment API, not this page.
              </Banner>
            ) : null}
            <Button variant="secondary" onClick={() => void load()}>
              Refresh status
            </Button>
          </Card>
        ) : null}
      </StatusPanel>
    </section>
  );
}
