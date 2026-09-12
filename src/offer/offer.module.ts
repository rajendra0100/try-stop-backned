import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OfferController } from './offer.controller';
import { OfferService } from './offer.service';
import { CashbackConfig, CashbackConfigSchema } from './schemas/cashback-config.schema';
import { Coupon, CouponSchema } from './schemas/coupon.schema';
import { CouponUsage, CouponUsageSchema } from './schemas/coupon-usage.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Seller, SellerSchema } from '../auth/schemas/seller.schema';
import { PlatformConfig, PlatformConfigSchema } from '../payment/schemas/platform-config.schema';
import { Transaction, TransactionSchema } from '../payment/schemas/transaction.schema';
import { FcmNotificationModule } from '../fcm-notification/fcm-notification.module';

@Module({
  imports: [
    FcmNotificationModule,
    MongooseModule.forFeature([
      { name: CashbackConfig.name, schema: CashbackConfigSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: CouponUsage.name, schema: CouponUsageSchema },
      { name: User.name, schema: UserSchema },
      { name: Seller.name, schema: SellerSchema },
      { name: PlatformConfig.name, schema: PlatformConfigSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  controllers: [OfferController],
  providers: [OfferService],
  exports: [OfferService],
})
export class OfferModule {}
