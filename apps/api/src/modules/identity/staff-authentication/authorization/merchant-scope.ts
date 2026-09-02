import type { Request } from 'express';
import type { StaffPrincipal } from '../staff-principal';

/**
 * Merchant tenant-scoping primitives (P1.7.1F).
 *
 * The ONLY trusted source of a staff member's merchant scope is the
 * server-derived `StaffPrincipal.merchantId`. A merchant id supplied by the
 * request (route param, query, or body) is NEVER an authorization source — it
 * is inspected solely to REJECT cross-merchant access.
 */

export function isSuperAdmin(principal: StaffPrincipal): boolean {
  return principal.staffRole === 'SUPER_ADMIN' && principal.merchantId === null;
}

/**
 * The trusted merchant scope for the principal: their own merchantId, or `null`
 * for a platform-scoped SUPER_ADMIN. Controllers/services MUST scope queries by
 * this value, never by a request-supplied merchant id.
 */
export function getEffectiveMerchantId(principal: StaffPrincipal): string | null {
  return principal.merchantId;
}

/** Extract a request-supplied merchant id (param → body → query) if present. */
export function extractRequestedMerchantId(req: Request, key: string): string | undefined {
  const fromParams = (req.params as Record<string, unknown> | undefined)?.[key];
  if (typeof fromParams === 'string' && fromParams.length > 0) return fromParams;
  const fromBody = (req.body as Record<string, unknown> | undefined)?.[key];
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;
  const fromQuery = (req.query as Record<string, unknown> | undefined)?.[key];
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
  return undefined;
}
