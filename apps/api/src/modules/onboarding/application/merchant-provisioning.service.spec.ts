import { ForbiddenException } from '@nestjs/common';
import { MerchantProvisioningService } from './merchant-provisioning.service';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';

const merchantStaff = (
  merchantId: string,
  role: StaffPrincipal['staffRole'] = 'MERCHANT_OWNER',
): StaffPrincipal => ({
  staffMemberId: 'staff-1',
  actorType: 'STAFF',
  staffRole: role,
  merchantId,
});

const superAdmin: StaffPrincipal = {
  staffMemberId: 'admin-1',
  actorType: 'STAFF',
  staffRole: 'SUPER_ADMIN',
  merchantId: null,
};

describe('MerchantProvisioningService tenant isolation', () => {
  const scope = {};
  const repo = {
    createMerchant: jest.fn(),
    createRestaurant: jest.fn(),
    createSubscription: jest.fn(),
    merchantExists: jest.fn(),
  };
  const service = new MerchantProvisioningService(scope as any, repo as any);

  beforeEach(() => jest.clearAllMocks());

  it('rejects merchant creation by merchant staff', async () => {
    await expect(
      service.createMerchant(merchantStaff('m1'), { legalName: 'Acme' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.createMerchant).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN to create a merchant', async () => {
    repo.createMerchant.mockResolvedValue({ id: 'm-new' });
    await expect(service.createMerchant(superAdmin, { legalName: 'Acme' })).resolves.toEqual({
      id: 'm-new',
    });
  });

  it('rejects restaurant creation when request merchantId differs from principal', async () => {
    await expect(
      service.createRestaurant(merchantStaff('m1'), {
        merchantId: 'm2',
        name: 'Other Merchant Restaurant',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.createRestaurant).not.toHaveBeenCalled();
  });

  it('forces server-derived merchantId when creating a restaurant', async () => {
    repo.merchantExists.mockResolvedValue(true);
    repo.createRestaurant.mockResolvedValue({ id: 'r1' });
    await service.createRestaurant(merchantStaff('m1'), {
      merchantId: 'm1',
      name: 'Main',
    });
    expect(repo.createRestaurant).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: 'm1', name: 'Main' }),
    );
  });

  it('rejects subscription creation for another merchant', async () => {
    await expect(
      service.createSubscription(merchantStaff('m1'), {
        merchantId: 'm2',
        productType: 'ORDERING',
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.createSubscription).not.toHaveBeenCalled();
  });
});
