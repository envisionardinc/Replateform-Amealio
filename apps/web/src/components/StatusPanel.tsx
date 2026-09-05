import type { ReactNode } from 'react';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Skeleton } from '../design-system/Skeleton';

type Props = {
  loading?: boolean;
  error?: string | null;
  empty?: string | null;
  onRetry?: () => void;
  children?: ReactNode;
};

export function StatusPanel({ loading, error, empty, onRetry, children }: Props) {
  if (loading) {
    return (
      <div role="status">
        <p className="lede">Loading…</p>
        <Skeleton />
      </div>
    );
  }
  if (error) {
    return (
      <Banner tone="error">
        <p>{error}</p>
        {onRetry ? (
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </Banner>
    );
  }
  if (empty) {
    return <Banner tone="empty">{empty}</Banner>;
  }
  return <>{children}</>;
}
