import {
  Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards, Query, Patch, Delete, Param,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateSubadminDto } from './dto/create-subadmin.dto';
import { UpdateSubadminDto } from './dto/update-subadmin.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { Admin, AdminDocument } from './schemas/admin.schema';
import { RegisterSellerDto } from '../auth/dto/register-seller.dto';
import { UpdateSellerAdminDto } from '../auth/dto/update-seller-admin.dto';
import { UpdateSellerDeletionRequestStatusDto } from '../auth/dto/seller-deletion-request.dto';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * AdminAuthController — under /admin-auth prefix.
 *
 * IMPORTANT: This entire controller prefix should be restricted at the
 * infrastructure level (Nginx/API Gateway) to internal networks or
 * an admin-only subdomain. It must never be discoverable by end users.
 *
 * POST /admin-auth/login                — admin/subadmin password login
 * POST /admin-auth/bootstrap            — create first superadmin (secret required)
 * POST /admin-auth/create-subadmin      — create subadmin (superadmin only)
 */
@Controller('admin-auth')
@SkipThrottle()
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  /** Admin or Subadmin login — email + password */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  /**
   * Bootstrap endpoint — creates the very first SuperAdmin using an env secret.
   * Should be disabled or removed after initial setup.
   */
  @Post('bootstrap')
  async bootstrap(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('secret') secret: string,
  ) {
    return this.adminAuthService.createSuperAdmin(password, name, email, secret);
  }

  /**
   * Create a subadmin — protected, only superadmin can call.
   * POST /admin-auth/create-subadmin
   */
  @Post('create-subadmin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  async createSubadmin(
    @Body() dto: CreateSubadminDto,
    @CurrentUser() currentAdmin: Admin,
  ) {
    return this.adminAuthService.createSubadmin(dto, currentAdmin as AdminDocument);
  }

  /**
   * Get logged-in admin profile.
   * GET /admin-auth/profile
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() admin: Admin) {
    const adminObj = (admin as any).toObject ? (admin as any).toObject() : admin;
    delete adminObj.password;
    return adminObj;
  }

  /**
   * List subadmins — protected, superadmin only.
   * GET /admin-auth/subadmins
   */
  @Get('subadmins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  async listSubadmins() {
    return this.adminAuthService.listSubadmins();
  }

  /**
   * Update subadmin details and permissions — protected, superadmin only.
   * PATCH /admin-auth/subadmins/:id
   */
  @Patch('subadmins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  async updateSubadmin(
    @Param('id') id: string,
    @Body() dto: UpdateSubadminDto,
    @CurrentUser() currentAdmin: Admin,
  ) {
    return this.adminAuthService.updateSubadmin(id, dto, currentAdmin as AdminDocument);
  }

  /**
   * Delete subadmin — protected, superadmin only.
   * DELETE /admin-auth/subadmins/:id
   */
  @Delete('subadmins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  async deleteSubadmin(
    @Param('id') id: string,
    @CurrentUser() currentAdmin: Admin,
  ) {
    return this.adminAuthService.deleteSubadmin(id, currentAdmin as AdminDocument);
  }



  @Get('sellers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async listSellers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminAuthService.listSellers(page, limit, search, status);
  }


  /** Get all seller deletion requests */
  @Get('seller-deletion-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async getSellerDeletionRequests(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminAuthService.getSellerDeletionRequests(page, limit, status, search);
  }

  /** Update status or admin notes on seller deletion request */
  @Patch('seller-deletion-requests/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async updateSellerDeletionRequestStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSellerDeletionRequestStatusDto,
  ) {
    return this.adminAuthService.updateSellerDeletionRequestStatus(id, dto);
  }

  /** Permanently execute seller deletion */
  @Delete('seller-deletion-requests/:id/execute')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async executeSellerDeletion(@Param('id') id: string) {
    return this.adminAuthService.executeSellerDeletion(id);
  }

  @Get('sellers/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async getSellerStats() {
    return this.adminAuthService.getSellerStats();
  }

  /**
   * Onboard a seller directly from the admin panel (auto-approved).
   * POST /admin-auth/sellers
   */
  @Post('sellers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async onboardSeller(@Body() dto: RegisterSellerDto) {
    return this.adminAuthService.onboardSeller(dto);
  }

  /**
   * PATCH /admin-auth/sellers/:id/status
   * Admin approves or rejects a seller registration.
   */
  @Patch('sellers/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async updateSellerStatus(
    @Param('id') sellerId: string,
    @Body('status') status: 'approved' | 'rejected' | 'pending',
  ) {
    return this.adminAuthService.updateSellerStatus(sellerId, status);
  }

  /**
   * PATCH /admin-auth/sellers/:id/commission
   * Admin sets custom commission rate and PG fee rate for a seller.
   */
  @Patch('sellers/:id/commission')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async updateSellerCommission(
    @Param('id') sellerId: string,
    @Body('commissionRate') commissionRate?: number,
    @Body('customPgFeeRate') customPgFeeRate?: number,
  ) {
    return this.adminAuthService.updateSellerCommission(sellerId, commissionRate, customPgFeeRate);
  }

  /**
   * PATCH /admin-auth/sellers/:id/offers
   * Admin manages seller promotional offers & discounts.
   */
  @Patch('sellers/:id/offers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async updateSellerOffers(
    @Param('id') sellerId: string,
    @Body('offerTags') offerTags: string[],
    @Body('discountPercent') discountPercent: number,
  ) {
    return this.adminAuthService.updateSellerOffers(sellerId, offerTags, discountPercent);
  }

  /**
   * PATCH /admin-auth/sellers/:id
   * Admin updates a seller's complete details.
   */
  @Patch('sellers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.SUBADMIN)
  async updateSellerProfile(
    @Param('id') sellerId: string,
    @Body() dto: UpdateSellerAdminDto,
  ) {
    return this.adminAuthService.updateSellerProfile(sellerId, dto);
  }
}
