import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { OrderTypeName } from '../domain/ordering.types';

export interface CartItemRow {
  id: string;
  cartId: string;
  menuItemId: string | null;
  variantId: string | null;
  quantity: number;
  customization: Prisma.JsonValue | null;
  addOns: Prisma.JsonValue | null;
}

export interface CartRow {
  id: string;
  userId: string | null;
  merchantId: string | null;
  restaurantId: string | null;
  type: OrderTypeName | null;
  items: CartItemRow[];
}

const CART_INCLUDE = {
  items: { orderBy: { id: 'asc' as const } },
} as const;

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByUserId(userId: string): Promise<CartRow | null> {
    const row = await this.prisma.cart.findFirst({
      where: { userId, deletedAt: null },
      include: CART_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return row ? this.toRow(row) : null;
  }

  async getOrCreate(userId: string): Promise<CartRow> {
    const existing = await this.findActiveByUserId(userId);
    if (existing) return existing;
    const created = await this.prisma.cart.create({
      data: { userId },
      include: CART_INCLUDE,
    });
    return this.toRow(created);
  }

  async replaceForRestaurant(
    cartId: string,
    restaurantId: string,
    merchantId: string,
    type: OrderTypeName | null,
  ): Promise<CartRow> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { cartId } });
      return tx.cart.update({
        where: { id: cartId },
        data: { restaurantId, merchantId, type },
        include: CART_INCLUDE,
      });
    });
    return this.toRow(row);
  }

  async addItem(
    cartId: string,
    data: {
      menuItemId: string;
      variantId: string;
      quantity: number;
      customization?: Prisma.InputJsonValue;
      addOns?: Prisma.InputJsonValue;
    },
  ): Promise<CartItemRow> {
    const row = await this.prisma.cartItem.create({
      data: {
        cartId,
        menuItemId: data.menuItemId,
        variantId: data.variantId,
        quantity: data.quantity,
        customization: data.customization,
        addOns: data.addOns,
      },
    });
    return row;
  }

  async updateItem(cartId: string, itemId: string, quantity: number): Promise<CartItemRow | null> {
    const existing = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
    });
    if (!existing) return null;
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  async deleteItem(cartId: string, itemId: string): Promise<boolean> {
    const result = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId },
    });
    return result.count > 0;
  }

  async findById(cartId: string): Promise<CartRow | null> {
    const row = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: CART_INCLUDE,
    });
    return row ? this.toRow(row) : null;
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.cart.deleteMany({ where: { userId } });
  }

  async setType(cartId: string, type: OrderTypeName): Promise<void> {
    await this.prisma.cart.update({ where: { id: cartId }, data: { type } });
  }

  private toRow(row: {
    id: string;
    userId: string | null;
    merchantId: string | null;
    restaurantId: string | null;
    type: string | null;
    items: CartItemRow[];
  }): CartRow {
    return {
      id: row.id,
      userId: row.userId,
      merchantId: row.merchantId,
      restaurantId: row.restaurantId,
      type: (row.type as OrderTypeName | null) ?? null,
      items: row.items,
    };
  }
}
