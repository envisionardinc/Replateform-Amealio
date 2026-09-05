/**
 * Subscription / configuration domain types (P1.7.3).
 *
 * Mirrors the EXISTING P1.5 `Subscription` table (no schema change). `config`
 * is intentionally OPAQUE (`Record<string, unknown>`): the legacy
 * `subscription.model.ts` embeds a ~2300-line, business-type-specific config
 * document, so unknown keys MUST remain representable. Only source-CONFIRMED,
 * flat, unambiguous keys are typed (below); everything else is read via safe
 * path access without asserting a shape.
 *
 * Grounding (amealio-vendordashboard/src/models/subscription.model.ts):
 *   - owner key: `vendor_id` (→ target Merchant via P1.7.2 abstraction)
 *   - top-level business-type entitlement booleans (lines 23-26)
 *   - per-type `<type>_status` blocks embed seating / table_management.table_setup /
 *     walkin_waitlist / reservation / event_management / experience_management / ordering
 *   - `status: Number` (numeric flag; NOT a billing/plan/price lifecycle)
 */

/** Opaque, unknown-preserving configuration object. */
export type SubscriptionConfig = Record<string, unknown>;

export interface SubscriptionRecord {
  id: string;
  merchantId: string;
  restaurantId: string | null;
  productType: string;
  status: string;
  config: SubscriptionConfig | null;
}

/**
 * CONFIRMED top-level business-type entitlement keys (boolean gates).
 * Source: subscription.model.ts lines 23-26.
 */
export const BUSINESS_TYPE_KEYS = [
  'casual_dining',
  'fast_food_dining',
  'hospitality_hotels',
  'multi_service_business',
] as const;
export type BusinessTypeKey = (typeof BUSINESS_TYPE_KEYS)[number];

/**
 * The per-business-type config block key (e.g. `casual_dining_status`) that
 * embeds seating/table_management/event/experience/ordering config.
 */
export const BUSINESS_TYPE_STATUS_KEY: Record<BusinessTypeKey, string> = {
  casual_dining: 'casual_dining_status',
  fast_food_dining: 'fast_food_dining_status',
  hospitality_hotels: 'hospitality_hotels_status',
  multi_service_business: 'multi_service_business_status',
};
