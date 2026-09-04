import { ConflictException } from '@nestjs/common';
import { RegisterUserUseCase } from './register-user.use-case';
import { NewUserData, UserRepository } from '../domain/ports/user.repository';
import { PasswordHasher } from '../domain/ports/password-hasher';
import { User } from '../domain/user.entity';

/** In-memory fake repository (synthetic; no DB, no legacy data). */
class FakeUserRepository extends UserRepository {
  public created: NewUserData[] = [];
  private store = new Map<string, User>();

  async create(data: NewUserData): Promise<User> {
    this.created.push(data);
    const user = new User({
      id: `id-${this.store.size + 1}`,
      phoneCountryCode: data.phoneCountryCode,
      phone: data.phone,
      email: data.email ?? null,
      isVerified: data.isVerified ?? false,
      isBlocked: false,
      createdAt: new Date(),
    });
    this.store.set(`${data.phoneCountryCode}:${data.phone}`, user);
    return user;
  }
  async findById(): Promise<User | null> {
    return null;
  }
  async findByPhone(cc: string, phone: string): Promise<User | null> {
    return this.store.get(`${cc}:${phone}`) ?? null;
  }
  async findAuthByPhone() {
    return null;
  }
  async findAuthByEmail() {
    return null;
  }
}

class FakeHasher extends PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }
  async verify(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

describe('RegisterUserUseCase', () => {
  let repo: FakeUserRepository;
  let hasher: FakeHasher;
  let useCase: RegisterUserUseCase;

  beforeEach(() => {
    repo = new FakeUserRepository();
    hasher = new FakeHasher();
    useCase = new RegisterUserUseCase(repo, hasher);
  });

  it('creates a new consumer user, unverified by default', async () => {
    const user = await useCase.execute({ phoneCountryCode: '91', phone: '9000000001' });
    expect(user.isVerified).toBe(false);
    expect(user.isBlocked).toBe(false);
    expect(repo.created[0].passwordHash).toBeNull();
  });

  it('hashes the password when supplied', async () => {
    await useCase.execute({ phoneCountryCode: '91', phone: '9000000002', password: 'Secret123' });
    expect(repo.created[0].passwordHash).toBe('hashed:Secret123');
  });

  it('normalizes the phone country code', async () => {
    await useCase.execute({ phoneCountryCode: '91', phone: '9000000003' });
    expect(repo.created[0].phoneCountryCode).toBe('+91');
  });

  it('rejects a duplicate phone number with a conflict', async () => {
    await useCase.execute({ phoneCountryCode: '91', phone: '9000000004' });
    await expect(
      useCase.execute({ phoneCountryCode: '91', phone: '9000000004' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an invalid phone number', async () => {
    await expect(useCase.execute({ phoneCountryCode: '91', phone: 'abc' })).rejects.toThrow();
  });
});
