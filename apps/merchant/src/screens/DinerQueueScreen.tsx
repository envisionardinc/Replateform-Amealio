import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Badge } from '../../../web/src/design-system/Badge';
import { Banner } from '../../../web/src/design-system/Banner';
import { Button } from '../../../web/src/design-system/Button';
import { Card } from '../../../web/src/design-system/Card';
import { Field } from '../../../web/src/design-system/Field';
import { Skeleton } from '../../../web/src/design-system/Skeleton';
import {
  ApiError,
  merchantCatalogApi,
  merchantDinerApi,
  type MerchantDiner,
  type MerchantRestaurant,
  type MerchantTable,
} from '../lib/api';
import { isAuthenticated, isSuperAdmin } from '../lib/session';

function tone(status: string): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'CANCELLED' || status === 'REJECTED') return 'danger';
  if (status === 'COMPLETED' || status === 'SEATED') return 'success';
  if (status === 'PENDING') return 'info';
  if (status === 'NOT_SEATED') return 'warning';
  return 'neutral';
}

export function DinerQueueScreen() {
  const [restaurants, setRestaurants] = useState<MerchantRestaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState<MerchantDiner[]>([]);
  const [tables, setTables] = useState<MerchantTable[]>([]);
  const [seatFor, setSeatFor] = useState<string | null>(null);
  const [tableId, setTableId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    merchantCatalogApi
      .restaurants()
      .then((list) => {
        setRestaurants(list);
        setRestaurantId((current) => current || list[0]?.id || '');
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load restaurants');
      });
  }, []);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [diners, floor] = await Promise.all([
        merchantDinerApi.list({ restaurantId, status: status || undefined }),
        merchantDinerApi.tables(restaurantId),
      ]);
      setRows(diners.data);
      setTables(floor.data);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Could not load diner requests');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (isSuperAdmin()) return <Navigate to="/global-catalog" replace />;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setSeatFor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  const availableTables = tables.filter((t) => t.isActive && t.status === 'AVAILABLE');

  return (
    <section>
      <h1>Diner requests</h1>
      <p className="lede">
        Merchant-scoped Book a Table and reservation queue. Accept, seat on an available table, then
        complete. Invalid transitions are not offered.
      </p>
      <Field label="Restaurant">
        <select
          name="restaurantId"
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
        >
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING">PENDING</option>
          <option value="NOT_SEATED">NOT_SEATED</option>
          <option value="SEATED">SEATED</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="CANCELLED">CANCELLED</option>
          <option value="">All</option>
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
      {!loading && !error && rows.length === 0 ? (
        <Banner tone="empty">No diner requests in this filter.</Banner>
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <div className="row">
            <div>
              <h2>
                {row.type === 'RESERVATION' ? 'Reservation' : 'Book a Table'} · {row.partySize} guests
              </h2>
              <p className="lede">
                {row.tableCode ? `Table ${row.tableCode} · ` : ''}
                {row.specialRequests || row.id.slice(0, 8)}
              </p>
            </div>
            <Badge tone={tone(row.status)}>{row.status}</Badge>
          </div>
          <div className="row-actions">
            {row.status === 'PENDING' ? (
              <Button disabled={busy} onClick={() => void run(() => merchantDinerApi.accept(row.id))}>
                Accept
              </Button>
            ) : null}
            {row.status === 'NOT_SEATED' ? (
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => {
                  setSeatFor(row.id);
                  setTableId(availableTables[0]?.id ?? '');
                }}
              >
                Seat
              </Button>
            ) : null}
            {row.status === 'SEATED' ? (
              <Button disabled={busy} onClick={() => void run(() => merchantDinerApi.complete(row.id))}>
                Complete
              </Button>
            ) : null}
          </div>
          {seatFor === row.id ? (
            <div className="form-actions">
              <Field label="Available table">
                <select name="tableId" value={tableId} onChange={(e) => setTableId(e.target.value)}>
                  {availableTables.length === 0 ? (
                    <option value="">No available tables</option>
                  ) : null}
                  {availableTables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.capacity} pax
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                disabled={busy || !tableId}
                onClick={() => void run(() => merchantDinerApi.seat(row.id, tableId))}
              >
                Confirm seat
              </Button>
            </div>
          ) : null}
        </Card>
      ))}
    </section>
  );
}