import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExperienceService } from './experience.service';
import type { StaffPrincipal } from '../../identity/staff-authentication/staff-principal';

const UUID = {
  restaurant: '11111111-1111-4111-8111-111111111111',
  otherRestaurant: '22222222-2222-4222-8222-222222222222',
  experience: '33333333-3333-4333-8333-333333333333',
  merchant: '44444444-4444-4444-8444-444444444444',
  otherMerchant: '55555555-5555-4555-8555-555555555555',
};

const merchantStaff = (merchantId: string): StaffPrincipal => ({
  staffMemberId: 'staff-1',
  actorType: 'STAFF',
  staffRole: 'MERCHANT_STAFF',
  merchantId,
});

describe('ExperienceService media fields', () => {
  const repo = {
    create: jest.fn(),
    findById: jest.fn(),
    experienceScope: jest.fn(),
    categoryExists: jest.fn(),
    menuIsCustomInRestaurant: jest.fn(),
    update: jest.fn(),
    listByRestaurant: jest.fn(),
    findByLegacyId: jest.fn(),
    setPublication: jest.fn(),
    softDelete: jest.fn(),
    replaceMenus: jest.fn(),
  };
  const scope = {
    assertRestaurantInScope: jest.fn(),
  };
  const restaurants = {
    findById: jest.fn(),
  };
  const service = new ExperienceService(scope as any, restaurants as any, repo as any);

  beforeEach(() => {
    jest.clearAllMocks();
    restaurants.findById.mockResolvedValue({
      id: UUID.restaurant,
      merchantId: UUID.merchant,
      deletedAt: null,
    });
    scope.assertRestaurantInScope.mockResolvedValue(undefined);
    repo.categoryExists.mockResolvedValue(true);
  });

  it('creates an experience with media URL arrays', async () => {
    repo.create.mockResolvedValue({
      id: UUID.experience,
      photos: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
      videos: ['https://cdn.example/v.mp4'],
      promotionalVideos: [],
      photoThumbnails: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
      userBenefits: 'Live music',
      termsAndConditions: 'T&C',
      tags: ['festive'],
    });

    await service.createExperience(merchantStaff(UUID.merchant), {
      restaurantId: UUID.restaurant,
      name: 'Diwali Night',
      photos: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
      photoThumbnails: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
      videos: ['https://cdn.example/v.mp4'],
      userBenefits: 'Live music',
      termsAndConditions: 'T&C',
      tags: ['festive'],
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: UUID.merchant,
        input: expect.objectContaining({
          photos: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
          videos: ['https://cdn.example/v.mp4'],
          tags: ['festive'],
        }),
      }),
    );
  });

  it('updates media fields for an in-scope experience', async () => {
    repo.experienceScope.mockResolvedValue({
      restaurantId: UUID.restaurant,
      deletedAt: null,
    });
    repo.update.mockResolvedValue({
      id: UUID.experience,
      photos: ['https://cdn.example/new.jpg'],
    });

    await service.updateExperience(merchantStaff(UUID.merchant), UUID.experience, {
      photos: ['https://cdn.example/new.jpg'],
      videos: [],
    });

    expect(repo.update).toHaveBeenCalledWith(
      UUID.experience,
      expect.objectContaining({
        photos: ['https://cdn.example/new.jpg'],
        videos: [],
      }),
    );
  });

  it('rejects malformed media arrays', async () => {
    await expect(
      service.createExperience(merchantStaff(UUID.merchant), {
        restaurantId: UUID.restaurant,
        name: 'X',
        photos: ['ok', ''] as string[],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects cross-merchant updates', async () => {
    repo.experienceScope.mockResolvedValue({
      restaurantId: UUID.otherRestaurant,
      deletedAt: null,
    });
    scope.assertRestaurantInScope.mockRejectedValue(new ForbiddenException('out of scope'));

    await expect(
      service.updateExperience(merchantStaff(UUID.merchant), UUID.experience, {
        photos: ['https://cdn.example/x.jpg'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects updates for missing experiences', async () => {
    repo.experienceScope.mockResolvedValue(null);
    await expect(
      service.updateExperience(merchantStaff(UUID.merchant), UUID.experience, {
        photos: ['https://cdn.example/x.jpg'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not accept or invent platform folder linkage on create', async () => {
    repo.create.mockResolvedValue({ id: UUID.experience, photos: [] });
    await service.createExperience(merchantStaff(UUID.merchant), {
      restaurantId: UUID.restaurant,
      name: 'Local',
      photos: ['https://cdn.example/a.jpg'],
    });
    const input = repo.create.mock.calls[0][0].input;
    expect(input).not.toHaveProperty('sourceFolderId');
    expect(input).not.toHaveProperty('platformFolderId');
  });
});
