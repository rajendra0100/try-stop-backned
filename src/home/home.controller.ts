import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL, CacheKey } from '@nestjs/cache-manager';
import { Throttle } from '@nestjs/throttler';
import { HomeService } from './home.service';
import { CreateHomeSectionDto, UpdateHomeSectionDto } from './dto/home-section.dto';
import { RequirePermission } from '../common/guards/permission.guard';

/**
 * HomeController — the /home BFF endpoint and admin management for home sections.
 *
 * GET /home is PUBLIC — the homepage is the first thing guests see, no login required.
 * Write endpoints for home sections are admin-only (manage_catalog permission).
 */
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  /**
   * GET /home
   * Returns the fully assembled homepage — server-driven UI sections.
   * Each section includes a `style` key so the frontend knows which component to render.
   * PUBLIC — no auth required. This is the app's entry point for all users.
   *
   * Cached in Redis for 30 seconds — this is the highest-traffic endpoint.
   * Cache is automatically invalidated after TTL expires.
   */
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey('home:page')
  @CacheTTL(30000) // 30 seconds
  async getHomePage() {
    return this.homeService.getHomePage();
  }

  // ─── Admin management of home sections ─────────────────────────────────────

  /**
   * GET /home/sections
   * Get all home sections (including inactive) for admin panel management.
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Get('sections')
  @RequirePermission('manage_catalog')
  async getAllSections() {
    return this.homeService.getAllSections();
  }

  /**
   * POST /home/sections
   * Create a new home section.
   * Adding a section using an existing `style` requires NO app build.
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Post('sections')
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async createSection(@Body() dto: CreateHomeSectionDto) {
    return this.homeService.createSection(dto);
  }

  /**
   * PATCH /home/sections/:id
   * Update a home section — change filter, title, order, style, or active status.
   * No app build needed for any of these changes.
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Patch('sections/:id')
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async updateSection(
    @Param('id') id: string,
    @Body() dto: UpdateHomeSectionDto,
  ) {
    return this.homeService.updateSection(id, dto);
  }

  /**
   * DELETE /home/sections/:id
   * Delete a home section.
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Delete('sections/:id')
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async deleteSection(@Param('id') id: string) {
    return this.homeService.deleteSection(id);
  }
}
