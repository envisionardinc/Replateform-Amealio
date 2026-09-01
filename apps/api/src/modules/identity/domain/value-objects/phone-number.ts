/**
 * Phone identity value object. Consumer identity in the baseline is keyed on
 * (country_code, mobile_number) — see amealio-vendordashboard
 * src/models/user-service.model.ts and the unique (phoneCountryCode, phone)
 * constraint in the P1.5 schema.
 */
export class PhoneNumber {
  private constructor(
    readonly countryCode: string,
    readonly number: string,
  ) {}

  static create(countryCode: string, number: string): PhoneNumber {
    const cc = (countryCode ?? '').trim();
    const num = (number ?? '').trim();
    if (!/^\+?\d{1,4}$/.test(cc)) {
      throw new Error('Invalid country code');
    }
    if (!/^\d{6,15}$/.test(num)) {
      throw new Error('Invalid phone number');
    }
    return new PhoneNumber(cc.startsWith('+') ? cc : `+${cc}`, num);
  }
}
