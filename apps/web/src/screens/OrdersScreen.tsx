import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Card } from '../design-system/Card';
import { ordersApi, type Order } from '../lib/api';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';

export function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      setError('Sign in to view orders.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await ordersApi.list();
      setOrders(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <h1>Your orders</h1>
      <StatusPanel
        loading={loading}
        error={error}
        empty={!loading && !error && orders.length === 0 ? 'No orders yet.' : null}
        onRetry={() => void load()}
      >
        {orders.map((order) => (
          <Card key={order.id}>
            <div className="row">
              <div>
                <Link to={`/orders/${order.id}`}>{order.orderNumber ?? order.id}</Link>
                <p className="lede">
                  {order.status} · {formatMinor(order.grandTotalMinor, order.currencyCode)}
                </p>
              </div>
              <Badge tone="info">{order.status}</Badge>
            </div>
          </Card>
        ))}
      </StatusPanel>
    </section>
  );
}
