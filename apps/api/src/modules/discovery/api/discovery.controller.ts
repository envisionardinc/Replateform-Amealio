import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';
import { DiscoveryService } from '../application/discovery.service';
import type { OrderChannel } from '../../catalog/domain/catalog.types';

class QuoteModifierSelectionDto {
  @IsUUID()
  modifierId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}

class QuoteModifierGroupDto {
  @IsUUID()
  groupId!: string;

  @ValidateNested({ each: true })
  @Type(() => QuoteModifierSelectionDto)
  selections!: QuoteModifierSelectionDto[];
}

class MerchandiseQuoteDto {
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsIn(['DINE_IN', 'TAKE_AWAY', 'CURB_SIDE', 'SKIP_LINE', 'HOME_DELIVERY', 'CATERING'])
  type?: OrderChannel;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QuoteModifierGroupDto)
  modifierGroups?: QuoteModifierGroupDto[];
}

/**
 * Public consumer discovery (doc 92). Reuses Restaurant + MenuItem repositories.
 * Not a second catalog write path. Home feed is CANONICAL (Home Page 1).
 */
@Controller({ path: 'discover', version: '1' })
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('home')
  home(
    @Query('city') city?: string,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.discovery.getHome({ city, q, categoryId });
  }

  @Get('restaurants')
  list(
    @Query('city') city?: string,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.discovery.listRestaurants({ city, q, categoryId }).then((data) => ({ data }));
  }

  @Get('restaurants/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.discovery.getRestaurant(id);
  }

  @Get('restaurants/:id/menu')
  menu(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: OrderChannel,
  ) {
    return this.discovery.getMenu(id, parseChannel(type));
  }

  @Get('restaurants/:id/menus')
  customMenus(@Param('id', ParseUUIDPipe) id: string) {
    return this.discovery.listCustomMenus(id);
  }

  @Get('menus/:menuId')
  customMenu(
    @Param('menuId', ParseUUIDPipe) menuId: string,
    @Query('type') type?: OrderChannel,
  ) {
    return this.discovery.getCustomMenu(menuId, parseChannel(type));
  }

  @Get('items/:id')
  item(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: OrderChannel,
  ) {
    return this.discovery.getItem(id, parseChannel(type));
  }

  @Post('quote')
  quote(@Body() body: MerchandiseQuoteDto) {
    return this.discovery.quoteItem(body);
  }
}

const CHANNELS: OrderChannel[] = [
  'DINE_IN',
  'TAKE_AWAY',
  'CURB_SIDE',
  'SKIP_LINE',
  'HOME_DELIVERY',
  'CATERING',
];

function parseChannel(type?: string): OrderChannel | undefined {
  if (!type) return undefined;
  return CHANNELS.includes(type as OrderChannel) ? (type as OrderChannel) : undefined;
}
