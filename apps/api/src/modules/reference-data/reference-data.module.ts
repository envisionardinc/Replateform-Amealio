import { Module } from '@nestjs/common';
import { CategoryRepository } from './infrastructure/category.repository';
import { CuisineRepository } from './infrastructure/cuisine.repository';

/**
 * Platform reference-data (taxonomy) foundation module (P1.7.4).
 *
 * Read access to the admin-defined `Category` (hierarchical taxonomy = legacy
 * Category + Sub Category) and `Cuisine` lookup, for later Merchant/User domain
 * migrations to build on. No admin CRUD, no controllers, no frontend, no
 * speculative normalization (icons stay embedded; no Icon/Mood/MasterData
 * tables). Auth/tenancy unchanged (this is platform-global reference data).
 */
@Module({
  providers: [CategoryRepository, CuisineRepository],
  exports: [CategoryRepository, CuisineRepository],
})
export class ReferenceDataModule {}
