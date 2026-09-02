import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { Throttle } from '@nestjs/throttler';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateTagsDto } from './dto/update-tags.dto';
import { RejectProductDto } from './dto/reject-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/guards/permission.guard';
import { Role } from '../common/enums/role.enum';

import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

/**
 * ProductController — handles all product CRUD, moderation, and browsing.
 *
 * Route access summary:
 *   PUBLIC (no auth): GET /products, GET /products/:id
 *   AUTH (seller): POST /products, GET /products/mine, PATCH /products/:id, DELETE /products/:id
 *   AUTH (admin/subadmin): PATCH /products/:id/approve, /reject, /tags
 *   AUTH (admin/subadmin + seller): POST /products, PATCH /products/:id, DELETE /products/:id
 *
 * ⚠ The /products/mine route is defined BEFORE /products/:id to prevent
 *   NestJS from matching "mine" as a product ID.
 */
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // ─── Public Reads (no auth required) ────────────────────────────────────────

  /**
   * GET /products
   * Returns a paginated, filtered list of live+approved products for public browsing.
   * Supports the full filter set: category, subcategory, gender, tag, priceMin/Max,
   * color, size, fit, discountMin, isNew, search, sort, hubId, cursor, limit.
   * All filters combine with AND — no filter silently drops another.
   * PUBLIC — no auth required. Guest-accessible for browse-without-login flow.
   *
   * Rate limited under "search" profile (60 req/min) — more generous than default
   * because real users scroll and filter rapidly.
   *
   * NOT cached via CacheInterceptor because query params vary wildly.
   * Popular filter combos should be cached in-service via manual Redis keys later.
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ search: { ttl: 60000, limit: 60 } })
  async getProducts(@Req() req: any, @Query() query: QueryProductDto) {
    return this.productService.getProducts(query, req.user);
  }

  // ─── Seller-Only Reads (auth required, before :id route) ───────────────────

  /**
   * GET /products/mine
   * Returns the logged-in seller's own products — ALL statuses (pending, live, rejected).
   * Powers the seller's shop screen with tabs/sections per category.
   * Uses seller's req.user.id from JWT — never accepts sellerId from query params.
   * AUTH required — seller only.
   */
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  async getMyProducts(@Req() req: any, @Query() query: QueryProductDto) {
    return this.productService.getMyProducts(req.user._id.toString(), query);
  }

  /**
   * GET /products/:id
   * Returns the full product detail for the PDP (Product Detail Page).
   * Only returns live+approved products.
   * PUBLIC — no auth required. Guest-accessible.
   *
   * Cached in Redis for 15 seconds — PDP is hit repeatedly for the same product.
   */
  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(15000) // 15 seconds
  async getProductById(@Param('id') id: string) {
    return this.productService.getProductById(id);
  }

  // ─── Product Creation (auth required) ─────────────────────────────────────

  /**
   * POST /products
   * Create a new product.
   * Accessible by: seller, admin (superadmin), subadmin (with manage_products permission).
   *
   * Rate limited under "product_write" profile (30 req/min) — prevents mass-upload abuse.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.SUPERADMIN, Role.SUBADMIN)
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async createProduct(@Req() req: any, @Body() dto: CreateProductDto) {
    return this.productService.createProduct(
      dto,
      req.user._id.toString(),
      req.user.role,
    );
  }

  /**
   * PATCH /products/:id
   * Update a product.
   * Seller can only update their own products (ownership enforced in service layer).
   * Admin/Subadmin can update any product (ownership bypass).
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.SUPERADMIN, Role.SUBADMIN)
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async updateProduct(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.updateProduct(
      id,
      dto,
      req.user._id.toString(),
      req.user.role,
    );
  }

  /**
   * DELETE /products/:id
   * Soft delete a product — sets status to "deleted".
   * Seller can only delete their own products (ownership enforced in service layer).
   * Admin/Subadmin can delete any product.
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER, Role.SUPERADMIN, Role.SUBADMIN)
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async deleteProduct(@Param('id') id: string, @Req() req: any) {
    return this.productService.deleteProduct(
      id,
      req.user._id.toString(),
      req.user.role,
    );
  }

  // ─── Moderation (admin/subadmin with manage_products permission) ───────────

  /**
   * PATCH /products/:id/approve
   * Approve a product — sets status to "live", isApproved to true.
   * Admin or Subadmin with manage_products permission only.
   */
  @Patch(':id/approve')
  @RequirePermission('manage_products')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async approveProduct(@Param('id') id: string, @Req() req: any) {
    return this.productService.approveProduct(id, req.user._id.toString());
  }

  /**
   * PATCH /products/:id/reject
   * Reject a product — sets status to "rejected" with a reason.
   * Admin or Subadmin with manage_products permission only.
   */
  @Patch(':id/reject')
  @RequirePermission('manage_products')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async rejectProduct(
    @Param('id') id: string,
    @Body() dto: RejectProductDto,
  ) {
    return this.productService.rejectProduct(id, dto.reason, 'admin');
  }

  /**
   * PATCH /products/:id/tags
   * Add or remove marketing tags on a product (e.g. "steal_drops", "trending").
   * Tags drive homepage carousels and campaign pages.
   * Admin or Subadmin with manage_products permission only.
   */
  @Patch(':id/tags')
  @RequirePermission('manage_products')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async updateTags(
    @Param('id') id: string,
    @Body() dto: UpdateTagsDto,
  ) {
    return this.productService.updateTags(id, dto);
  }
}
