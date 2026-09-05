import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Badge } from '../../../web/src/design-system/Badge';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Banner } from '../../../web/src/design-system/Banner';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import { merchantOrdersApi, type MerchantOrder } from '../lib/api';
import { formatMinor, isCapturedPayment } from '../lib/money';
import { isAuthenticated } from '../lib/session';

function tone(status: string): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger';
  if (status === 'DELIVERED' || status === 'COMPLETED') return 'success';
  if (status === 'PENDING' || status === 'READY') return 'info';
  if (status === 'ON_THE_WAY') return 'warning';
  return 'neutral';
}

export function OrdersScreen() {
  const [lane, setLane] = useState<'active' | 'history'>('active');
  const [status, setStatus] = useState('');
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await merchantOrdersApi.list({
        lane,
        status: status || undefined,
      });
      setOrders(res.data);
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [lane, status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAuthenticated()) return <Navigate to="/login" replace />;

  return (
    <section>
      <h1>Orders</h1>
      <p className="lede">Server list. Status changes use named toStatus + expectedStatus.</p>
      <div className="row-actions">
        <Button
          variant={lane === 'active' ? 'primary' : 'secondary'}
          onClick={() => setLane('active')}
        >
          Active
        </Button>
        <Button
          variant={lane === 'history' ? 'primary' : 'secondary'}
          onClick={() => setLane('history')}
        >
          History
        </Button>
      </div>
      <Field label="Status filter">
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="PENDING">PENDING</option>
          <option value="CONFIRMED">CONFIRMED</option>
          <option value="PREPARING">PREPARING</option>
          <option value="READY">READY</option>
          <option value="ON_THE_WAY">ON_THE_WAY</option>
          <option value="DELIVERED">DELIVERED</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
      </Field>
      {loading ? (
        <div role="status">
          <p className="lede">Loading…</p>
          <Skeleton />
        </div>
      ) : null}
      {error ? (
        <Banner tone="error">
          <p>{error}</p>
          <Button onClick={() => void load()}>Retry</Button>
        </Banner>
      ) : null}
      {!loading && !error && orders.length === 0 ? (
        <Banner tone="empty">No orders in this lane.</Banner>
      ) : null}
      {orders.map((order) => {
        const paid = order.paymentIntents.some((p) => isCapturedPayment(p.status));
        return (
          <Card key={order.id}>
            <div className="row">
              <div>
                <h2>
                  <Link to={`/orders/${order.id}`}>
                    #{order.orderNumber ?? order.id.slice(0, 8)}
                  </Link>
                </h2>
                <p className="lede">
                  <Badge tone={tone(order.status)}>{order.status}</Badge> · {order.type} ·{' '}
                  {paid ? 'Paid' : 'Unpaid / COD'}
                </p>
                <p className="price">{formatMinor(order.grandTotalMinor, order.currencyCode)}</p>
              </div>
              <Link to={`/orders/${order.id}`}>Open</Link>
            </div>
          </Card>
        );
      })}
    </section>
  );
}
