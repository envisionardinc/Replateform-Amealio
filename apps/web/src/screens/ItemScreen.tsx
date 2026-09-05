import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cartApi, discoverApi, type MenuItem } from '../lib/api';
import { formatMinor } from '../lib/money';
import { isAuthenticated } from '../lib/session';
import { StatusPanel } from '../components/StatusPanel';

export function ItemScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<MenuItem | null>(null);
  const [variantId, setVariantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await discoverApi.item(id);
      setItem(data);
      setVariantId(data.variants[0]?.id ?? '');
    } catch (err) {
      setItem(null);
      setError(err instanceof Error ? err.message : 'Item not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const variant = item?.variants.find((v) => v.id === variantId) ?? item?.variants[0];
  const sellable = item?.availability === 'AVAILABLE' && variant?.available === true;

  async function addToCart() {
    if (!item || !variant) return;
    if (!isAuthenticated()) {
      navigate(`/login?next=/items/${item.id}`);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await cartApi.add({
        variantId: variant.id,
        quantity: 1,
        restaurantId: item.restaurantId,
        type: 'HOME_DELIVERY',
      });
      navigate('/cart');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add to cart');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p>
        {item ? (
          <Link to={`/restaurants/${item.restaurantId}`}>← Menu</Link>
        ) : (
          <Link to="/">← Home</Link>
        )}
      </p>
      <StatusPanel loading={loading} error={error} onRetry={() => void load()}>
        {item ? (
          <article className="card">
            <h1>{item.name}</h1>
            <p className="muted">{item.description || 'No description'}</p>
            <label>
              Size
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                {item.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.size ?? 'Regular'} — {formatMinor(v.priceMinor, v.currencyCode)}
                    {v.available ? '' : ' (unavailable)'}
                  </option>
                ))}
              </select>
            </label>
            {!sellable ? (
              <p className="banner warn">
                This item is not available. The server will reject add-to-cart.
              </p>
            ) : null}
            <StatusPanel error={actionError} />
            <button type="button" disabled={!sellable || busy} onClick={() => void addToCart()}>
              {busy ? 'Adding…' : 'Add to cart'}
            </button>
            <p className="muted">
              Price shown is the published catalog price. Cart totals are server-priced.
            </p>
          </article>
        ) : null}
      </StatusPanel>
    </section>
  );
}
