import { PhoneNumber } from './phone-number';
import { EmailAddress } from './email-address';

describe('PhoneNumber', () => {
  it('accepts a valid country code + number and normalizes +', () => {
    const p = PhoneNumber.create('91', '9000000000');
    expect(p.countryCode).toBe('+91');
    expect(p.number).toBe('9000000000');
  });

  it('keeps an existing + prefix', () => {
    expect(PhoneNumber.create('+91', '9000000000').countryCode).toBe('+91');
  });

  it.each([
    ['bad cc', 'abc', '9000000000'],
    ['short number', '91', '123'],
    ['non-numeric number', '91', '90000abcd0'],
  ])('rejects %s', (_label, cc, num) => {
    expect(() => PhoneNumber.create(cc, num)).toThrow();
  });
});

describe('EmailAddress', () => {
  it('lowercases and accepts a valid email', () => {
    expect(EmailAddress.create('User@Example.Test').value).toBe('user@example.test');
  });

  it.each(['notanemail', 'a@b', '@b.com', 'a@b.'])('rejects invalid %s', (bad) => {
    expect(() => EmailAddress.create(bad)).toThrow();
  });
});
