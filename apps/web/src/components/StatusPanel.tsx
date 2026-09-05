import type { ReactNode } from 'react';

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
      <p className="banner empty" role="status">
        Loading…
      </p>
    );
  }
  if (error) {
    return (
      <div className="banner error" role="alert">
        <p>{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return (
      <p className="banner empty" role="status">
        {empty}
      </p>
    );
  }
  return <>{children}</>;
}
