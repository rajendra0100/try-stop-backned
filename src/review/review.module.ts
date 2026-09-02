import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { Review, ReviewSchema } from './schemas/review.schema';
import { Transaction, TransactionSchema } from '../payment/schemas/transaction.schema';
import { Seller, SellerSchema } from '../auth/schemas/seller.schema';

/**
 * ReviewModule — verified purchase reviews and ratings.
 *
 * Depends on Transaction schema (to verify purchase ownership)
 * and Seller schema (to update cached avgRating/reviewCount).
 *
 * Exports ReviewService for RankingModule to read review data.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Seller.name, schema: SellerSchema },
    ]),
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
