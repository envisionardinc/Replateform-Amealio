import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtConsumerGuard } from '../../identity/authentication/guards/jwt-consumer.guard';
import { CurrentUser } from '../../identity/authorization/current-user.decorator';
import type { Principal } from '../../identity/authorization/principal';
import { ConsumerFavoritesService } from '../application/consumer-favorites.service';
import {
  CONSUMER_FAVORITE_TYPES,
  ListFavoritesQueryDto,
  PutFavoriteDto,
  type ConsumerFavoriteType,
} from './dto/consumer-favorites.dto';

@Controller({ path: 'me/favorites', version: '1' })
@UseGuards(JwtConsumerGuard)
export class ConsumerFavoritesController {
  constructor(private readonly favorites: ConsumerFavoritesService) {}

  private userId(principal?: Principal): string {
    if (!principal?.userId) throw new UnauthorizedException('Consumer authentication required');
    return principal.userId;
  }

  @Get()
  async list(@CurrentUser() principal: Principal, @Query() query: ListFavoritesQueryDto) {
    return { data: await this.favorites.listMine(this.userId(principal), query.targetType) };
  }

  @Put()
  put(@CurrentUser() principal: Principal, @Body() body: PutFavoriteDto) {
    return this.favorites.putMine(this.userId(principal), body.targetType, body.targetId);
  }

  @Delete(':targetType/:targetId')
  delete(
    @CurrentUser() principal: Principal,
    @Param('targetType') targetType: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    if (!isSupportedType(targetType)) {
      throw new BadRequestException('targetType must be RESTAURANT or MENU_ITEM');
    }
    return this.favorites.deleteMine(this.userId(principal), targetType, targetId);
  }
}

function isSupportedType(value: string): value is ConsumerFavoriteType {
  return (CONSUMER_FAVORITE_TYPES as readonly string[]).includes(value);
}
