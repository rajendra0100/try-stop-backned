import {
  Controller, Post, Get, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * ReviewController — verified purchase review endpoints.
 *
 * Route summary:
 *   POST /reviews                  — auth (USER)   — create a verified review (once per transaction)
 *   GET  /reviews/user/pending     — auth (USER)   — get unrated paid transactions for the customer
 *   GET  /reviews/user/my-reviews  — auth (USER)   — get reviews submitted by current user
 *   GET  /reviews/seller/my-reviews— auth (SELLER) — get seller's store reviews with customer & txn details
 *   GET  /reviews/seller/:sellerId — optional auth — paginated reviews + aggregate + user status
 */
@Controller('reviews')
@SkipThrottle()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * POST /reviews
   * Create a review for a seller.
   * Customer must own a successful (paid) transaction with this seller.
   * One review per transaction — reviews cannot be edited.
   * AUTH required — customer (USER) only.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async createReview(@CurrentUser() user: any, @Body() dto: CreateReviewDto) {
    return this.reviewService.createReview(user._id.toString(), dto);
  }

  /**
   * GET /reviews/user/pending
   * Returns list of paid transactions for the current customer that haven't been reviewed yet.
   * Allows optional sellerId query filter.
   */
  @Get('user/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async getUserPendingReviews(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sellerId') sellerId?: string,
  ) {
    return this.reviewService.getUserPendingReviews(
      user._id.toString(),
      page,
      limit,
      sellerId,
    );
  }

  /**
   * GET /reviews/user/my-reviews
   * Returns all reviews submitted by the current customer, with seller and transaction info.
   */
  @Get('user/my-reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async getUserReviews(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewService.getUserReviews(
      user._id.toString(),
      page,
      limit,
    );
  }

  /**
   * GET /reviews/seller/my-reviews
   * Returns reviews received by the authenticated seller for their shop,
   * including customer details, transaction info, rating breakdown, and optional rating filter.
   */
  @Get('seller/my-reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async getSellerMyReviews(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('rating') rating?: number,
  ) {
    return this.reviewService.getSellerMyReviews(
      user._id.toString(),
      page,
      limit,
      rating,
    );
  }

  /**
   * GET /reviews/seller/:sellerId
   * Returns paginated reviews for a seller, aggregate rating, rating breakdown (1-5 stars),
   * and if the requester is an authenticated customer, returns their review and any pending transactions.
   */
  @Get('seller/:sellerId')
  @UseGuards(OptionalJwtAuthGuard)
  async getSellerReviews(
    @Param('sellerId') sellerId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('rating') rating?: number,
    @CurrentUser() user?: any,
  ) {
    const currentUserId = user?._id ? user._id.toString() : undefined;
    return this.reviewService.getSellerReviews(
      sellerId,
      page,
      limit,
      rating,
      currentUserId,
    );
  }
}
