import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { dinerApi, discoverApi, type DinerRequest } from '../lib/api';
import { isAuthenticated } from '../lib/session';

function tone(status: string): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'CANCELLED' || status === 'REJECTED') return 'danger';
  if (status === 'COMPLETED' || status === 'SEATED') return 'success';
  if (status === 'PENDING') return 'info';
  if (status === 'NOT_SEATED') return 'warning';
  return 'neutral';
}

export function DinerStatusScreen() {
  const { id = '' } = useParams();
  const [diner, setDiner] = useState<DinerRequest | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      setError('Sign in to view this table request.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await dinerApi.get(id);
      setDiner(next);
      try {
        const place = await discoverApi.restaurant(next.restaurantId);
        setRestaurantName(place.name);
      } catch {
        setRestaurantName(null);
      }
    } catch (err) {
      setDiner(null);
      setError(err instanceof Error ? err.message : 'Table request unavailable');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel() {
    if (!diner) return;
    setBusy(true);
    setError(null);
    try {
      setDiner(await dinerApi.cancel(diner.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p>
        <Link to="/diner">← Your table requests</Link>
      </p>
      <h1>Table request</h1>
      <StatusPanel loading={loading} error={error} onRetry={() => void load()}>
        {diner ? (
          <Card>
            <div className="row">
              <div>
                <h2>{restaurantName ?? 'Restaurant'}</h2>
                <p className="lede">
                  {diner.type === 'RESERVATION' ? 'Reservation' : 'Book a Table'} · {diner.partySize}{' '}
                  guests
                  {diner.tableCode ? ` · Table ${diner.tableCode}` : ''}
                </p>
                {diner.reservationAt ? (
                  <p className="lede">{new Date(diner.reservationAt).toLocaleString('en-IN')}</p>
                ) : null}
                {diner.specialRequests ? <p className="lede">{diner.specialRequests}</p> : null}
              </div>
              <Badge tone={tone(diner.status)}>{diner.status}</Badge>
            </div>
            {diner.canCancel ? (
              <div className="form-actions">
                <Button variant="secondary" disabled={busy} onClick={() => void cancel()}>
                  {busy ? 'Cancelling…' : 'Cancel request'}
                </Button>
              </div>
            ) : null}
          </Card>
        ) : null}
      </StatusPanel>
    </section>
  );
}