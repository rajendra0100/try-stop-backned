import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseInterceptors,
  Inject,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL, CacheKey, CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Throttle } from '@nestjs/throttler';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  CreateAttributeTemplateDto,
  UpdateAttributeTemplateDto,
} from './dto/attribute-template.dto';
import { RequirePermission } from '../common/guards/permission.guard';

/**
 * CategoryController — manages category tree and per-subcategory attribute templates.
 *
 * Read endpoints are PUBLIC (no auth) — guests can browse categories freely.
 * Write endpoints require admin/subadmin with manage_catalog permission.
 */
@Controller('categories')
export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // ─── Public Reads (no auth required) ────────────────────────────────────────

  /**
   * GET /categories
   * Returns the full category + subcategory tree for category browsing/menu.
   * PUBLIC — no auth required, guest-accessible.
   * Cached in Redis for 60 seconds — category tree changes infrequently.
   */
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey('categories:tree')
  @CacheTTL(60000) // 60 seconds
  async getCategoryTree() {
    return this.categoryService.getCategoryTree();
  }

  /**
   * GET /categories/trending
   * Returns active categories marked isTrending: true for 3D grid display on mobile app.
   */
  @Get('trending')
  async getTrendingCategories() {
    return this.categoryService.getTrendingCategories();
  }

  /**
   * GET /categories/:subcategoryId/attributes
   * Returns the attribute template for a specific subcategory.
   * The seller app calls this after the seller picks a subcategory,
   * and dynamically renders the upload form based on the returned fields.
   * PUBLIC — no auth required.
   * Cached in Redis for 120 seconds — attribute templates rarely change.
   */
  @Get(':subcategoryId/attributes')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(120000) // 120 seconds
  async getAttributeTemplate(@Param('subcategoryId') subcategoryId: string) {
    return this.categoryService.getAttributeTemplate(subcategoryId);
  }

  // ─── Admin/Subadmin Writes (manage_catalog permission required) ─────────

  /**
   * POST /categories
   * Create a new category or subcategory.
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Post()
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async createCategory(@Body() dto: CreateCategoryDto) {
    const res = await this.categoryService.createCategory(dto);
    await this.cacheManager.del('categories:tree');
    return res;
  }

  /**
   * PATCH /categories/:id
   * Update a category — rename, change icon, activate/deactivate.
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Patch(':id')
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const res = await this.categoryService.updateCategory(id, dto);
    await this.cacheManager.del('categories:tree');
    return res;
  }

  /**
   * DELETE /categories/:id
   * Delete a category — only if no subcategories exist under it.
   * Admin or Subadmin with manage_catalog permission only.
   * Side effect: also deletes the attribute template if this was a subcategory.
   */
  @Delete(':id')
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async deleteCategory(@Param('id') id: string) {
    const res = await this.categoryService.deleteCategory(id);
    await this.cacheManager.del('categories:tree');
    return res;
  }

  /**
   * POST /categories/:subcategoryId/attributes
   * Create or replace the entire attribute template for a subcategory.
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Post(':subcategoryId/attributes')
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async createAttributeTemplate(
    @Param('subcategoryId') subcategoryId: string,
    @Body() dto: CreateAttributeTemplateDto,
  ) {
    return this.categoryService.createOrReplaceAttributeTemplate(subcategoryId, dto);
  }

  /**
   * PATCH /categories/:subcategoryId/attributes
   * Add, remove, or edit individual fields in an existing attribute template.
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Patch(':subcategoryId/attributes')
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async updateAttributeTemplate(
    @Param('subcategoryId') subcategoryId: string,
    @Body() dto: UpdateAttributeTemplateDto,
  ) {
    return this.categoryService.updateAttributeTemplate(subcategoryId, dto);
  }
}
