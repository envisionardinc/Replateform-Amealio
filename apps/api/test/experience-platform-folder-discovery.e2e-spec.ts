import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module';
import { MerchantProvisioningService } from '../src/modules/onboarding/application/merchant-provisioning.service';
import { ExperienceModule } from '../src/modules/experience/experience.module';
import { ExperienceService } from '../src/modules/experience/application/experience.service';
import { PlatformExperienceCatalogueModule } from '../src/modules/platform-experience-catalogue/platform-experience-catalogue.module';
import { PlatformExperienceCatalogueService } from '../src/modules/platform-experience-catalogue/platform-experience-catalogue.service';
import { mapPlatformFolderToExperienceMedia } from '../src/modules/experience/domain/platform-folder-media.mapper';
import { StaffAuthModule } from '../src/modules/identity/staff-authentication/staff-auth.module';
import type { StaffPrincipal } from '../src/modules/identity/staff-authentication/staff-principal';

/**
 * Verifies the legacy CloneFolderPopup flow against the target APIs:
 *   discover platform folder → map URLs client-side → POST Experience
 * No server-side materialize/clone; no lineage field on the resulting Experience.
 */
describe('Experience platform-folder discovery wire (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: MerchantProvisioningService;
  let experiences: ExperienceService;
  let platformCatalogue: PlatformExperienceCatalogueService;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const superAdmin: StaffPrincipal = {
    staffMemberId: '00000000-0000-4000-8000-0000000000aa',
    actorType: 'STAFF',
    staffRole: 'SUPER_ADMIN',
    merchantId: null,
  };
  const staffOf = (merchantId: string): StaffPrincipal => ({
    staffMemberId: '00000000-0000-4000-8000-0000000000bb',
    actorType: 'STAFF',
    staffRole: 'MERCHANT_STAFF',
    merchantId,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env', '../../.env'],
        }),
        PrismaModule,
        OnboardingModule,
        ExperienceModule,
        PlatformExperienceCatalogueModule,
        StaffAuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    provisioning = app.get(MerchantProvisioningService);
    experiences = app.get(ExperienceService);
    platformCatalogue = app.get(PlatformExperienceCatalogueService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('discovers a platform folder and creates an independent merchant Experience from mapped URLs', async () => {
    const m = await provisioning.createMerchant(superAdmin, { legalName: uniq('Biz') });
    const r = await provisioning.createRestaurant(staffOf(m.id), {
      merchantId: m.id,
      name: uniq('R'),
      city: 'Pune',
    });
    const cat = await prisma.category.create({ data: { name: uniq('Occasion') } });
    const sub = await prisma.category.create({
      data: { name: uniq('Festive'), parentId: cat.id },
    });

    const folder = await platformCatalogue.createFolder(superAdmin, {
      name: uniq('Diwali Folder'),
      categoryId: cat.id,
      subcategoryId: sub.id,
      description: 'Festive dinner folder',
      userBenefits: 'Live music',
      termsAndConditions: 'No outside food',
      tags: ['diwali'],
    });
    await platformCatalogue.appendMedia(superAdmin, folder.id, {
      photos: ['https://cdn.example/folder-a.jpg', 'https://cdn.example/folder-b.jpg'],
      videos: ['https://cdn.example/folder-v.mp4'],
    });

    const listed = await platformCatalogue.listFolders(staffOf(m.id), {
      search: folder.name,
      limit: 20,
    });
    expect(listed.data.map((f) => f.id)).toContain(folder.id);

    const detail = await platformCatalogue.getFolder(staffOf(m.id), folder.id);
    const media = await platformCatalogue.listMedia(staffOf(m.id), folder.id);
    expect(media.length).toBeGreaterThanOrEqual(2);

    const mapped = mapPlatformFolderToExperienceMedia({
      folder: detail.folder,
      media: detail.media,
    });

    const exp = await experiences.createExperience(staffOf(m.id), {
      restaurantId: r.id,
      ...mapped,
    });

    expect(exp.name).toBe(folder.name);
    expect(exp.photos).toEqual([
      'https://cdn.example/folder-a.jpg',
      'https://cdn.example/folder-b.jpg',
    ]);
    expect(exp.photoThumbnails).toEqual(exp.photos);
    expect(exp.videos).toEqual(['https://cdn.example/folder-v.mp4']);
    expect(exp.promotionalVideos).toEqual([]);
    expect(exp.userBenefits).toBe('Live music');
    expect(exp.termsAndConditions).toBe('No outside food');
    expect(exp.tags).toEqual(['diwali']);
    expect(exp.categoryId).toBe(cat.id);
    expect(exp.subCategoryId).toBe(sub.id);
    expect(exp.merchantId).toBe(m.id);
    expect(exp.restaurantId).toBe(r.id);
    expect(exp).not.toHaveProperty('sourceFolderId');

    const row = await prisma.experience.findUniqueOrThrow({ where: { id: exp.id } });
    expect(Object.keys(row)).not.toContain('sourceFolderId');
    expect(Object.keys(row)).not.toContain('platformFolderId');

    // Platform folder remains unchanged and unlinked.
    const still = await platformCatalogue.getFolder(superAdmin, folder.id);
    expect(still.folder.id).toBe(folder.id);
    expect(still.media.filter((x) => !x.isArchived)).toHaveLength(3);
  });
});
