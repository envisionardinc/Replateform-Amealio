import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { ApiError, discoverApi, ordersApi, type CheckoutResult, type Order } from '../lib/api';
import { formatAddressLines } from '../lib/addresses';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';
import { canCancel, isTerminalStatus, orderStatusTone } from '../lib/tracking';

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN');
}

export function OrderScreen() {
  const { id = '' } = useParams();
  const location = useLocation();
  const checkout = (location.state as { checkout?: CheckoutResult } | null)?.checkout;
  const [order, setOrder] = useState<Order | null>(checkout?.order ?? null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(!checkout);
  const [busy, setBusy] = useState(false);
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
      const next = await ordersApi.get(id);
      setOrder(next);
      try {
        const restaurant = await discoverApi.restaurant(next.restaurantId);
        setRestaurantName(restaurant.name);
      } catch {
        setRestaurantName(null);
      }
    } catch (err) {
      setOrder(null);
      setError(err instanceof Error ? err.message : 'Order not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order || isTerminalStatus(order.status)) return;
    const timer = window.setInterval(() => {
      void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [order, load]);

  async function onCancel() {
    if (!order || !canCancel(order.status)) return;
    setBusy(true);
    setError(null);
    try {
      setOrder(
        await ordersApi.cancel(order.id, {
          expectedStatus: order.status,
          reason: 'CUSTOMER_CANCEL',
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Order changed on the server. Reloaded the latest status.');
        await load();
      } else {
        setError(err instanceof Error ? err.message : 'Could not cancel');
        try {
          setOrder(await ordersApi.get(id));
        } catch {
          /* keep previous */
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const events = order?.statusEvents ?? [];

  return (
    <section>
      <p>
        <Link to="/orders">← Orders</Link>
      </p>
      <h1>Track order</h1>
      <p className="lede">
        Server status events. No live map on this slice. Cancel is allowed only while INITIAL or
        PENDING.
      </p>
      <StatusPanel loading={loading} error={error} onRetry={() => void load()}>
        {order ? (
          <Card>
            <p>
              <Badge tone={orderStatusTone(order.status)}>{order.status}</Badge> · {order.type}
            </p>
            <p className="lede">#{order.orderNumber ?? order.id}</p>
            {restaurantName ? (
              <p>
                <Link to={`/restaurants/${order.restaurantId}`}>{restaurantName}</Link>
              </p>
            ) : null}
            {order.deliveryAddressSnapshot?.line1 ? (
              <p className="lede">
                Deliver to
                {order.deliveryAddressSnapshot.label
                  ? ` ${order.deliveryAddressSnapshot.label} · `
                  : ' '}
                {formatAddressLines(order.deliveryAddressSnapshot)}
              </p>
            ) : null}
            {events.length > 0 ? (
              <ol className="track-list" aria-label="Order status history">
                {events.map((event) => (
                  <li key={event.id}>
                    <strong>{event.toStatus}</strong>
                    {event.fromStatus ? ` from ${event.fromStatus}` : ''}
                    {event.reason ? ` · ${event.reason}` : ''}
                    <div className="lede">{formatWhen(event.createdAt)}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <Banner tone="empty">No status events yet. Refresh after the kitchen updates.</Banner>
            )}
            <ul>
              {order.items.map((line) => (
                <li key={line.id}>
                  {line.nameSnapshot} × {line.quantity} —{' '}
                  {formatMinor(line.lineTotalMinor, order.currencyCode)}
                  {line.addOns?.schema === 'combo.v1' && line.addOns.components?.length
                    ? ` · ${line.addOns.components.map((row) => row.menuItemName ?? row.menuItemId).join(' + ')}`
                    : ''}
                </li>
              ))}
            </ul>
            <p className="lede">
              Subtotal {formatMinor(order.subtotalMinor, order.currencyCode)}
              {Number(order.discountTotalMinor) > 0
                ? ` · Discount −${formatMinor(order.discountTotalMinor, order.currencyCode)}`
                : ''}
              {` · Tax ${formatMinor(order.taxTotalMinor, order.currencyCode)}`}
              {` · Fees ${formatMinor(order.feeTotalMinor, order.currencyCode)}`}
            </p>
            <p className="price">
              Total {formatMinor(order.grandTotalMinor, order.currencyCode)}
            </p>
            {order.paymentIntents.map((p) => (
              <p className="lede" key={p.id}>
                Payment {p.method} · {p.status} ·{' '}
                {formatMinor(p.amountMinor, p.currencyCode ?? order.currencyCode)}
                {p.razorpayOrderId ? ` · ${p.razorpayOrderId}` : ''}
              </p>
            ))}
            {order.deliveryPerson ? (
              <p className="lede">
                Rider {order.deliveryPerson.name} · {order.deliveryPerson.phone ?? 'no phone'}
              </p>
            ) : null}
            {order.cancelReason ? <p className="lede">{order.cancelReason}</p> : null}
            {checkout?.settlement === 'PREPAID' && checkout.payment?.status === 'CREATED' ? (
              <Banner tone="warning">
                Payment intent created. Capture/verify is the existing payment API, not this page.
              </Banner>
            ) : null}
            <div className="form-actions">
              {canCancel(order.status) ? (
                <Button variant="secondary" disabled={busy} onClick={() => void onCancel()}>
                  Cancel order
                </Button>
              ) : null}
              <Button variant="ghost" disabled={busy} onClick={() => void load()}>
                Refresh status
              </Button>
            </div>
          </Card>
        ) : null}
      </StatusPanel>
    </section>
  );
}
