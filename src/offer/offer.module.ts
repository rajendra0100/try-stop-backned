import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OfferController } from './offer.controller';
import { OfferService } from './offer.service';
import { CashbackConfig, CashbackConfigSchema } from './schemas/cashback-config.schema';
import { Coupon, CouponSchema } from './schemas/coupon.schema';
import { CouponUsage, CouponUsageSchema } from './schemas/coupon-usage.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { PlatformConfig, PlatformConfigSchema } from '../payment/schemas/platform-config.schema';
import { Transaction, TransactionSchema } from '../payment/schemas/transaction.schema';

/**
 * OfferModule — cashback config, coupons, wallet cap settings.
 *
 * Independent module — no circular dependencies.
 * Exports OfferService for PaymentModule to resolve cashback rates and validate coupons.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CashbackConfig.name, schema: CashbackConfigSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: CouponUsage.name, schema: CouponUsageSchema },
      { name: User.name, schema: UserSchema },
      { name: PlatformConfig.name, schema: PlatformConfigSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  controllers: [OfferController],
  providers: [OfferService],
  exports: [OfferService],
})
export class OfferModule {}
