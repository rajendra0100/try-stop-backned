import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { CreateVoucherConfigDto, PurchaseVoucherDto } from './dto/voucher.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequirePermission } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('vouchers')
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  /**
   * POST /vouchers
   * Admin or Seller creates a voucher config.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createConfig(
    @Body() dto: CreateVoucherConfigDto,
    @CurrentUser() user: any,
  ) {
    const creatorRole = user.role === 'seller' ? 'seller' : 'admin';
    return this.voucherService.createVoucherConfig(dto, creatorRole);
  }

  /**
   * GET /vouchers
   * User lists all available active vouchers.
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getConfigs(
    @Query('sellerId') sellerId?: string,
    @CurrentUser() user?: any,
  ) {
    const userId = user ? (user._id?.toString() || user.userId || user.id) : undefined;
    return this.voucherService.getVoucherConfigs(sellerId, userId);
  }

  /**
   * GET /vouchers/admin
   * Admin lists all configs including inactive ones.
   */

  /**
   * GET /vouchers/admin/orders
   * Admin lists all voucher purchase orders.
   */
  @Get("admin/orders")
  @RequirePermission("manage_offers")
  async getAdminVoucherOrders(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("search") search?: string,
    @Query("status") status?: string,
  ) {
    return this.voucherService.getAllVoucherOrders(page, limit, search, status);
  }

  @Get('admin')
  @RequirePermission('manage_offers')
  async getAdminConfigs() {
    return this.voucherService.getAllConfigsForAdmin();
  }

  /**
   * PATCH /vouchers/:id/status
   * Admin activates or deactivates a voucher config.
   */
  @Patch(':id/status')
  @RequirePermission('manage_offers')
  async toggleStatus(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.voucherService.setConfigStatus(id, isActive);
  }

  /**
   * GET /vouchers/custom-slabs
   * Public endpoint to retrieve custom discount slabs.
   */
  @Get('custom-slabs')
  async getCustomSlabs() {
    return this.voucherService.getCustomSlabs();
  }

  /**
   * POST /vouchers/custom-slabs
   * Admin-only: Creates or updates a discount slab.
   */
  @Post('custom-slabs')
  @UseGuards(JwtAuthGuard)
  @RequirePermission('manage_settings')
  async upsertSlab(
    @Body('maxAmount') maxAmount: number,
    @Body('discountPercent') discountPercent: number,
  ) {
    return this.voucherService.upsertCustomSlab(maxAmount, discountPercent);
  }

  /**
   * DELETE /vouchers/custom-slabs/:id
   * Admin-only: Deletes a discount slab.
   */
  @Post('custom-slabs/:id/delete') // Using POST delete standard to keep it simple, or standard DELETE
  @UseGuards(JwtAuthGuard)
  @RequirePermission('manage_settings')
  async deleteSlab(@Param('id') id: string) {
    return this.voucherService.deleteCustomSlab(id);
  }

  /**
   * POST /vouchers/purchase
   * Authenticated user purchases a voucher config.
   */
  @Post('purchase')
  @UseGuards(JwtAuthGuard)
  async purchaseVoucher(
    @CurrentUser() user: any,
    @Body() dto: PurchaseVoucherDto,
  ) {
    return this.voucherService.initiatePurchase(
      user._id.toString(),
      dto.voucherConfigId,
      dto.quantity || 1,
    );
  }

  /**
   * POST /vouchers/purchase-custom
   * Authenticated user purchases a custom amount voucher.
   */
  @Post('purchase-custom')
  @UseGuards(JwtAuthGuard)
  async purchaseCustomVoucher(
    @CurrentUser() user: any,
    @Body('amount') amount: number,
  ) {
    return this.voucherService.initiateCustomPurchase(
      user._id.toString(),
      amount,
    );
  }
}
