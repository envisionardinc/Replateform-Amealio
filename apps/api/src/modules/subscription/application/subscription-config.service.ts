import { Injectable } from '@nestjs/common';
import {
  BUSINESS_TYPE_KEYS,
  BUSINESS_TYPE_STATUS_KEY,
  BusinessTypeKey,
  SubscriptionConfig,
} from '../domain/subscription.types';

/**
 * Safe, unknown-preserving accessor around `Subscription.config` (P1.7.3).
 *
 * Goal: stop every future domain from hand-parsing arbitrary JSON, WITHOUT
 * inventing a complete configuration schema. All reads are null/shape-safe and
 * never throw; unknown keys are always still reachable via `getPath`. Only
 * source-CONFIRMED, flat entitlement booleans are interpreted; deeper nested
 * config (seating, table_setup, events, experiences) is exposed as raw locators
 * whose internal shape is intentionally NOT asserted here.
 */
@Injectable()
export class SubscriptionConfigService {
  private isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  /** Safe deep read; returns undefined for any missing/non-object segment. */
  getPath(config: SubscriptionConfig | null | undefined, path: string[]): unknown {
    let cur: unknown = config ?? undefined;
    for (const key of path) {
      if (!this.isObject(cur)) return undefined;
      cur = cur[key];
    }
    return cur;
  }

  /** CONFIRMED: top-level business-type entitlement booleans that are `true`. */
  getEnabledBusinessTypes(config: SubscriptionConfig | null | undefined): BusinessTypeKey[] {
    if (!this.isObject(config)) return [];
    return BUSINESS_TYPE_KEYS.filter((k) => config[k] === true);
  }

  isBusinessTypeEnabled(
    config: SubscriptionConfig | null | undefined,
    key: BusinessTypeKey,
  ): boolean {
    return this.isObject(config) && config[key] === true;
  }

  /**
   * Locate the `<type>_status.seating.value` capability gate (boolean) for a
   * business type. Returns undefined when absent/mis-shaped (never throws).
   */
  isSeatingEnabled(
    config: SubscriptionConfig | null | undefined,
    businessType: BusinessTypeKey = 'casual_dining',
  ): boolean {
    return (
      this.getPath(config, [BUSINESS_TYPE_STATUS_KEY[businessType], 'seating', 'value']) === true
    );
  }

  /**
   * Return the raw, UNTYPED `table_setup` object (floors/seat/table) for a
   * business type, preserving its structure. Deliberately not modeled here
   * (P1.7.3 preserves, it does not normalize — see doc 30). Undefined if absent.
   */
  getTableSetup(
    config: SubscriptionConfig | null | undefined,
    businessType: BusinessTypeKey = 'casual_dining',
  ): unknown {
    return this.getPath(config, [
      BUSINESS_TYPE_STATUS_KEY[businessType],
      'seating',
      'table_management',
      'table_setup',
    ]);
  }
}
