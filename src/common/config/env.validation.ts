import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsNotEmpty({ message: 'MONGO_URI is required in env' })
  @IsString()
  MONGO_URI: string;

  @IsNotEmpty({ message: 'JWT_ACCESS_SECRET is required in env' })
  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsNotEmpty({ message: 'JWT_REFRESH_SECRET is required in env' })
  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsNotEmpty({ message: 'FIRST_SUPERADMIN_SECRET is required in env' })
  @IsString()
  FIRST_SUPERADMIN_SECRET: string;

  @IsNotEmpty({ message: 'BREVO_API_KEY is required in env' })
  @IsString()
  BREVO_API_KEY: string;

  @IsNotEmpty({ message: 'BREVO_SENDER_EMAIL is required in env' })
  @IsString()
  BREVO_SENDER_EMAIL: string;

  @IsNotEmpty({ message: 'BREVO_SENDER_NAME is required in env' })
  @IsString()
  BREVO_SENDER_NAME: string;
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
