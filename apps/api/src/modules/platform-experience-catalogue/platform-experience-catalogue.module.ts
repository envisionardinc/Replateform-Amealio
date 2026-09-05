import { Module } from '@nestjs/common';
import { StaffAuthModule } from '../identity/staff-authentication/staff-auth.module';
import { PlatformExperienceCatalogueRepository } from './platform-experience-catalogue.repository';
import { PlatformExperienceCatalogueService } from './platform-experience-catalogue.service';
import { PlatformExperienceCatalogueController } from './platform-experience-catalogue.controller';

@Module({
  imports: [StaffAuthModule],
  controllers: [PlatformExperienceCatalogueController],
  providers: [PlatformExperienceCatalogueRepository, PlatformExperienceCatalogueService],
  exports: [PlatformExperienceCatalogueService],
})
export class PlatformExperienceCatalogueModule {}
