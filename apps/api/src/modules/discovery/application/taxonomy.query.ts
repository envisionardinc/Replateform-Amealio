import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { DiscoveryTaxonomy, DiscoveryTaxonomyChip } from '../domain/discovery-feed';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TaxonomyQuery {
  constructor(private readonly prisma: PrismaService) {}

  isCategoryId(value?: string): value is string {
    return Boolean(value && UUID_RE.test(value.trim()));
  }

  async categoryIdsIncludingDescendants(categoryId: string): Promise<string[]> {
    const rows = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, parentId: true },
    });
    const children = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.parentId) continue;
      const list = children.get(row.parentId) ?? [];
      list.push(row.id);
      children.set(row.parentId, list);
    }
    const ids = new Set<string>([categoryId]);
    const stack = [categoryId];
    while (stack.length) {
      const current = stack.pop()!;
      for (const child of children.get(current) ?? []) {
        if (ids.has(child)) continue;
        ids.add(child);
        stack.push(child);
      }
    }
    return [...ids];
  }

  async listCategoryRail(): Promise<DiscoveryTaxonomy> {
    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        code: { not: null },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true, status: true },
    });
    const chips: DiscoveryTaxonomyChip[] = [];
    for (const category of categories) {
      const ids = await this.categoryIdsIncludingDescendants(category.id);
      const restaurantCount = await this.prisma.restaurant.count({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          menus: {
            some: {
              deletedAt: null,
              sections: {
                some: {
                  categoryId: { in: ids },
                  items: { some: { isPublished: true, deletedAt: null } },
                },
              },
            },
          },
        },
      });
      const suppressed = (category.status ?? '').toUpperCase() === 'INACTIVE';
      chips.push({
        id: category.id,
        label: category.name,
        type: category.type,
        available: !suppressed && restaurantCount > 0,
        restaurantCount,
      });
    }
    return { kind: 'CATEGORY', chips };
  }
}
