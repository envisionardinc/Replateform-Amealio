import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/** Application environments (kept distinct; staging/production are infra-managed). */
export enum NodeEnv {
  development = 'development',
  test = 'test',
  staging = 'staging',
  production = 'production',
}

export enum LogLevel {
  error = 'error',
  warn = 'warn',
  log = 'log',
  debug = 'debug',
  verbose = 'verbose',
}

/** Validated environment variables. Missing/invalid values fail fast at bootstrap. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.development;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsEnum(LogLevel)
  @IsOptional()
  LOG_LEVEL: LogLevel = LogLevel.log;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;

  // ---- Consumer authentication (P1.7.1B) — DEVELOPMENT config only ----
  // Access-token signing secret. A dev default is used if unset; a real secret
  // MUST be provided in staging/production (infra-managed, not in this repo).
  @IsString()
  @IsOptional()
  JWT_ACCESS_SECRET: string = 'dev-only-access-secret-change-me';

  @IsInt()
  @Min(60)
  @IsOptional()
  JWT_ACCESS_TTL_SECONDS: number = 900; // 15 minutes (proposed default)

  @IsInt()
  @Min(1)
  @IsOptional()
  REFRESH_TTL_DAYS: number = 30; // proposed default (mirrors legacy consumer session)

  // Feature flag: the new consumer auth endpoints are only active when enabled.
  // Default true for local/dev; never wired to production traffic.
  @IsBoolean()
  @IsOptional()
  CONSUMER_AUTH_ENABLED: boolean = true;
}

/** ConfigModule validate() hook. Throws on invalid configuration. */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return validated;
}
