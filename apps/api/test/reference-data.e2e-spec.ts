import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../src/config/env.validation';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { ReferenceDataModule } from '../src/modules/reference-data/reference-data.module';
import { CategoryRepository } from '../src/modules/reference-data/infrastructure/category.repository';
import { CuisineRepository } from '../src/modules/reference-data/infrastructure/cuisine.repository';

/**
 * P1.7.4 platform foundational data (taxonomy) — integration against the TEST
 * database. Exercises the REAL `Category` (hierarchical, admin-defined = legacy
 * Category + Sub Category) + `Cuisine` lookup and their relationships. No CRUD,
 * no frontend; icons remain embedded string fields.
 */
describe('Platform foundational data / taxonomy (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categories: CategoryRepository;
  let cuisines: CuisineRepository;

  const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  let parentId = '';
  let childId = '';
  const parentLegacy = uniq('legacy-cat');
  const parentCode = uniq('CODE');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env', '../../.env'],
        }),
        PrismaModule,
        ReferenceDataModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    categories = app.get(CategoryRepository);
    cuisines = app.get(CuisineRepository);

    // Parent taxonomy (legacy "Category") with an embedded icon.
    const parent = await prisma.category.create({
      data: {
        legacyId: parentLegacy,
        code: parentCode,
        name: uniq('SeatingArea'),
        type: 'SEATING_AREA',
        icon: 'https://cdn.example/icon.png',
        iconCode: 'ic_seat',
        hexColor: '#FF8800',
        status: 'ACTIVE',
      },
    });
    parentId = parent.id;
    // Child taxonomy (legacy "Sub Category") referencing the parent.
    const child = await prisma.category.create({
      data: { name: uniq('Rooftop'), type: 'SEATING_AREA', parentId, status: 'ACTIVE' },
    });
    childId = child.id;
    // A second, soft-deleted child (inactive lifecycle).
    await prisma.category.create({
      data: { name: uniq('Retired'), type: 'SEATING_AREA', parentId, deletedAt: new Date() },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('represents an admin-defined category with embedded icon/media + legacyId', async () => {
    const c = await categories.findById(parentId);
    expect(c?.type).toBe('SEATING_AREA');
    expect(c?.icon).toBe('https://cdn.example/icon.png');
    expect(c?.iconCode).toBe('ic_seat');
    expect(c?.hexColor).toBe('#FF8800');
    expect(c?.legacyId).toBe(parentLegacy);
    const byLegacy = await categories.findByLegacyId(parentLegacy);
    expect(byLegacy?.id).toBe(parentId);
    const byCode = await categories.findByCode(parentCode);
    expect(byCode?.id).toBe(parentId);
  });

  it('enforces the parent → child (Category → Sub Category) relationship', async () => {
    const children = await categories.listChildren(parentId);
    // only the non-deleted child is returned (soft-deleted excluded)
    expect(children.map((c) => c.id)).toEqual([childId]);
    const child = await categories.findById(childId);
    expect(child?.parentId).toBe(parentId);
  });

  it('lists roots and by type (active only)', async () => {
    const roots = await categories.listRoots('SEATING_AREA');
    expect(roots.some((c) => c.id === parentId)).toBe(true);
    expect(roots.some((c) => c.parentId !== null)).toBe(false); // roots only
    const byType = await categories.listByType('SEATING_AREA');
    expect(byType.some((c) => c.id === childId)).toBe(true); // children included by type
    expect(byType.some((c) => c.deletedAt !== null)).toBe(false); // soft-deleted excluded
  });

  it('enforces legacyId and code uniqueness', async () => {
    await expect(
      prisma.category.create({ data: { name: uniq('dupLegacy'), legacyId: parentLegacy } }),
    ).rejects.toThrow(/unique|constraint/i);
    await expect(
      prisma.category.create({ data: { name: uniq('dupCode'), code: parentCode } }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it('handles a missing/unknown reference safely', async () => {
    expect(await categories.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await categories.findById('not-a-uuid')).toBeNull();
    expect(await categories.findByLegacyId('nope')).toBeNull();
  });

  it('represents the Cuisine lookup with legacyId + icon; enforces name/legacyId uniqueness', async () => {
    const legacy = uniq('legacy-cuisine');
    const name = uniq('Italian');
    const c = await prisma.cuisine.create({
      data: { legacyId: legacy, name, icon: 'https://cdn.example/it.png', status: 'ACTIVE' },
    });
    const byId = await cuisines.findById(c.id);
    expect(byId?.name).toBe(name);
    expect(byId?.icon).toBe('https://cdn.example/it.png');
    expect((await cuisines.findByLegacyId(legacy))?.id).toBe(c.id);
    expect((await cuisines.findByName(name))?.id).toBe(c.id);
    await expect(prisma.cuisine.create({ data: { name } })).rejects.toThrow(/unique|constraint/i);
    await expect(
      prisma.cuisine.create({ data: { name: uniq('Other'), legacyId: legacy } }),
    ).rejects.toThrow(/unique|constraint/i);
  });
});
