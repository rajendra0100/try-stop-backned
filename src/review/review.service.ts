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
 * Reviews cannot be edited once submitted to preserve rating integrity.
 * On new review, incrementally updates the seller's cached avgRating and reviewCount.
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
   *   - No existing review for this transaction (reviews are final and uneditable)
   *
   * After creation, incrementally updates seller's cached avgRating and reviewCount.
   */
  async createReview(customerId: string, dto: CreateReviewDto): Promise<any> {
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

    // 2. Check for existing review on this transaction (immutable review integrity)
    const existingReview = await this.reviewModel.findOne({
      transactionId: new Types.ObjectId(dto.transactionId),
    });
    if (existingReview) {
      throw new BadRequestException('You have already reviewed this transaction. Reviews cannot be edited.');
    }

    // 3. Create the review
    const review = await this.reviewModel.create({
      customerId: new Types.ObjectId(customerId),
      sellerId: new Types.ObjectId(dto.sellerId),
      transactionId: new Types.ObjectId(dto.transactionId),
      rating: dto.rating,
      comment: dto.comment ? dto.comment.trim() : '',
    });

    // 4. Incrementally update seller's cached rating
    await this.updateSellerRatingCache(dto.sellerId);

    this.logger.log(`Review created by user ${customerId} for seller ${dto.sellerId}: ${dto.rating} stars`);
    return this.reviewModel
      .findById(review._id)
      .populate('customerId', 'name profilePhotoUrl')
      .populate('transactionId', 'totalAmount createdAt cashfreeOrderId')
      .lean();
  }

  /**
   * Gets paginated reviews for a seller, plus aggregate rating, breakdown,
   * and current user's review status (if authenticated).
   */
  async getSellerReviews(
    sellerId: string,
    page = 1,
    limit = 20,
    rating?: number,
    currentUserId?: string,
  ): Promise<any> {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = (parsedPage - 1) * parsedLimit;
    const sellerObjectId = new Types.ObjectId(sellerId);

    const query: any = { sellerId: sellerObjectId };
    if (rating && !isNaN(Number(rating))) {
      query.rating = Number(rating);
    }

    const [reviews, total, aggregate, breakdownAggregate] = await Promise.all([
      this.reviewModel
        .find(query)
        .populate('customerId', 'name profilePhotoUrl')
        .populate('transactionId', 'totalAmount createdAt cashfreeOrderId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      this.reviewModel.countDocuments(query),
      this.reviewModel.aggregate([
        { $match: { sellerId: sellerObjectId } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
      this.reviewModel.aggregate([
        { $match: { sellerId: sellerObjectId } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
    ]);

    const avgRating = aggregate.length > 0 ? Math.round(aggregate[0].avgRating * 10) / 10 : 0;
    const reviewCount = aggregate.length > 0 ? aggregate[0].count : 0;

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdownAggregate.forEach(b => {
      if (b._id >= 1 && b._id <= 5) breakdown[b._id] = b.count;
    });

    let userReview: any = null;
    let pendingCount = 0;
    let pendingTransactions: any[] = [];

    if (currentUserId) {
      const customerObjectId = new Types.ObjectId(currentUserId);
      const [existingUserReview, userPaidTxns, reviewedTxnIds] = await Promise.all([
        this.reviewModel
          .findOne({ sellerId: sellerObjectId, customerId: customerObjectId })
          .populate('transactionId', 'totalAmount createdAt cashfreeOrderId')
          .sort({ createdAt: -1 })
          .lean(),
        this.transactionModel
          .find({ customerId: customerObjectId, sellerId: sellerObjectId, paymentStatus: 'paid' })
          .select('_id totalAmount createdAt cashfreeOrderId')
          .sort({ createdAt: -1 })
          .lean(),
        this.reviewModel.distinct('transactionId', {
          customerId: customerObjectId,
          sellerId: sellerObjectId,
        }),
      ]);

      userReview = existingUserReview;
      const reviewedSet = new Set(reviewedTxnIds.map(id => id.toString()));
      pendingTransactions = userPaidTxns
        .filter(t => !reviewedSet.has(t._id.toString()))
        .map(t => ({
          transactionId: t._id.toString(),
          totalAmount: t.totalAmount,
          createdAt: (t as any).createdAt,
          cashfreeOrderId: t.cashfreeOrderId,
        }));
      pendingCount = pendingTransactions.length;
    }

    return {
      reviews,
      avgRating,
      reviewCount,
      ratingBreakdown: breakdown,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
      hasMore: parsedPage < Math.ceil(total / parsedLimit),
      userReview,
      pendingCount,
      pendingTransactions,
    };
  }

  /**
   * Get all unrated paid transactions for an authenticated user.
   */
  async getUserPendingReviews(
    customerId: string,
    page = 1,
    limit = 10,
    sellerId?: string,
  ) {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    const skip = (parsedPage - 1) * parsedLimit;

    const customerObjectId = new Types.ObjectId(customerId);
    const query: any = { customerId: customerObjectId, paymentStatus: 'paid' };
    if (sellerId) {
      query.sellerId = new Types.ObjectId(sellerId);
    }

    const reviewedTxnIds = await this.reviewModel.distinct('transactionId', {
      customerId: customerObjectId,
    });

    query._id = { $nin: reviewedTxnIds };

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .populate('sellerId', 'shopName shopLogoUrl shopAddress phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      pendingReviews: items.map(t => ({
        transactionId: t._id.toString(),
        totalAmount: t.totalAmount,
        paidAt: (t as any).paidAt || (t as any).createdAt,
        createdAt: (t as any).createdAt,
        cashfreeOrderId: t.cashfreeOrderId,
        seller: t.sellerId,
      })),
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
      hasMore: parsedPage < Math.ceil(total / parsedLimit),
    };
  }

  /**
   * Get all reviews submitted by an authenticated user.
   */
  async getUserReviews(customerId: string, page = 1, limit = 10) {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    const skip = (parsedPage - 1) * parsedLimit;

    const query = { customerId: new Types.ObjectId(customerId) };

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(query)
        .populate('sellerId', 'shopName shopLogoUrl shopAddress')
        .populate('transactionId', 'totalAmount createdAt cashfreeOrderId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      this.reviewModel.countDocuments(query),
    ]);

    return {
      reviews,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
      hasMore: parsedPage < Math.ceil(total / parsedLimit),
    };
  }

  /**
   * Seller retrieves reviews for their store with rating filters and pagination.
   */
  async getSellerMyReviews(
    sellerId: string,
    page = 1,
    limit = 20,
    rating?: number,
  ) {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    const sellerObjectId = new Types.ObjectId(sellerId);
    const query: any = { sellerId: sellerObjectId };
    if (rating && !isNaN(Number(rating))) {
      query.rating = Number(rating);
    }

    const [reviews, total, aggregate, breakdownAggregate] = await Promise.all([
      this.reviewModel
        .find(query)
        .populate('customerId', 'name profilePhotoUrl phone')
        .populate('transactionId', 'totalAmount createdAt cashfreeOrderId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      this.reviewModel.countDocuments(query),
      this.reviewModel.aggregate([
        { $match: { sellerId: sellerObjectId } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
      this.reviewModel.aggregate([
        { $match: { sellerId: sellerObjectId } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
    ]);

    const avgRating = aggregate.length > 0 ? Math.round(aggregate[0].avgRating * 10) / 10 : 0;
    const reviewCount = aggregate.length > 0 ? aggregate[0].count : 0;

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdownAggregate.forEach(b => {
      if (b._id >= 1 && b._id <= 5) breakdown[b._id] = b.count;
    });

    return {
      reviews,
      avgRating,
      reviewCount,
      ratingBreakdown: breakdown,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
      hasMore: parsedPage < Math.ceil(total / parsedLimit),
    };
  }

  /**
   * Incrementally updates the seller's cached avgRating and reviewCount.
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
        avgRating: Math.round(aggregate[0].avgRating * 10) / 10,
        reviewCount: aggregate[0].reviewCount,
      });
    } else {
      await this.sellerModel.findByIdAndUpdate(sellerId, {
        avgRating: 0,
        reviewCount: 0,
      });
    }
  }
}
