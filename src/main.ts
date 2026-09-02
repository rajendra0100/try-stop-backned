import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication, ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import express, { Express } from 'express';

let cachedServer: Express;

async function createNestServer(expressInstance?: Express): Promise<NestExpressApplication> {
  const app = expressInstance
    ? await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(expressInstance))
    : await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable trust proxy so that NestJS rate limiting (Throttler) resolves the correct user client IP behind ngrok/proxies/Vercel
  app.set('trust proxy', true);

  // ── Global Validation ──────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Global Error Handling ─────────────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Global Response Wrapping ──────────────────────────────────────────────
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.enableCors();

  return app;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await createNestServer();
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  logger.log(`🚀 Application running on port ${port} [${process.env.NODE_ENV ?? 'development'}]`);
}

// Export default serverless handler for Vercel
export default async function handler(req: any, res: any) {
  if (!cachedServer) {
    const server = express();
    const app = await createNestServer(server);
    await app.init();
    cachedServer = server;
  }
  return cachedServer(req, res);
}

// Standalone server mode when NOT running on Vercel
if (!process.env.VERCEL) {
  bootstrap();
}
