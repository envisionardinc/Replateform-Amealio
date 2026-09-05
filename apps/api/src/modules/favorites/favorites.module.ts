import { Module } from '@nestjs/common';
import { ConsumerAuthModule } from '../identity/authentication/consumer-auth.module';
import { ConsumerFavoritesController } from './api/consumer-favorites.controller';
import { ConsumerFavoritesService } from './application/consumer-favorites.service';
import { FavouriteRepository } from './infrastructure/favourite.repository';

/**
 * Consumer favorites HTTP (doc 97). JWT subject owns GET/PUT/DELETE /me/favorites
 * over the existing Favourite table. Restaurant + menu-item only. No geo.
 */
@Module({
  imports: [ConsumerAuthModule],
  controllers: [ConsumerFavoritesController],
  providers: [FavouriteRepository, ConsumerFavoritesService],
  exports: [ConsumerFavoritesService],
})
export class FavoritesModule {}
