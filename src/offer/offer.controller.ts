import {
  Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { OfferService } from './offer.service';
import {
  SetCashbackRateDto,
  CreateCouponDto,
  SellerCreateCouponDto,
  QueryCouponsDto,
  SetWalletCapDto,
} from './dto/offer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

@Controller()
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  @Get('offers/cashback-rate')
  @RequirePermission('manage_offers')
  async getCashbackRate(@Query('userId') userId: string) {
    if (!userId) return { error: 'userId query param is required' };
    return this.offerService.getCashbackRateForUser(userId);
  }

  @Post('offers/cashback-rate')
  @RequirePermission('manage_offers')
  async setCashbackRate(@Body() dto: SetCashbackRateDto) {
    return this.offerService.setCashbackRate(dto);
  }

  @Get('offers/cashback-configs')
  @RequirePermission('manage_offers')
  async listCashbackConfigs() {
    return this.offerService.listCashbackConfigs();
  }

  @Get('admin/config/cashback-global')
  @RequirePermission('manage_offers')
  async getGlobalCashbackConfig() {
    return this.offerService.getGlobalCashbackConfig();
  }

  @Post('admin/config/cashback-global')
  @RequirePermission('manage_offers')
  async setGlobalCashbackConfig(@Body() body: any) {
    return this.offerService.setGlobalCashbackConfig(body);
  }

  @Post('seller/coupons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async createSellerCoupon(
    @CurrentUser() user: any,
    @Body() dto: SellerCreateCouponDto,
  ) {
    return this.offerService.createSellerCoupon(user._id.toString(), dto);
  }

  @Get('seller/coupons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async listSellerCoupons(
    @CurrentUser() user: any,
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('search') search: string,
    @Query('status') status: string,
  ) {
    return this.offerService.listSellerCoupons(
      user._id.toString(),
      Number(page) || 1,
      Number(limit) || 10,
      search || '',
      status || 'all',
    );
  }

  @Patch('seller/coupons/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async toggleSellerCouponStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.offerService.toggleCouponStatus(id, user._id.toString());
  }

  @Delete('seller/coupons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async deleteSellerCoupon(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.offerService.deleteCoupon(id, user._id.toString());
  }

  @Post('admin/coupons')
  @RequirePermission('manage_offers')
  async adminCreateCoupon(
    @CurrentUser() user: any,
    @Body() dto: CreateCouponDto,
  ) {
    const adminId = user?._id?.toString() || '';
    return this.offerService.adminCreateCoupon(adminId, dto);
  }

  @Get('admin/coupons')
  @RequirePermission('manage_offers')
  async adminListCoupons(@Query() query: QueryCouponsDto) {
    return this.offerService.adminListCoupons(query);
  }

  @Patch('admin/coupons/:id/status')
  @RequirePermission('manage_offers')
  async toggleAdminCouponStatus(@Param('id') id: string) {
    return this.offerService.toggleCouponStatus(id);
  }

  @Delete('admin/coupons/:id')
  @RequirePermission('manage_offers')
  async deleteAdminCoupon(@Param('id') id: string) {
    return this.offerService.deleteCoupon(id);
  }

  @Get('admin/sellers/:sellerId/coupons')
  @RequirePermission('manage_offers')
  async adminGetSellerCoupons(@Param('sellerId') sellerId: string) {
    return this.offerService.adminGetSellerCoupons(sellerId);
  }

  @Post('offers/coupons')
  @RequirePermission('manage_offers')
  async createCoupon(@Body() dto: CreateCouponDto) {
    return this.offerService.createCoupon(dto);
  }

  @Get('offers/coupons')
  @RequirePermission('manage_offers')
  async listCoupons() {
    return this.offerService.listCoupons();
  }

  @Get('offers/coupons/:code/validate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  async validateCoupon(
    @Param('code') code: string,
    @Query('orderAmount') orderAmount: number,
    @Query('sellerId') sellerId: string,
    @CurrentUser() user: any,
  ) {
    return this.offerService.validateCouponPublic(
      code,
      Number(orderAmount),
      user._id.toString(),
      sellerId,
    );
  }

  @Post('admin/wallet-cap')
  @RequirePermission('manage_offers')
  async setWalletCap(@Body() dto: SetWalletCapDto) {
    return this.offerService.setWalletCap(dto);
  }

  @Get('admin/wallet-cap/resolve/:id')
  @RequirePermission('manage_offers')
  async resolveWalletCap(@Param('id') userId: string) {
    return this.offerService.resolveWalletCap(userId);
  }

  @Get('offers/coupons/store/:sellerId')
  @UseGuards(JwtAuthGuard)
  async getStoreCoupons(
    @Param('sellerId') sellerId: string,
    @CurrentUser() user: any,
  ) {
    const userId = user?._id?.toString();
    return this.offerService.getStoreCouponsForUser(sellerId, userId);
  }

  @Get('coupons/store/:sellerId')
  @UseGuards(JwtAuthGuard)
  async getStoreCouponsAlias(
    @Param('sellerId') sellerId: string,
    @CurrentUser() user: any,
  ) {
    const userId = user?._id?.toString();
    return this.offerService.getStoreCouponsForUser(sellerId, userId);
  }

}
