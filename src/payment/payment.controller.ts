import {
  Controller, Post, Patch, Get, Body, Param, Query, Req,
  UseGuards, Headers, RawBodyRequest, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { PaymentService } from './payment.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateTransactionItemsDto } from './dto/update-transaction-items.dto';
import { UpdateSettlementStatusDto } from './dto/update-settlement-status.dto';
import { SettleDayDto } from './dto/settle-day.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * PaymentController — handles all payment-related endpoints.
 *
 * Route access summary:
 *   POST /payments/create-order          — auth (customer USER) — rate limited
 *   POST /payments/webhook               — public (Cashfree callback) — signature verified
 *   POST /sellers/:id/cashfree-vendor    — admin — register seller as Cashfree vendor
 *   GET  /payments/my-transactions       — auth (customer USER)
 *   GET  /payments/seller-transactions   — auth (SELLER)
 *   GET  /payments/admin/transactions    — admin
 *   GET  /admin/config/:key              — admin — get platform config value
 *   POST /admin/config                   — admin — set platform config value
 */
@Controller()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ─── Payment Order Creation ─────────────────────────────────────────────────

  /**
   * POST /payments/create-order
   * Customer initiates payment to a seller (wallet + voucher + online split).
   */
  @Post("payments/create-order")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async createPaymentOrder(
    @CurrentUser() user: any,
    @Body() dto: CreateOrderDto,
  ) {
    return this.paymentService.createPaymentOrder(user._id.toString(), dto);
  }

  /**
   * GET /payments/webhook
   * Cashfree PG health/validation ping (responds 200 OK).
   */
  @Get("payments/webhook")
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async handleWebhookGet() {
    return { status: "ok", message: "Cashfree webhook endpoint is active" };
  }

  /**
   * POST /payments/webhook
   * Cashfree PG webhook handler (idempotent, signature verified).
   */
  @Post("payments/webhook")
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async handleWebhook(
    @Body() body: any,
    @Headers("x-webhook-signature") signature: string,
  ) {
    return this.paymentService.handleWebhook(body, signature || "");
  }

  /**
   * GET /payments/verify/:orderId
   * Double-check order status directly with Cashfree and database (Reconciliation fallback).
   */

  /**
   * POST /payments/mark-failed
   * Client notifies backend immediately when Cashfree payment is cancelled or fails.
   */
  @Post("payments/mark-failed")
  @UseGuards(JwtAuthGuard)
  async markPaymentFailed(
    @Body() body: { orderId: string; reason?: string },
  ) {
    return this.paymentService.recordPaymentFailure(body.orderId, body.reason);
  }

  /**
   * POST /payments/fail/:orderId
   * Alternative direct parameter endpoint for failure tracking.
   */
  @Post("payments/fail/:orderId")
  @UseGuards(JwtAuthGuard)
  async markPaymentFailedByParam(
    @Param("orderId") orderId: string,
    @Body() body: { reason?: string },
  ) {
    return this.paymentService.recordPaymentFailure(orderId, body?.reason);
  }

  @Get("payments/verify/:orderId")
  @UseGuards(JwtAuthGuard)
  async verifyPayment(
    @Param("orderId") orderId: string,
  ) {
    return this.paymentService.verifyAndReconcileOrder(orderId);
  }

  /**
   * GET /payments/my-transactions
   * Authenticated user transaction history.
   */
  @Get("payments/my-transactions")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async getMyTransactions(
    @CurrentUser() user: any,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    return this.paymentService.getCustomerTransactions(user._id.toString(), page, limit);
  }

  // ─── Transaction History ───────────────────────────────────────────────────

  /**
   * GET /payments/seller-transactions
   * Seller's transaction history with full breakdown.
   * Includes displaySummary: "Gross Sale: ₹500 (UPI: ₹125 | Wallet: ₹375) | Net Payout: ₹420"
   * AUTH required — SELLER only.
  /**
   * GET /payments/seller-transactions
   * Seller's transaction history with full breakdown.
   * Includes displaySummary: "Gross Sale: ₹500 (UPI: ₹125 | Wallet: ₹375) | Net Payout: ₹420"
   * AUTH required — SELLER only.
   */
  @Get('payments/seller-transactions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async getSellerTransactions(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('settlementStatus') settlementStatus?: string,
  ) {
    return this.paymentService.getSellerTransactions(
      user._id.toString(),
      page,
      limit,
      search,
      period,
      startDate,
      endDate,
      settlementStatus,
    );
  }

  /**
   * PATCH /payments/seller-transactions/:id/items
   * Update itemized products for an order (seller only).
   */
  @Patch('payments/seller-transactions/:id/items')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async updateTransactionItems(
    @CurrentUser() user: any,
    @Param('id') transactionId: string,
    @Body() dto: UpdateTransactionItemsDto,
  ) {
    return this.paymentService.updateTransactionItems(
      user._id.toString(),
      transactionId,
      dto.items,
    );
  }

  /**
   * GET /payments/admin/transactions
   * Admin view of all transactions with filters.
   * AUTH required — admin only.
   */
  @Get('payments/admin/transactions')
  @RequirePermission('manage_payments')
  @SkipThrottle()
  async getAdminTransactions(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('settlementStatus') settlementStatus?: string,
    @Query('sellerId') sellerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.paymentService.getAllTransactions({
      paymentStatus,
      settlementStatus,
      sellerId,
      startDate,
      endDate,
      search,
      page,
      limit,
    });
  }

  /**
   * PATCH /payments/admin/transactions/:id/settlement-status
   * Manually update the settlement / payout status to seller.
   */

  /**
   * POST /payments/admin/transactions/:id/double-verify
   * Admin triggers direct real-time double verification against Cashfree Gateway API.
   */
  @Post("payments/admin/transactions/:id/double-verify")
  @RequirePermission("manage_payments")
  async doubleVerifyTransaction(@Param("id") id: string) {
    return this.paymentService.doubleVerifyTransaction(id);
  }

  @Patch('payments/admin/transactions/:id/settlement-status')
  @RequirePermission('manage_payments')
  async updateSettlementStatus(
    @Param('id') transactionId: string,
    @Body() dto: UpdateSettlementStatusDto,
  ) {
    return this.paymentService.updateTransactionSettlementStatus(
      transactionId,
      dto.settlementStatus,
      dto.utrReference,
    );
  }

  /**
   * GET /payments/seller-daily-settlements
   * Date-wise grouped settlement summary for the authenticated seller.
   */
  @Get('payments/seller-daily-settlements')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async getSellerDailySettlements(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.paymentService.getSellerDailySettlements(user._id.toString(), {
      startDate,
      endDate,
      status,
      page,
      limit,
    });
  }

  /**
   * GET /payments/admin/daily-settlements
   * Date-wise daily settlement breakdown across all sellers or for a specific seller (Admin).
   */
  @Get('payments/admin/daily-settlements')
  @RequirePermission('manage_payments')
  @SkipThrottle()
  async getAdminDailySettlements(
    @Query('sellerId') sellerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.paymentService.getAdminDailySettlements({
      sellerId,
      startDate,
      endDate,
      status,
      search,
      page,
      limit,
    });
  }

  /**
   * PATCH /payments/admin/daily-settlements/settle-day
   * Batch mark all unsettled orders for a seller on a specific date as settled (Admin).
   */
  @Patch('payments/admin/daily-settlements/settle-day')
  @RequirePermission('manage_payments')
  async settleDailyTransactions(@Body() dto: SettleDayDto) {
    return this.paymentService.settleDailyTransactions(
      dto.sellerId,
      dto.date,
      dto.utrReference,
    );
  }

  // ─── Platform Config (Admin) ──────────────────────────────────────────────

  /**
   * GET /admin/config/:key
   * Get a platform config value (commission_rate, wallet_usage_cap, etc.).
   * AUTH required — admin only.
   */
  @Get('admin/config/:key')
  @RequirePermission('manage_settings')
  @SkipThrottle()
  async getConfig(@Param('key') key: string) {
    const value = await this.paymentService.getConfigValue(key, 0);
    return { key, value };
  }

  /**
   * POST /admin/config
   * Set a platform config value.
   * AUTH required — admin only.
   */
  @Post('admin/config')
  @RequirePermission('manage_settings')
  @SkipThrottle()
  async setConfig(@Body() body: { key: string; value: number; description?: string }) {
    return this.paymentService.setConfigValue(body.key, body.value, body.description);
  }

  /**
   * GET /config/:key
   * Public endpoint to get a platform config value (used by mobile app, e.g., brands_caught_max_distance).
   * PUBLIC.
   */
  @Get('config/:key')
  @SkipThrottle()
  async getPublicConfig(@Param('key') key: string) {
    const value = await this.paymentService.getConfigValue(key, 5); // Fallback to 5
    return { key, value };
  }
}
