import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VoucherController } from './voucher.controller';
import { VoucherService } from './voucher.service';
import { VoucherConfig, VoucherConfigSchema } from './schemas/voucher-config.schema';
import { UserVoucher, UserVoucherSchema } from './schemas/user-voucher.schema';
import { VoucherTransaction, VoucherTransactionSchema } from './schemas/voucher-transaction.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { CustomVoucherSlab, CustomVoucherSlabSchema } from './schemas/custom-voucher-slab.schema';
import { PendingVoucherOrder, PendingVoucherOrderSchema } from './schemas/pending-voucher-order.schema';
import { WalletTransaction, WalletTransactionSchema } from '../wallet/schemas/wallet-transaction.schema';
import { Transaction, TransactionSchema } from '../payment/schemas/transaction.schema';
import { PaymentModule } from '../payment/payment.module';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VoucherConfig.name, schema: VoucherConfigSchema },
      { name: UserVoucher.name, schema: UserVoucherSchema },
      { name: VoucherTransaction.name, schema: VoucherTransactionSchema },
      { name: User.name, schema: UserSchema },
      { name: CustomVoucherSlab.name, schema: CustomVoucherSlabSchema },
      { name: PendingVoucherOrder.name, schema: PendingVoucherOrderSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    forwardRef(() => PaymentModule),
    ReferralModule,
  ],
  controllers: [VoucherController],
  providers: [VoucherService],
  exports: [VoucherService],
})
export class VoucherModule {}
