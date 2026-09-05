import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Badge } from '../../../web/src/design-system/Badge';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import {
  ApiError,
  deliveryApi,
  merchantOrdersApi,
  type DeliveryPerson,
  type MerchantOrder,
} from '../lib/api';
import { formatMinor, isCapturedPayment } from '../lib/money';
import { isAuthenticated } from '../lib/session';
import { merchantActions } from '../lib/transitions';

function tone(status: string): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger';
  if (status === 'DELIVERED' || status === 'COMPLETED') return 'success';
  if (status === 'PENDING' || status === 'READY') return 'info';
  if (status === 'ON_THE_WAY') return 'warning';
  return 'neutral';
}

export function OrderScreen() {
  const { id = '' } = useParams();
  const [order, setOrder] = useState<MerchantOrder | null>(null);
  const [riders, setRiders] = useState<DeliveryPerson[]>([]);
  const [riderId, setRiderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('sold out');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, people] = await Promise.all([merchantOrdersApi.get(id), deliveryApi.people()]);
      setOrder(next);
      setRiders(people.data);
      setRiderId((current) => current || people.data[0]?.id || '');
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

  async function applyServer(next: Promise<MerchantOrder>) {
    setBusy(true);
    setError(null);
    try {
      setOrder(await next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Order changed on the server. Reloaded the latest status.');
        await load();
      } else {
        setError(err instanceof Error ? err.message : 'Update failed');
        try {
          setOrder(await merchantOrdersApi.get(id));
        } catch {
          /* keep previous */
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(toStatus: string, reasonCode?: string) {
    if (!order) return;
    await applyServer(
      merchantOrdersApi.transition(order.id, {
        toStatus,
        expectedStatus: order.status,
        reasonCode,
        reason: reasonCode === 'MERCHANT_REJECT' ? rejectReason : undefined,
      }),
    );
  }

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (!order || !riderId) return;
    await applyServer(
      merchantOrdersApi.assign(order.id, {
        deliveryPersonId: riderId,
        expectedStatus: order.status,
      }),
    );
  }

  async function onRiderHop(toStatus: string) {
    if (!order?.deliveryPersonId) return;
    setBusy(true);
    setError(null);
    try {
      const session = await deliveryApi.session(order.deliveryPersonId);
      setOrder(
        await deliveryApi.riderStatus(order.id, session.accessToken, {
          toStatus,
          expectedStatus: order.status,
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Order changed on the server. Reloaded the latest status.');
        await load();
      } else {
        setError(err instanceof Error ? err.message : 'Rider update failed');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated()) return <Navigate to="/login" replace />;

  const paid = order?.paymentIntents.some((p) => isCapturedPayment(p.status)) ?? false;
  const actions = order ? merchantActions(order) : [];

  return (
    <section>
      <p>
        <Link to="/">← Orders</Link>
      </p>
      <h1>Order</h1>
      {loading ? (
        <div role="status">
          <p className="lede">Loading…</p>
          <Skeleton />
        </div>
      ) : null}
      {error ? (
        <Banner tone={error.includes('Reloaded') ? 'warning' : 'error'}>
          <p>{error}</p>
          <Button onClick={() => void load()}>Retry</Button>
        </Banner>
      ) : null}
      {order ? (
        <Card>
          <p>
            <Badge tone={tone(order.status)}>{order.status}</Badge> · {order.type} ·{' '}
            {paid ? 'Paid' : 'Unpaid / COD'}
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
              Payment {p.method} · {p.status} · {formatMinor(p.amountMinor, p.currencyCode)}
            </p>
          ))}
          {order.deliveryPerson ? (
            <p className="lede">
              Rider {order.deliveryPerson.name} · {order.deliveryPerson.phone ?? 'no phone'}
            </p>
          ) : null}
          {order.cancelReason ? <p className="lede">{order.cancelReason}</p> : null}
          {actions.some((a) => a.reasonCode === 'MERCHANT_REJECT') ? (
            <Field label="Reject reason">
              <input
                name="reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </Field>
          ) : null}
          {actions.some((a) => a.kind === 'assign') ? (
            <form className="form-actions" onSubmit={(e) => void onAssign(e)}>
              <Field label="Delivery person">
                <select
                  name="deliveryPersonId"
                  value={riderId}
                  onChange={(e) => setRiderId(e.target.value)}
                >
                  {riders.map((r) => (
                    <option key={r.id} value={r.id} disabled={!r.isOnline || r.occupied}>
                      {r.name}
                      {!r.isOnline ? ' (offline)' : r.occupied ? ' (occupied)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" disabled={busy || !riderId}>
                Assign rider
              </Button>
            </form>
          ) : null}
          <div className="form-actions">
            {actions
              .filter((a) => a.kind !== 'assign')
              .map((action) => (
                <Button
                  key={action.id}
                  variant={action.reasonCode ? 'secondary' : 'primary'}
                  disabled={busy}
                  onClick={() =>
                    action.kind === 'rider' && action.toStatus
                      ? void onRiderHop(action.toStatus)
                      : action.toStatus
                        ? void onStatus(action.toStatus, action.reasonCode)
                        : undefined
                  }
                >
                  {action.label}
                </Button>
              ))}
            <Button
              variant="ghost"
              disabled={busy || !order}
              onClick={() => (order ? void onStatus(order.status) : undefined)}
            >
              Repeat current status
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
