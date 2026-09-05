import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../design-system/Button';
import { favoritesApi, type FavoriteTargetType } from '../lib/api';
import { FAVORITES_COPY, isFavorited } from '../lib/favorites';
import { isAuthenticated } from '../lib/session';

export function FavoriteButton({
  targetType,
  targetId,
  next,
}: {
  targetType: FavoriteTargetType;
  targetId: string;
  next: string;
}) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(isAuthenticated());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      setSaved(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await favoritesApi.list(targetType);
      setSaved(isFavorited(res.data, targetType, targetId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load favorite');
    } finally {
      setLoading(false);
    }
  }, [targetId, targetType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggle() {
    if (!isAuthenticated()) {
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (busy || loading) return;
    setBusy(true);
    setError(null);
    try {
      if (saved) {
        await favoritesApi.remove(targetType, targetId);
        const res = await favoritesApi.list(targetType);
        setSaved(isFavorited(res.data, targetType, targetId));
      } else {
        await favoritesApi.put({ targetType, targetId });
        const res = await favoritesApi.list(targetType);
        setSaved(isFavorited(res.data, targetType, targetId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update favorite');
    } finally {
      setBusy(false);
    }
  }

  const label = saved
    ? FAVORITES_COPY.saved
    : targetType === 'RESTAURANT'
      ? FAVORITES_COPY.saveRestaurant
      : FAVORITES_COPY.saveItem;

  return (
    <div>
      <Button
        type="button"
        variant={saved ? 'primary' : 'secondary'}
        disabled={busy || loading}
        aria-pressed={saved}
        onClick={() => void onToggle()}
      >
        {busy ? 'Saving…' : label}
      </Button>
      {error ? <p className="lede">{error}</p> : null}
    </div>
  );
}
