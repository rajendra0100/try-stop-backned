import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';

import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletOperationsProcessor } from './processors/wallet-operations.processor';
import { WalletTransaction, WalletTransactionSchema } from './schemas/wallet-transaction.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';

/**
 * WalletModule — wallet ledger, balance, credit/debit operations.
 *
 * Uses atomic DB transactions to ensure the denormalized walletBalance
 * field on User never drifts from the ledger truth.
 *
 * Exports WalletService for PaymentModule to credit cashback and debit wallet.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({ name: 'wallet-operations' }),
  ],
  controllers: [WalletController],
  providers: [WalletService, WalletOperationsProcessor],
  exports: [WalletService],
})
export class WalletModule {}
