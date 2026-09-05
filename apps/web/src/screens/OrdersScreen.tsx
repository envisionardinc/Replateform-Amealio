import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { ordersApi, type Order } from '../lib/api';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';
import { orderStatusTone } from '../lib/tracking';

export function OrdersScreen() {
  const [lane, setLane] = useState<'active' | 'history'>('active');
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
      const res = await ordersApi.list({ lane });
      setOrders(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [lane]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <h1>Your orders</h1>
      <p className="lede">Active is in-progress. History is completed, cancelled, or returned.</p>
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
      <StatusPanel
        loading={loading}
        error={error}
        empty={
          !loading && !error && orders.length === 0
            ? lane === 'active'
              ? 'No active orders.'
              : 'No past orders.'
            : null
        }
        onRetry={() => void load()}
      >
        {orders.map((order) => (
          <Card key={order.id}>
            <div className="row">
              <div>
                <h2>
                  <Link to={`/orders/${order.id}`}>
                    {order.orderNumber ?? order.id.slice(0, 8)}
                  </Link>
                </h2>
                <p className="lede">
                  {order.type} · {formatMinor(order.grandTotalMinor, order.currencyCode)}
                </p>
              </div>
              <Badge tone={orderStatusTone(order.status)}>{order.status}</Badge>
            </div>
          </Card>
        ))}
      </StatusPanel>
    </section>
  );
}
