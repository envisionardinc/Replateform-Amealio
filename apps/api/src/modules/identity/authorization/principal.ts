/**
 * Authenticated principal shape the authorization layer consumes.
 * A FUTURE authentication layer (token verification — deferred in P1.7.1) will
 * populate `request.principal`. Nothing populates it yet; the guard therefore
 * denies protected routes until authentication is implemented.
 *
 * Role naming (target) maps from the baseline: 'user' -> CUSTOMER,
 * 'vendor' -> MERCHANT_OWNER/MERCHANT_STAFF, 'superadmin' -> SUPER_ADMIN.
 */
export interface Principal {
  userId: string;
  roles: string[];
  merchantId?: string;
}

export interface RequestWithPrincipal {
  principal?: Principal;
}
