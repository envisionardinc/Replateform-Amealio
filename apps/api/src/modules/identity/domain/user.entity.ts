/**
 * Consumer identity domain entity (target model).
 * Mirrors the P1.5 `User` (no `role` column — all consumers are CUSTOMER;
 * staff/admin identities are modeled separately under Merchant, out of scope here).
 * Baseline evidence: amealio-vendordashboard src/models/user-service.model.ts
 * (role always 'user' for consumers; user_verified default false; user_blocked).
 */
export interface UserSnapshot {
  id: string;
  phoneCountryCode: string;
  phone: string;
  email: string | null;
  isVerified: boolean;
  isBlocked: boolean;
  createdAt: Date;
}

export class User {
  constructor(private readonly props: UserSnapshot) {}

  get id(): string {
    return this.props.id;
  }
  get isBlocked(): boolean {
    return this.props.isBlocked;
  }
  get isVerified(): boolean {
    return this.props.isVerified;
  }

  /** Public snapshot; never exposes credential material (there is none here). */
  toSnapshot(): UserSnapshot {
    return { ...this.props };
  }
}
