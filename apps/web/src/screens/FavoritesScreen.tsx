import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { favoritesApi, type Favorite, type FavoriteTargetType } from '../lib/api';
import { FAVORITES_COPY, favoriteHref, favoriteTitle, favoritesByType } from '../lib/favorites';
import { isAuthenticated } from '../lib/session';

export function FavoritesScreen() {
  const [lane, setLane] = useState<FavoriteTargetType>('RESTAURANT');
  const [rows, setRows] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      setRows([]);
      setError(FAVORITES_COPY.signIn);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const res = await favoritesApi.list();
      setRows(res.data);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Could not load favorites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = favoritesByType(rows, lane);

  async function onRemove(row: Favorite) {
    if (busyId) return;
    setBusyId(row.id);
    setActionError(null);
    try {
      await favoritesApi.remove(row.targetType, row.targetId);
      const res = await favoritesApi.list();
      setRows(res.data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove favorite');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <p>
        <Link to="/profile">← Profile</Link>
      </p>
      <h1>{FAVORITES_COPY.title}</h1>
      <p className="lede">{FAVORITES_COPY.lede}</p>
      {!isAuthenticated() ? (
        <Banner tone="error">
          <p>{FAVORITES_COPY.signIn}</p>
          <p>
            <Link to="/login?next=/favorites">Sign in</Link>
          </p>
        </Banner>
      ) : (
        <>
          <div className="row-actions">
            <Button
              variant={lane === 'RESTAURANT' ? 'primary' : 'secondary'}
              onClick={() => setLane('RESTAURANT')}
            >
              Restaurants
            </Button>
            <Button
              variant={lane === 'MENU_ITEM' ? 'primary' : 'secondary'}
              onClick={() => setLane('MENU_ITEM')}
            >
              Dishes
            </Button>
          </div>
          <StatusPanel
            loading={loading}
            error={error}
            empty={
              !loading && !error && visible.length === 0
                ? lane === 'RESTAURANT'
                  ? FAVORITES_COPY.emptyRestaurants
                  : FAVORITES_COPY.emptyItems
                : null
            }
            onRetry={() => void load()}
          >
            {actionError ? <Banner tone="error">{actionError}</Banner> : null}
            {visible.map((row) => {
              const href = favoriteHref(row);
              return (
                <Card key={row.id}>
                  <div className="row">
                    <div>
                      <h2>
                        {href ? <Link to={href}>{favoriteTitle(row)}</Link> : favoriteTitle(row)}
                      </h2>
                      <p className="lede">
                        {row.targetType === 'RESTAURANT'
                          ? (row.restaurant?.city ?? row.restaurant?.status ?? 'Restaurant')
                          : (row.item?.availability ?? 'Dish')}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={busyId === row.id}
                      onClick={() => void onRemove(row)}
                    >
                      {busyId === row.id ? 'Removing…' : 'Remove'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </StatusPanel>
        </>
      )}
    </section>
  );
}
