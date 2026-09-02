import {
  Controller, Post, Get, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * ReviewController — verified purchase review endpoints.
 *
 * Route access summary:
 *   POST /reviews                        — auth (USER) — create a review (must own the transaction)
 *   GET  /reviews/seller/:sellerId       — public — paginated reviews + aggregate rating
 */
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * POST /reviews
   * Create a review for a seller.
   * Customer must own a successful (paid) transaction with this seller.
   * One review per transaction — prevents fake reviews.
   * AUTH required — customer (USER) only.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async createReview(@CurrentUser() user: any, @Body() dto: CreateReviewDto) {
    return this.reviewService.createReview(user._id.toString(), dto);
  }

  /**
   * GET /reviews/seller/:sellerId
   * Returns paginated reviews for a seller, plus aggregate rating.
   * PUBLIC — no auth required.
   */
  @Get('seller/:sellerId')
  async getSellerReviews(
    @Param('sellerId') sellerId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewService.getSellerReviews(sellerId, page, limit);
  }
}
