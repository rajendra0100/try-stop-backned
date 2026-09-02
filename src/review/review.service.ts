import {
  Injectable, Logger, BadRequestException, NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Review, ReviewDocument } from './schemas/review.schema';
import { Transaction, TransactionDocument } from '../payment/schemas/transaction.schema';
import { Seller, SellerDocument } from '../auth/schemas/seller.schema';
import { CreateReviewDto } from './dto/create-review.dto';

/**
 * ReviewService — verified purchase reviews.
 *
 * Only customers with a successful (paid) transaction at a seller can review them.
 * One review per transaction — prevents fake/drive-by reviews ("verified purchase").
 * On new review, incrementally updates the seller's cached avgRating and reviewCount.
 *
 * Feeds directly into the ranking algorithm (§7).
 */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
  ) {}

  /**
   * Creates a new review.
   *
   * Validates:
   *   - Transaction exists and is paid
   *   - Transaction belongs to the current customer
   *   - Transaction is for the specified seller
   *   - No existing review for this transaction
   *
   * After creation, incrementally updates seller's cached avgRating and reviewCount.
   *
   * Callable by: authenticated user (customer)
   */
  async createReview(customerId: string, dto: CreateReviewDto): Promise<ReviewDocument> {
    // 1. Validate transaction ownership and status
    const transaction = await this.transactionModel.findById(dto.transactionId);
    if (!transaction) throw new NotFoundException('Transaction not found');

    if (transaction.paymentStatus !== 'paid') {
      throw new BadRequestException('Can only review completed (paid) transactions');
    }

    if (transaction.customerId.toString() !== customerId) {
      throw new ForbiddenException('This transaction does not belong to you');
    }

    if (transaction.sellerId.toString() !== dto.sellerId) {
      throw new BadRequestException('Transaction seller does not match the review seller');
    }

    // 2. Check for existing review on this transaction
    const existingReview = await this.reviewModel.findOne({
      transactionId: new Types.ObjectId(dto.transactionId),
    });
    if (existingReview) {
      throw new BadRequestException('You have already reviewed this transaction');
    }

    // 3. Create the review
    const review = await this.reviewModel.create({
      customerId: new Types.ObjectId(customerId),
      sellerId: new Types.ObjectId(dto.sellerId),
      transactionId: new Types.ObjectId(dto.transactionId),
      rating: dto.rating,
      comment: dto.comment || '',
    });

    // 4. Incrementally update seller's cached rating
    await this.updateSellerRatingCache(dto.sellerId);

    this.logger.log(`Review created by user ${customerId} for seller ${dto.sellerId}: ${dto.rating} stars`);
    return review;
  }

  /**
   * Gets paginated reviews for a seller, plus aggregate rating.
   * Public endpoint — no auth required.
   */
  async getSellerReviews(
    sellerId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    reviews: ReviewDocument[];
    avgRating: number;
    reviewCount: number;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [reviews, total, aggregate] = await Promise.all([
      this.reviewModel
        .find({ sellerId: new Types.ObjectId(sellerId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customerId', 'name profilePhotoUrl'),
      this.reviewModel.countDocuments({ sellerId: new Types.ObjectId(sellerId) }),
      this.reviewModel.aggregate([
        { $match: { sellerId: new Types.ObjectId(sellerId) } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
    ]);

    const avgRating = aggregate.length > 0 ? Math.round(aggregate[0].avgRating * 100) / 100 : 0;
    const reviewCount = aggregate.length > 0 ? aggregate[0].count : 0;

    return {
      reviews,
      avgRating,
      reviewCount,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Incrementally updates the seller's cached avgRating and reviewCount.
   * Called after each new review instead of recomputing from scratch on every load.
   */
  private async updateSellerRatingCache(sellerId: string): Promise<void> {
    const aggregate = await this.reviewModel.aggregate([
      { $match: { sellerId: new Types.ObjectId(sellerId) } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    if (aggregate.length > 0) {
      await this.sellerModel.findByIdAndUpdate(sellerId, {
        avgRating: Math.round(aggregate[0].avgRating * 100) / 100,
        reviewCount: aggregate[0].reviewCount,
      });
    }
  }
}
