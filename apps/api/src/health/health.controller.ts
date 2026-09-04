import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { Public } from '../common/security/security.decorators';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  uptimeSeconds: number;
  timestamp: string;
}

/** Liveness/readiness for the API. Route: GET /api/v1/health */
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const dbUp = await this.prisma.isHealthy();
    return {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
