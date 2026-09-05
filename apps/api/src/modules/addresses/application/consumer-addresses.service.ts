import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  AddressRepository,
  type AddressRow,
  type AddressWrite,
} from '../infrastructure/address.repository';

export type AddressView = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ConsumerAddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AddressRepository,
  ) {}

  async listMine(userId: string): Promise<AddressView[]> {
    this.requireUserId(userId);
    const rows = await this.repo.listMine(userId);
    return rows.map(toView);
  }

  async createMine(userId: string, input: AddressWrite & { line1: string }): Promise<AddressView> {
    this.requireUserId(userId);
    const row = await this.prisma.$transaction(async (tx) => {
      const liveCount = await this.repo.countLive(tx, userId);
      const isDefault = input.isDefault === true || liveCount === 0;
      if (isDefault) {
        await this.repo.clearDefaults(tx, userId);
      }
      return this.repo.createMine(tx, userId, {
        label: input.label ?? null,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        pinCode: input.pinCode ?? null,
        isDefault,
      });
    });
    return toView(row);
  }

  async patchMine(userId: string, id: string, input: AddressWrite): Promise<AddressView> {
    this.requireUserId(userId);
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await this.repo.findActiveMine(tx, userId, id);
      if (!existing) throw new NotFoundException('Address not found');
      const data: AddressWrite = {};
      if (input.label !== undefined) data.label = input.label;
      if (input.line1 !== undefined) data.line1 = input.line1;
      if (input.line2 !== undefined) data.line2 = input.line2;
      if (input.city !== undefined) data.city = input.city;
      if (input.state !== undefined) data.state = input.state;
      if (input.pinCode !== undefined) data.pinCode = input.pinCode;
      if (input.isDefault === true) {
        await this.repo.clearDefaults(tx, userId, id);
        data.isDefault = true;
      } else if (input.isDefault === false) {
        data.isDefault = false;
      }
      return this.repo.updateMine(tx, id, data);
    });
    return toView(row);
  }

  async deleteMine(userId: string, id: string): Promise<{ id: string }> {
    this.requireUserId(userId);
    await this.repo.softDeleteMine(userId, id);
    return { id };
  }

  async loadOwnedForCheckout(userId: string, addressId: string): Promise<AddressCheckoutSource> {
    this.requireUserId(userId);
    const row = await this.repo.findActiveMine(this.prisma, userId, addressId);
    if (!row) throw new NotFoundException('Address not found');
    return {
      id: row.id,
      label: row.label,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      state: row.state,
      pinCode: row.pinCode,
      lat: row.lat,
      lon: row.lon,
    };
  }

  private requireUserId(userId: string): void {
    if (!userId) throw new UnauthorizedException('Consumer authentication required');
  }
}

function toView(row: AddressRow): AddressView {
  return {
    id: row.id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    pinCode: row.pinCode,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Checkout identity lookup. Book HTTP still omits lat/lon. */
export type AddressCheckoutSource = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  lat: number | null;
  lon: number | null;
};
