import {
  Controller, Post, Get, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { AdService } from './ad.service';
import { CreateAdDto, UpdateAdPricingDto, QueryActiveAdsDto } from './dto/ad.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * AdController — advertisement system endpoints.
 *
 * Route access summary:
 *   POST  /ads                          — auth (SELLER) — create an ad campaign
 *   GET   /ads/mine                     — auth (SELLER) — own ad history
 *   GET   /ads/active                   — public — active ads for a screen slot (proximity-sorted)
 *   GET   /ads/pricing                  — public — current ad pricing
 *   GET   /admin/ads                    — admin — all ads with filters
 *   PATCH /ads/:id/stop                 — admin — force-stop an ad
 *   POST  /admin/ads/pricing            — admin — update ad pricing
 */
@Controller()
export class AdController {
  constructor(private readonly adService: AdService) {}

  // ─── Seller Endpoints ──────────────────────────────────────────────────────

  /**
   * POST /ads
   * Create a shop or product ad.
   * Returns a Cashfree payment order for the ad cost.
   * AUTH required — SELLER only.
   */
  @Post('ads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async createAd(@CurrentUser() user: any, @Body() dto: CreateAdDto) {
    return this.adService.createAd(user._id.toString(), dto);
  }

  /**
   * GET /ads/mine
   * Seller's own ad history/status.
   * AUTH required — SELLER only.
   */
  @Get('ads/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async getMyAds(@CurrentUser() user: any) {
    return this.adService.getSellerAds(user._id.toString());
  }

  // ─── Public Endpoints ──────────────────────────────────────────────────────

  /**
   * GET /ads/active?lat=...&lng=...&slot=home_banner
   * Returns active ads for a screen slot, sorted by proximity + round-robin.
   * PUBLIC — no auth required.
   */
  @Get('ads/active')
  async getActiveAds(@Query() query: QueryActiveAdsDto) {
    return this.adService.resolveAdsForSlot(query);
  }

  /**
   * GET /ads/pricing
   * Returns current ad pricing configuration.
   * PUBLIC — sellers need to see pricing before creating ads.
   */
  @Get('ads/pricing')
  async getPricing() {
    return this.adService.getPricing();
  }

  // ─── Admin Endpoints ───────────────────────────────────────────────────────

  /**
   * GET /admin/ads
   * All ads with filters (admin view).
   * AUTH required — admin only.
   */
  @Get('admin/ads')
  @RequirePermission('manage_ads')
  async getAllAds(
    @Query('status') status?: string,
    @Query('sellerId') sellerId?: string,
    @Query('type') type?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adService.getAllAds({ status, sellerId, type, page, limit });
  }

  /**
   * PATCH /ads/:id/stop
   * Force-stop any ad (admin only).
   * Used for policy violations or at admin's discretion.
   * AUTH required — admin only.
   */
  @Patch('ads/:id/stop')
  @RequirePermission('manage_ads')
  async stopAd(@Param('id') adId: string, @CurrentUser() user: any) {
    return this.adService.stopAd(adId, user._id.toString());
  }

  /**
   * POST /admin/ads/pricing
   * Update ad pricing for a type (shop or product).
   * Changes only affect future ad purchases.
   * AUTH required — admin only.
   */
  @Post('admin/ads/pricing')
  @RequirePermission('manage_ads')
  async updatePricing(@Body() dto: UpdateAdPricingDto) {
    return this.adService.updatePricing(dto);
  }
}
