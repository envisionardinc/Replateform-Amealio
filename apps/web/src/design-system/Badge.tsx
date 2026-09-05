import type { ReactNode } from 'react';

type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
