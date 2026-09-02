import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AdminThrottlerGuard } from './common/guards/admin-throttler.guard';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SellerModule } from './seller/seller.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { CategoryModule } from './category/category.module';
import { ProductTypeModule } from './product-type/product-type.module';
import { FilterModule } from './filter/filter.module';
import { ProductModule } from './product/product.module';
import { BannerModule } from './banner/banner.module';
import { HomeModule } from './home/home.module';
import { PaymentModule } from './payment/payment.module';
import { WalletModule } from './wallet/wallet.module';
import { OfferModule } from './offer/offer.module';
import { FcmNotificationModule } from './fcm-notification/fcm-notification.module';
import { ReviewModule } from './review/review.module';
import { RankingModule } from './ranking/ranking.module';
import { AdModule } from './ad/ad.module';
import { ScheduledTasksModule } from './common/scheduled-tasks.module';
import { validateEnv } from './common/config/env.validation';
import { UsersModule } from './users/users.module';
import { PopularSearchModule } from './popular-search/popular-search.module';
import { VoucherModule } from './voucher/voucher.module';
import { ReferralModule } from './referral/referral.module';
import { PolicyModule } from './policy/policy.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'qa'}`,
      validate: validateEnv,
    }),

    // Enable @Cron decorators for scheduled jobs (settlement, ranking, ad expiry)
    ScheduleModule.forRoot(),

    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 100 },
      { name: 'otp', ttl: 60000, limit: 5 },
      // Tighter rate limit for product write endpoints (abuse prevention)
      { name: 'product_write', ttl: 60000, limit: 30 },
      // Separate, more lenient limit for search (real users need generous limits)
      { name: 'search', ttl: 60000, limit: 60 },
    ]),

    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl && redisUrl.startsWith('redis')) {
          try {
            const store = await redisStore({
              url: redisUrl,
              ttl: 30000,
              maxRetriesPerRequest: 1,
              retryStrategy: (times: number) => (times > 3 ? null : 500),
            });
            return { store };
          } catch (_) {}
        }
        return { ttl: 30000 };
      },
      inject: [ConfigService],
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl && redisUrl.startsWith('redis')) {
          return {
            url: redisUrl,
            redis: {
              maxRetriesPerRequest: 1,
              enableReadyCheck: false,
              retryStrategy: (times: number) => (times > 3 ? null : 1000),
            },
          };
        }
        return {
          redis: {
            host: '127.0.0.1',
            port: 6379,
            maxRetriesPerRequest: 1,
            enableReadyCheck: false,
            retryStrategy: () => null,
            lazyConnect: true,
          },
        };
      },
      inject: [ConfigService],
    }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),

    // ─── Existing Modules (unchanged) ──────────────────────────────────────
    AuthModule,              // Public routes: /auth/...
    SellerModule,            // Seller domain routes: /seller/...
    AdminAuthModule,         // Admin-only routes: /admin-auth/...
    UsersModule,             // User management console routes
    CategoryModule,          // Category tree + attribute templates
    ProductTypeModule,       // Dynamic Product types (shirt, pant, etc.)
    FilterModule,            // Global filter options (color, gender, size, fit, discount)
    ProductModule,           // Product CRUD, ownership, approval, tags
    BannerModule,            // Promotional banners
    HomeModule,              // /home BFF aggregator

    // ─── New Modules (§2–§8) ────────────────────────────────────────────────
    PaymentModule,           // Cashfree PG, orders, webhooks, settlement (§2)
    WalletModule,            // Wallet ledger, balance, cashback (§3)
    OfferModule,             // Cashback config, coupons, wallet caps (§4)
    FcmNotificationModule,   // Firebase push notifications (§5)
    ReviewModule,            // Verified purchase reviews (§6)
    RankingModule,           // Shop ranking algorithm (§7)
    AdModule,                // Advertisement system (§8)
    PopularSearchModule,     // Dynamic trending search keywords
    ScheduledTasksModule,    // Cron jobs: nightly settlement, ranking, ad expiry
    VoucherModule,
    ReferralModule,
    PolicyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AdminThrottlerGuard },
  ],
})
export class AppModule {}
