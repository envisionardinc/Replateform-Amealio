import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PlatformExperienceCatalogueService } from './platform-experience-catalogue.service';
import type { StaffPrincipal } from '../identity/staff-authentication/staff-principal';

const UUID = {
  folder: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  media: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  category: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  subcategory: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  other: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
};

const merchantStaff = (
  merchantId: string,
  role: StaffPrincipal['staffRole'] = 'MERCHANT_STAFF',
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

const folderFixture = {
  id: UUID.folder,
  legacyId: null,
  name: 'Diwali Night',
  categoryId: UUID.category,
  subcategoryId: UUID.subcategory,
  tags: ['festive'],
  description: 'A festive dinner',
  userBenefits: 'Live music',
  termsAndConditions: 'No outside food',
  status: 'active' as const,
  isAiGenerated: false,
  photoCount: 0,
  videoCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('PlatformExperienceCatalogueService', () => {
  const repo = {
    categoryExists: jest.fn(),
    findDuplicateName: jest.fn(),
    createFolder: jest.fn(),
    updateFolder: jest.fn(),
    findFolder: jest.fn(),
    listFolders: jest.fn(),
    listMedia: jest.fn(),
    appendMedia: jest.fn(),
    archiveMedia: jest.fn(),
  };
  const service = new PlatformExperienceCatalogueService(repo as any);

  beforeEach(() => {
    jest.clearAllMocks();
    repo.categoryExists.mockResolvedValue(true);
    repo.findDuplicateName.mockResolvedValue(false);
  });

  describe('administration', () => {
    it('rejects folder create when the principal is not SUPER_ADMIN', async () => {
      await expect(
        service.createFolder(merchantStaff('m1', 'MERCHANT_OWNER'), {
          name: 'Folder',
          categoryId: UUID.category,
          subcategoryId: UUID.subcategory,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.createFolder).not.toHaveBeenCalled();
    });

    it('allows SUPER_ADMIN to create a folder', async () => {
      repo.createFolder.mockResolvedValue(folderFixture);
      await expect(
        service.createFolder(superAdmin, {
          name: 'Diwali Night',
          categoryId: UUID.category,
          subcategoryId: UUID.subcategory,
          tags: ['festive'],
        }),
      ).resolves.toEqual(folderFixture);
      expect(repo.createFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Diwali Night',
          createdBy: superAdmin.staffMemberId,
        }),
      );
    });

    it('rejects empty folder name', async () => {
      await expect(
        service.createFolder(superAdmin, {
          name: '  ',
          categoryId: UUID.category,
          subcategoryId: UUID.subcategory,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid category UUID', async () => {
      await expect(
        service.createFolder(superAdmin, {
          name: 'Folder',
          categoryId: 'not-a-uuid',
          subcategoryId: UUID.subcategory,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects missing category', async () => {
      repo.categoryExists.mockResolvedValueOnce(false);
      await expect(
        service.createFolder(superAdmin, {
          name: 'Folder',
          categoryId: UUID.category,
          subcategoryId: UUID.subcategory,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate folder name under same taxonomy', async () => {
      repo.findDuplicateName.mockResolvedValue(true);
      await expect(
        service.createFolder(superAdmin, {
          name: 'Diwali Night',
          categoryId: UUID.category,
          subcategoryId: UUID.subcategory,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates folder metadata for SUPER_ADMIN', async () => {
      repo.findFolder.mockResolvedValue(folderFixture);
      repo.updateFolder.mockResolvedValue({ ...folderFixture, name: 'Updated' });
      await expect(
        service.updateFolder(superAdmin, UUID.folder, { name: 'Updated' }),
      ).resolves.toEqual(expect.objectContaining({ name: 'Updated' }));
    });

    it('rejects folder update when missing', async () => {
      repo.findFolder.mockResolvedValue(null);
      await expect(
        service.updateFolder(superAdmin, UUID.folder, { name: 'Updated' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects merchant updates to platform folders', async () => {
      await expect(
        service.updateFolder(merchantStaff('m1', 'MERCHANT_OWNER'), UUID.folder, {
          name: 'Nope',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.updateFolder).not.toHaveBeenCalled();
    });
  });

  describe('discovery', () => {
    it('allows merchant staff to list folders', async () => {
      repo.listFolders.mockResolvedValue({
        page: 1,
        limit: 10,
        totalCount: 1,
        totalPages: 1,
        data: [folderFixture],
      });
      await expect(service.listFolders(merchantStaff('m1'), {})).resolves.toEqual(
        expect.objectContaining({ totalCount: 1 }),
      );
    });

    it('allows merchant owner to get folder detail with media', async () => {
      repo.findFolder.mockResolvedValue(folderFixture);
      repo.listMedia.mockResolvedValue([
        {
          id: UUID.media,
          folderId: UUID.folder,
          kind: 'PHOTO',
          url: 'https://cdn.example/p.jpg',
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      await expect(
        service.getFolder(merchantStaff('m1', 'MERCHANT_OWNER'), UUID.folder),
      ).resolves.toEqual(
        expect.objectContaining({
          folder: folderFixture,
          media: expect.arrayContaining([expect.objectContaining({ kind: 'PHOTO' })]),
        }),
      );
    });

    it('rejects get for missing folder', async () => {
      repo.findFolder.mockResolvedValue(null);
      await expect(service.getFolder(superAdmin, UUID.folder)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows merchant staff to list media without creating an experience', async () => {
      repo.findFolder.mockResolvedValue(folderFixture);
      repo.listMedia.mockResolvedValue([]);
      await expect(service.listMedia(merchantStaff('m1'), UUID.folder)).resolves.toEqual([]);
      expect(repo.createFolder).not.toHaveBeenCalled();
    });
  });

  describe('media', () => {
    it('appends photos without removing existing media', async () => {
      repo.findFolder
        .mockResolvedValueOnce(folderFixture)
        .mockResolvedValueOnce({ ...folderFixture, photoCount: 2 });
      repo.appendMedia.mockResolvedValue([
        {
          id: UUID.media,
          folderId: UUID.folder,
          kind: 'PHOTO',
          url: 'https://cdn.example/new.jpg',
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      repo.listMedia.mockResolvedValue([
        {
          id: UUID.other,
          folderId: UUID.folder,
          kind: 'PHOTO',
          url: 'https://cdn.example/old.jpg',
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: UUID.media,
          folderId: UUID.folder,
          kind: 'PHOTO',
          url: 'https://cdn.example/new.jpg',
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.appendMedia(superAdmin, UUID.folder, {
        photos: ['https://cdn.example/new.jpg'],
      });

      expect(repo.appendMedia).toHaveBeenCalledWith({
        folderId: UUID.folder,
        kind: 'PHOTO',
        urls: ['https://cdn.example/new.jpg'],
      });
      expect(result.media).toHaveLength(2);
      expect(result.appended).toHaveLength(1);
    });

    it('rejects empty media payload', async () => {
      repo.findFolder.mockResolvedValue(folderFixture);
      await expect(service.appendMedia(superAdmin, UUID.folder, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects malformed photos payload', async () => {
      repo.findFolder.mockResolvedValue(folderFixture);
      await expect(
        service.appendMedia(superAdmin, UUID.folder, { photos: [123 as any] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects media append for missing folder', async () => {
      repo.findFolder.mockResolvedValue(null);
      await expect(
        service.appendMedia(superAdmin, UUID.folder, { photos: ['https://x'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects merchant media append', async () => {
      await expect(
        service.appendMedia(merchantStaff('m1'), UUID.folder, {
          photos: ['https://cdn.example/p.jpg'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.appendMedia).not.toHaveBeenCalled();
    });

    it('soft-archives media for SUPER_ADMIN', async () => {
      repo.findFolder.mockResolvedValue(folderFixture);
      repo.archiveMedia.mockResolvedValue({
        id: UUID.media,
        folderId: UUID.folder,
        kind: 'PHOTO',
        url: 'https://cdn.example/p.jpg',
        isArchived: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await expect(
        service.archiveMedia(superAdmin, UUID.folder, {
          mediaId: UUID.media,
          type: 'photo',
        }),
      ).resolves.toEqual(expect.objectContaining({ isArchived: true }));
    });

    it('rejects archive when media missing', async () => {
      repo.findFolder.mockResolvedValue(folderFixture);
      repo.archiveMedia.mockResolvedValue(null);
      await expect(
        service.archiveMedia(superAdmin, UUID.folder, { mediaId: UUID.media }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects invalid media type', async () => {
      repo.findFolder.mockResolvedValue(folderFixture);
      await expect(
        service.archiveMedia(superAdmin, UUID.folder, {
          mediaId: UUID.media,
          type: 'audio',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('boundaries', () => {
    it('does not invent lineage or materialization side effects on discovery', async () => {
      repo.findFolder.mockResolvedValue(folderFixture);
      repo.listMedia.mockResolvedValue([]);
      await service.getFolder(merchantStaff('m1'), UUID.folder);
      expect(Object.keys(repo)).not.toContain('materialize');
      expect(repo.createFolder).not.toHaveBeenCalled();
      expect(repo.updateFolder).not.toHaveBeenCalled();
      expect(repo.appendMedia).not.toHaveBeenCalled();
    });
  });
});
