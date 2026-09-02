import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import { Seller, SellerSchema } from '../auth/schemas/seller.schema';
import { Transaction, TransactionSchema } from '../payment/schemas/transaction.schema';
import { Review, ReviewSchema } from '../review/schemas/review.schema';
import { Category, CategorySchema } from '../category/schemas/category.schema';

/**
 * RankingModule — shop ranking score computation + scheduled cron.
 *
 * Reads data from:
 *   - Seller (avgRating, reviewCount — cached from ReviewModule)
 *   - Transaction (30-day rolling volume)
 *   - Review (for recomputation if needed)
 *
 * Writes the computed rankingScore and onlineTxnVolume30d back to Seller documents.
 * Does NOT import ReviewModule or PaymentModule directly — just uses their schemas.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Seller.name, schema: SellerSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [RankingController],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
