import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global so future domain modules can inject PrismaService without re-importing. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
