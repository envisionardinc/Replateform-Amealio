import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated, isMerchantStaff, isSuperAdmin } from '../lib/session';

export function RequireAuth({ children }: { children: ReactElement }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return children;
}

export function RequireSuperAdmin({ children }: { children: ReactElement }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (!isSuperAdmin()) return <Navigate to="/" replace />;
  return children;
}

export function RequireMerchant({ children }: { children: ReactElement }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (!isMerchantStaff()) return <Navigate to="/global-catalog" replace />;
  return children;
}
