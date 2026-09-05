import type { ReactNode } from 'react';

type Tone = 'error' | 'empty' | 'warning' | 'info' | 'success';

export function Banner({
  tone,
  children,
  role,
}: {
  tone: Tone;
  children: ReactNode;
  role?: 'status' | 'alert';
}) {
  return (
    <div className={`banner banner-${tone}`} role={role ?? (tone === 'error' ? 'alert' : 'status')}>
      {children}
    </div>
  );
}
