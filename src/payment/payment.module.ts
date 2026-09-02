import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';

import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { CashfreeService } from './cashfree.service';
import { PaymentEventsProcessor } from './processors/payment-events.processor';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { PlatformConfig, PlatformConfigSchema } from './schemas/platform-config.schema';
import { Seller, SellerSchema } from '../auth/schemas/seller.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { WalletModule } from '../wallet/wallet.module';
import { OfferModule } from '../offer/offer.module';
import { FcmNotificationModule } from '../fcm-notification/fcm-notification.module';
import { VoucherModule } from '../voucher/voucher.module';
import { ReferralModule } from '../referral/referral.module';

/**
 * PaymentModule — Cashfree integration, order creation, webhook handling,
 * transaction ledger, and settlement cron.
 *
 * Hub module: on successful payment, calls into WalletModule (cashback),
 * FcmNotificationModule (alerts), and provides data for RankingModule.
 * Each side-effect is dispatched via BullMQ so failures are independent.
 *
 * Exports PaymentService for RankingModule and AdModule dependencies.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: PlatformConfig.name, schema: PlatformConfigSchema },
      { name: Seller.name, schema: SellerSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({ name: 'payment-events' }),
    forwardRef(() => WalletModule),
    forwardRef(() => OfferModule),
    forwardRef(() => VoucherModule),
    FcmNotificationModule,
    ReferralModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, CashfreeService, PaymentEventsProcessor],
  exports: [PaymentService, CashfreeService],
})
export class PaymentModule {}
