import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { Field } from '../design-system/Field';
import { dinerApi } from '../lib/api';
import { isAuthenticated } from '../lib/session';

export function BookATableScreen() {
  const { restaurantId = '' } = useParams();
  const navigate = useNavigate();
  const [intent, setIntent] = useState<'SEATING' | 'RESERVATION'>('SEATING');
  const [partySize, setPartySize] = useState(2);
  const [kidsCount, setKidsCount] = useState(0);
  const [highChairs, setHighChairs] = useState(0);
  const [specialRequests, setSpecialRequests] = useState('');
  const [reservationAt, setReservationAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isAuthenticated()) {
      navigate(`/login?next=/restaurants/${restaurantId}/book-a-table`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await dinerApi.create({
        restaurantId,
        intent,
        partySize,
        kidsCount: kidsCount || undefined,
        highChairs: highChairs || undefined,
        specialRequests: specialRequests.trim() || undefined,
        reservationAt: intent === 'RESERVATION' && reservationAt ? new Date(reservationAt).toISOString() : undefined,
      });
      navigate(`/diner/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create table request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p>
        <Link to={`/restaurants/${restaurantId}`}>← Restaurant</Link>
      </p>
      <h1>Book a Table</h1>
      <p className="lede">
        Signed-in guests only. Walk-in and waitlist use one Book a Table request. The server
        chooses walk-in versus waitlist. Reservation needs a date and time.
      </p>
      <StatusPanel error={error} />
      <Card as="form" onSubmit={(e) => void onSubmit(e)}>
        <Field label="Request type">
          <select
            name="intent"
            value={intent}
            onChange={(e) => setIntent(e.target.value as 'SEATING' | 'RESERVATION')}
          >
            <option value="SEATING">Book a Table</option>
            <option value="RESERVATION">Reservation</option>
          </select>
        </Field>
        <Field label="Party size">
          <input
            type="number"
            min={1}
            name="partySize"
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
            required
          />
        </Field>
        <Field label="Kids">
          <input
            type="number"
            min={0}
            name="kidsCount"
            value={kidsCount}
            onChange={(e) => setKidsCount(Number(e.target.value))}
          />
        </Field>
        <Field label="High chairs">
          <input
            type="number"
            min={0}
            name="highChairs"
            value={highChairs}
            onChange={(e) => setHighChairs(Number(e.target.value))}
          />
        </Field>
        {intent === 'RESERVATION' ? (
          <Field label="Reservation time">
            <input
              type="datetime-local"
              name="reservationAt"
              value={reservationAt}
              onChange={(e) => setReservationAt(e.target.value)}
              required
            />
          </Field>
        ) : null}
        <Field label="Special requests">
          <textarea
            name="specialRequests"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            rows={3}
          />
        </Field>
        <div className="form-actions">
          <Button type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Submit request'}
          </Button>
        </div>
      </Card>
    </section>
  );
}