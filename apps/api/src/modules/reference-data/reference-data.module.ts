import { Module } from '@nestjs/common';
import { CategoryRepository } from './infrastructure/category.repository';
import { CuisineRepository } from './infrastructure/cuisine.repository';
import { CurrencyRepository } from './infrastructure/currency.repository';

/**
 * Platform reference-data foundation module (P1.7.4 taxonomy + P1.7.6 currency).
 *
 * Read access to the admin-defined `Category` (hierarchical taxonomy = legacy
 * Category + Sub Category), `Cuisine` lookup, and `Currency` reference (ISO 4217;
 * supplements embedded `currencyCode`). No admin CRUD, no controllers, no
 * frontend, no FX/conversion, no speculative normalization. Auth/tenancy
 * unchanged (platform-global reference data).
 */
@Module({
  providers: [CategoryRepository, CuisineRepository, CurrencyRepository],
  exports: [CategoryRepository, CuisineRepository, CurrencyRepository],
})
export class ReferenceDataModule {}
