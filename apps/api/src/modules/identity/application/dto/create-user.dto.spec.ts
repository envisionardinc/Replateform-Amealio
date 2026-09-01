import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

function errorsFor(obj: Record<string, unknown>): string[] {
  const dto = plainToInstance(CreateUserDto, obj);
  return validateSync(dto).flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('CreateUserDto validation', () => {
  it('accepts a valid minimal payload (phone only)', () => {
    expect(errorsFor({ phoneCountryCode: '+91', phone: '9000000000' })).toHaveLength(0);
  });

  it('accepts an optional valid email and password', () => {
    expect(
      errorsFor({
        phoneCountryCode: '+91',
        phone: '9000000000',
        email: 'user@example.test',
        password: 'Secret123',
      }),
    ).toHaveLength(0);
  });

  it('rejects a missing phone', () => {
    expect(errorsFor({ phoneCountryCode: '+91' }).length).toBeGreaterThan(0);
  });

  it('rejects an invalid email', () => {
    expect(errorsFor({ phoneCountryCode: '+91', phone: '9000000000', email: 'nope' })).toContain(
      'isEmail',
    );
  });

  it('rejects a too-short password', () => {
    expect(
      errorsFor({ phoneCountryCode: '+91', phone: '9000000000', password: 'short' }),
    ).toContain('minLength');
  });
});
