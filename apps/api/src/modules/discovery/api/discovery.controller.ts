import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { DiscoveryService } from '../application/discovery.service';

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
  menu(@Param('id', ParseUUIDPipe) id: string) {
    return this.discovery.getMenu(id);
  }

  @Get('items/:id')
  item(@Param('id', ParseUUIDPipe) id: string) {
    return this.discovery.getItem(id);
  }
}
