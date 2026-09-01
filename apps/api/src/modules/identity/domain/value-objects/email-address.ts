/** Optional email identity value object (baseline `User.email`, unique/nullable). */
export class EmailAddress {
  private constructor(readonly value: string) {}

  static create(email: string): EmailAddress {
    const v = (email ?? '').trim().toLowerCase();
    // Intentionally simple, non-inventive validation (structural only).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      throw new Error('Invalid email address');
    }
    return new EmailAddress(v);
  }
}
