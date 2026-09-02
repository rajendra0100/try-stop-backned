import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { Throttle } from '@nestjs/throttler';
import { FilterService } from './filter.service';
import { CreateFilterOptionDto, UpdateFilterOptionDto } from './dto/filter-option.dto';
import { RequirePermission } from '../common/guards/permission.guard';

/**
 * FilterController — manages global filter options for the product browsing UI.
 *
 * GET is PUBLIC (no auth) — drives the filter panel for guest users.
 * Write endpoints require admin/subadmin with manage_catalog permission.
 */
@Controller('filters')
export class FilterController {
  constructor(private readonly filterService: FilterService) {}

  /**
   * GET /filters?category=tshirts
   * Returns the relevant filter set for a category/subcategory.
   * Each filter includes a `widget` key so the frontend knows which component to render.
   * PUBLIC — no auth required.
   * Cached in Redis for 60 seconds — filter options change infrequently.
   */
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60000) // 60 seconds
  async getFilters(@Query('category') category?: string) {
    return this.filterService.getFilters(category);
  }

  /**
   * POST /filters
   * Create a new filter option group (e.g. add "fit" as a new filter).
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Post()
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async createFilter(@Body() dto: CreateFilterOptionDto) {
    return this.filterService.createFilter(dto);
  }

  /**
   * PATCH /filters/:id
   * Update a filter option group — add/remove/edit values (e.g. add color "Maroon").
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Patch(':id')
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async updateFilter(
    @Param('id') id: string,
    @Body() dto: UpdateFilterOptionDto,
  ) {
    return this.filterService.updateFilter(id, dto);
  }

  /**
   * DELETE /filters/:id
   * Delete a filter option group entirely.
   * Admin or Subadmin with manage_catalog permission only.
   */
  @Delete(':id')
  @RequirePermission('manage_catalog')
  @Throttle({ product_write: { ttl: 60000, limit: 30 } })
  async deleteFilter(@Param('id') id: string) {
    return this.filterService.deleteFilter(id);
  }
}
