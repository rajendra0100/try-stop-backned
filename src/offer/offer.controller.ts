import {
  Controller, Post, Get, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { OfferService } from './offer.service';
import { SetCashbackRateDto, CreateCouponDto, SetWalletCapDto } from './dto/offer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * OfferController — cashback rates, coupons, and wallet cap management.
 *
 * Route access summary:
 *   GET  /offers/cashback-rate         — internal/admin — resolve effective rate for a user
 *   POST /offers/cashback-rate         — admin — set global or per-user rate
 *   GET  /offers/cashback-configs      — admin — list all cashback configs
 *   POST /offers/coupons               — admin — create/edit a coupon
 *   GET  /offers/coupons               — admin — list all coupons
 *   GET  /offers/coupons/:code/validate — auth (USER) — validate a coupon code
 *   POST /admin/wallet-cap             — admin — set global or user wallet cap
 *   GET  /admin/wallet-cap/resolve/:id — admin — check effective wallet cap for a user
 */
@Controller()
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  // ─── Cashback Rate Endpoints ──────────────────────────────────────────────

  /**
   * GET /offers/cashback-rate?userId=...
   * Resolves the effective cashback rate for a user.
   * Internal/admin endpoint — used by payment flow and admin dashboard.
   */
  @Get('offers/cashback-rate')
  @RequirePermission('manage_offers')
  async getCashbackRate(@Query('userId') userId: string) {
    if (!userId) return { error: 'userId query param is required' };
    return this.offerService.getCashbackRateForUser(userId);
  }

  /**
   * POST /offers/cashback-rate
   * Set a cashback rate (global or per-user).
   * Admin-only endpoint.
   */
  @Post('offers/cashback-rate')
  @RequirePermission('manage_offers')
  async setCashbackRate(@Body() dto: SetCashbackRateDto) {
    return this.offerService.setCashbackRate(dto);
  }

  /**
   * GET /offers/cashback-configs
   * List all cashback configuration entries (admin dashboard).
   */
  @Get('offers/cashback-configs')
  @RequirePermission('manage_offers')
  async listCashbackConfigs() {
    return this.offerService.listCashbackConfigs();
  }


  /**
   * GET /admin/config/cashback-global
   * Retrieves active global cashback/discount settings (first-order, subsequent, slabs).
   */
  @Get("admin/config/cashback-global")
  @RequirePermission("manage_offers")
  async getGlobalCashbackConfig() {
    return this.offerService.getGlobalCashbackConfig();
  }

  /**
   * POST /admin/config/cashback-global
   * Updates active global cashback/discount settings.
   */
  @Post("admin/config/cashback-global")
  @RequirePermission("manage_offers")
  async setGlobalCashbackConfig(@Body() body: any) {
    return this.offerService.setGlobalCashbackConfig(body);
  }

  // ─── Coupon Endpoints ──────────────────────────────────────────────────────

  /**
   * POST /offers/coupons
   * Create a new coupon code. Admin-only.
   */
  @Post('offers/coupons')
  @RequirePermission('manage_offers')
  async createCoupon(@Body() dto: CreateCouponDto) {
    return this.offerService.createCoupon(dto);
  }

  /**
   * GET /offers/coupons
   * List all coupons (admin dashboard).
   */
  @Get('offers/coupons')
  @RequirePermission('manage_offers')
  async listCoupons() {
    return this.offerService.listCoupons();
  }

  /**
   * GET /offers/coupons/:code/validate?orderAmount=500
   * Validates a coupon code for the current user.
   * Checks: active, not expired, usage limits, min order value.
   * AUTH required — customer (USER).
   */
  @Get('offers/coupons/:code/validate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async validateCoupon(
    @Param('code') code: string,
    @Query('orderAmount') orderAmount: number,
    @CurrentUser() user: any,
  ) {
    return this.offerService.validateCouponPublic(code, orderAmount, user._id.toString());
  }

  // ─── Wallet Cap Endpoints ──────────────────────────────────────────────────

  /**
   * POST /admin/wallet-cap
   * Set global or per-user wallet usage cap.
   * Admin-only endpoint.
   */
  @Post('admin/wallet-cap')
  @RequirePermission('manage_offers')
  async setWalletCap(@Body() dto: SetWalletCapDto) {
    return this.offerService.setWalletCap(dto);
  }

  /**
   * GET /admin/wallet-cap/resolve/:id
   * Check the effective wallet cap for a user.
   * Admin/internal endpoint.
   */
  @Get('admin/wallet-cap/resolve/:id')
  @RequirePermission('manage_offers')
  async resolveWalletCap(@Param('id') userId: string) {
    return this.offerService.resolveWalletCap(userId);
  }
}
