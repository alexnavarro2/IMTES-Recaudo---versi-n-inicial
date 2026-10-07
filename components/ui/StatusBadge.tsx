import type { ReactNode } from 'react';

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'pending' | 'selected' }) {
  return <span className={`status-badge status-${tone}`}><span aria-hidden="true" />{children}</span>;
}
