import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, validateSync } from 'class-validator';

class EnvironmentVariables {
  // ── Database ───────────────────────────────────────────────────────────────
  @IsNotEmpty({ message: 'MONGO_URI is required in env' })
  @IsString()
  MONGO_URI: string;

  @IsOptional()
  @IsString()
  PORT?: string;

  @IsOptional()
  @IsString()
  DATABASE_USERNAME?: string;

  @IsOptional()
  @IsString()
  DATABASE_PASSWORD?: string;

  // ── Cloudinary ─────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_SECRET?: string;

  // ── JWT Secrets ────────────────────────────────────────────────────────────
  @IsNotEmpty({ message: 'JWT_ACCESS_SECRET is required in env' })
  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsNotEmpty({ message: 'JWT_REFRESH_SECRET is required in env' })
  @IsString()
  JWT_REFRESH_SECRET: string;

  // ── Bootstrap Secret ───────────────────────────────────────────────────────
  @IsNotEmpty({ message: 'FIRST_SUPERADMIN_SECRET is required in env' })
  @IsString()
  FIRST_SUPERADMIN_SECRET: string;

  // ── Brevo (Email OTP) ──────────────────────────────────────────────────────
  @IsNotEmpty({ message: 'BREVO_API_KEY is required in env' })
  @IsString()
  BREVO_API_KEY: string;

  @IsNotEmpty({ message: 'BREVO_SENDER_EMAIL is required in env' })
  @IsString()
  BREVO_SENDER_EMAIL: string;

  @IsNotEmpty({ message: 'BREVO_SENDER_NAME is required in env' })
  @IsString()
  BREVO_SENDER_NAME: string;

  // ── Product Module ─────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  PRODUCT_APPROVAL_REQUIRED?: string;

  // ── Redis (Caching, Queues) ────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsString()
  UPSTASH_REDIS_REST_URL?: string;

  @IsOptional()
  @IsString()
  UPSTASH_REDIS_REST_TOKEN?: string;

  // ── Cashfree Payment Gateway ───────────────────────────────────────────────
  @IsOptional()
  @IsString()
  CASHFREE_ENV?: string;

  @IsOptional()
  @IsString()
  CASHFREE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  CASHFREE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  CASHFREE_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  CASHFREE_WEBHOOK_URL?: string;

  // ── Cashfree Payouts API ───────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  CASHFREE_PAYOUT_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  CASHFREE_PAYOUT_CLIENT_SECRET?: string;

  // ── Firebase Cloud Messaging ───────────────────────────────────────────────
  @IsOptional()
  @IsString()
  FIREBASE_SERVICE_ACCOUNT_PATH?: string;

  // ── Google Maps API ────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  GOOGLE_MAPS_API_KEY?: string;
}

/**
 * Validates environment variables at application boot time.
 * If any required variable is missing, the application will fail to start.
 */
export function validateEnv(config: Record<string, any>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((err) => Object.values(err.constraints || {}).join(', '))
      .join('; ');
    throw new Error(`❌ Environment Validation Error: ${errorMessages}`);
  }
  return validatedConfig;
}
