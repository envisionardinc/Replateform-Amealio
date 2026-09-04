import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createApp } from '../src/main';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { mapPlatformFolderToExperienceMedia } from '../src/modules/experience/domain/platform-folder-media.mapper';

/**
 * Merchant Experience end-to-end cutover path over the canonical Nest HTTP API:
 *   staff login → discover platform folders → open folder/media → map (client) →
 *   create Experience → get → patch media → assert isolation / no platform mutation.
 *
 * No server-side clone/materialize. Upload-assets is out of scope (URL fixtures only).
 */
describe('Merchant Experience Nest cutover vertical (HTTP e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const PASSWORD = 'MerchantSecret123!';
  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedMerchantOwner() {
    const merchant = await prisma.merchant.create({ data: { legalName: uniq('Biz') } });
    const restaurant = await prisma.restaurant.create({
      data: { merchantId: merchant.id, name: uniq('R'), city: 'Pune' },
    });
    const email = `${uniq('owner')}@example.test`;
    const staff = await prisma.staffMember.create({
      data: {
        merchantId: merchant.id,
        name: 'Owner',
        email,
        staffRole: 'MERCHANT_OWNER',
        status: 'ACTIVE',
      },
    });
    await prisma.staffCredential.create({
      data: {
        staffMemberId: staff.id,
        type: 'PASSWORD',
        secretHash: await bcrypt.hash(PASSWORD, 10),
      },
    });
    return { merchant, restaurant, email, staff };
  }

  async function login(email: string): Promise<string> {
    const res = await http().post('/api/v1/auth/staff/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.tokenType).toBe('Bearer');
    return res.body.accessToken as string;
  }

  it('runs the merchant Experience cutover path over Nest HTTP', async () => {
    const a = await seedMerchantOwner();
    const b = await seedMerchantOwner();
    const tokenA = await login(a.email);
    const tokenB = await login(b.email);

    const adminEmail = `${uniq('admin')}@example.test`;
    const admin = await prisma.staffMember.create({
      data: {
        name: 'Admin',
        email: adminEmail,
        staffRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });
    await prisma.staffCredential.create({
      data: {
        staffMemberId: admin.id,
        type: 'PASSWORD',
        secretHash: await bcrypt.hash(PASSWORD, 10),
      },
    });
    const adminToken = await login(adminEmail);

    const cat = await prisma.category.create({ data: { name: uniq('Occasion') } });
    const sub = await prisma.category.create({
      data: { name: uniq('Festive'), parentId: cat.id },
    });

    const folderRes = await http()
      .post('/api/v1/platform-experience-catalogue')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: uniq('Diwali Folder'),
        categoryId: cat.id,
        subcategoryId: sub.id,
        description: 'Festive dinner',
        userBenefits: 'Live music',
        termsAndConditions: 'No outside food',
        tags: ['diwali'],
      })
      .expect(201);
    const folderId = folderRes.body.id as string;

    await http()
      .put(`/api/v1/platform-experience-catalogue/${folderId}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        photos: ['https://cdn.example/a.jpg', 'https://cdn.example/archived.jpg'],
        videos: ['https://cdn.example/v.mp4'],
      })
      .expect(200);

    // Archive one photo so import must skip it.
    const mediaList = await http()
      .get(`/api/v1/platform-experience-catalogue/${folderId}/media?includeArchived=true`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const archivedPhoto = (mediaList.body as Array<{ id: string; url: string }>).find((m) =>
      m.url.includes('archived'),
    );
    expect(archivedPhoto).toBeTruthy();
    await http()
      .delete(`/api/v1/platform-experience-catalogue/${folderId}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mediaId: archivedPhoto!.id, type: 'photo' })
      .expect(200);

    // Merchant cannot mutate platform catalogue.
    await http()
      .post('/api/v1/platform-experience-catalogue')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Nope',
        categoryId: cat.id,
        subcategoryId: sub.id,
      })
      .expect(403);

    // Merchant discovers folders + detail + media.
    const list = await http()
      .get('/api/v1/platform-experience-catalogue')
      .set('Authorization', `Bearer ${tokenA}`)
      .query({ search: folderRes.body.name, limit: 20 })
      .expect(200);
    expect(list.body.data.map((f: { id: string }) => f.id)).toContain(folderId);

    const detail = await http()
      .get(`/api/v1/platform-experience-catalogue/${folderId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const mapped = mapPlatformFolderToExperienceMedia({
      folder: detail.body.folder,
      media: detail.body.media,
    });
    expect(mapped.photos).toEqual(['https://cdn.example/a.jpg']);
    expect(mapped.photos).not.toContain('https://cdn.example/archived.jpg');
    expect(mapped.videos).toEqual(['https://cdn.example/v.mp4']);
    expect(mapped).not.toHaveProperty('sourceFolderId');

    const created = await http()
      .post('/api/v1/experiences')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        restaurantId: a.restaurant.id,
        expType: 'SPECIAL',
        ...mapped,
      })
      .expect(201);

    expect(created.body.merchantId).toBe(a.merchant.id);
    expect(created.body.photos).toEqual(['https://cdn.example/a.jpg']);
    expect(created.body.photoThumbnails).toEqual(['https://cdn.example/a.jpg']);
    expect(created.body.videos).toEqual(['https://cdn.example/v.mp4']);
    expect(created.body.promotionalVideos).toEqual([]);
    expect(created.body.userBenefits).toBe('Live music');
    expect(created.body.termsAndConditions).toBe('No outside food');
    expect(created.body.tags).toEqual(['diwali']);
    expect(created.body).not.toHaveProperty('sourceFolderId');

    const got = await http()
      .get(`/api/v1/experiences/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(got.body.photos).toEqual(['https://cdn.example/a.jpg']);

    const patched = await http()
      .patch(`/api/v1/experiences/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        photos: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
        tags: ['diwali', 'updated'],
        tc: 'Updated T&Cs',
      })
      .expect(200);
    expect(patched.body.photos).toHaveLength(2);
    expect(patched.body.tags).toEqual(['diwali', 'updated']);
    expect(patched.body.termsAndConditions).toBe('Updated T&Cs');

    // Cross-merchant get/patch rejected.
    await http()
      .get(`/api/v1/experiences/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
    await http()
      .patch(`/api/v1/experiences/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ photos: ['https://cdn.example/hack.jpg'] })
      .expect(403);

    // Platform folder unchanged / unlinked after merchant create.
    const still = await http()
      .get(`/api/v1/platform-experience-catalogue/${folderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(still.body.folder.id).toBe(folderId);
    const activeMedia = (still.body.media as Array<{ isArchived: boolean }>).filter(
      (m) => !m.isArchived,
    );
    expect(activeMedia).toHaveLength(2);
  });
});
