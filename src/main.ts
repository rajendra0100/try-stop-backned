import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // Enable trust proxy so that NestJS rate limiting (Throttler) resolves the correct user client IP behind ngrok/proxies
  app.set('trust proxy', true);

  // ── Global Validation ──────────────────────────────────────────────────────
  // Strips unknown fields and transforms request payloads automatically.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // Strip unknown properties silently
      forbidNonWhitelisted: true, // Throw if unknown properties are present
      transform: true,          // Auto-transform payloads to DTO class instances
      transformOptions: {
        enableImplicitConversion: true, // Convert primitives automatically
      },
    }),
  );

  // ── Global Error Handling ─────────────────────────────────────────────────
  // Catches ALL errors and returns a consistent error response envelope.
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Global Response Wrapping ──────────────────────────────────────────────
  // Wraps every successful response in { success, statusCode, data, timestamp }
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── CORS ───────────────────────────────────────────────────────────────────
  // Configure appropriately for production (restrict origins)
  app.enableCors();

  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  logger.log(`🚀 Application running on port ${port} [${process.env.NODE_ENV ?? 'development'}]`);
}

bootstrap();
