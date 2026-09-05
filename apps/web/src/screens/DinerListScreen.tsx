import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Card } from '../design-system/Card';
import { dinerApi, type DinerRequest } from '../lib/api';
import { isAuthenticated } from '../lib/session';

function tone(status: string): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'CANCELLED' || status === 'REJECTED') return 'danger';
  if (status === 'COMPLETED' || status === 'SEATED') return 'success';
  if (status === 'PENDING') return 'info';
  if (status === 'NOT_SEATED') return 'warning';
  return 'neutral';
}

export function DinerListScreen() {
  const [rows, setRows] = useState<DinerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      setError('Sign in to view table requests.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await dinerApi.list();
      setRows(res.data);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Could not load table requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <h1>Your table requests</h1>
      <p className="lede">Book a Table and reservation requests for the signed-in account only.</p>
      <StatusPanel
        loading={loading}
        error={error}
        empty={!loading && !error && rows.length === 0 ? 'No table requests yet.' : null}
        onRetry={() => void load()}
      >
        {rows.map((row) => (
          <Card key={row.id}>
            <div className="row">
              <div>
                <h2>
                  <Link to={`/diner/${row.id}`}>
                    {row.type === 'RESERVATION' ? 'Reservation' : 'Book a Table'}
                  </Link>
                </h2>
                <p className="lede">
                  {row.partySize} guests
                  {row.tableCode ? ` · Table ${row.tableCode}` : ''}
                </p>
              </div>
              <Badge tone={tone(row.status)}>{row.status}</Badge>
            </div>
          </Card>
        ))}
      </StatusPanel>
    </section>
  );
}