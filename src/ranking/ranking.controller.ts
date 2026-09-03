import {
  Controller, Post, Get, Query, UseGuards, Param,
} from '@nestjs/common';
import { RankingService } from './ranking.service';
import { RequirePermission } from '../common/guards/permission.guard';

/**
 * RankingController — shop ranking endpoints.
 *
 * Route access summary:
 *   GET  /sellers/ranked              — public — sellers sorted by rankingScore
 *   POST /admin/ranking/recompute     — admin — manual recompute trigger
 */
@Controller()
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  /**
   * GET /sellers/ranked
   * Returns sellers sorted by ranking score (highest first).
   * Feeds the shop-listing screen in the app.
   * PUBLIC — no auth required.
   */
  @Get('sellers/ranked')
  async getRankedSellers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('lat') lat?: number,
    @Query('lng') lng?: number,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? parseInt(page as any, 10) : 1;
    const limitNum = limit ? parseInt(limit as any, 10) : 20;
    return this.rankingService.getRankedSellers(
      pageNum,
      limitNum,
      lat,
      lng,
      category,
      search,
    );
  }

  /**
   * GET /sellers/:id
   * Returns details of a single seller by ID (excluding sensitive fields).
   * PUBLIC — no auth required.
   */
  @Get('sellers/:id')
  async getSellerById(@Param('id') id: string) {
    return this.rankingService.getSellerById(id);
  }

  /**
   * GET /sellers/:id/gallery
   * Returns paginated gallery images for a single seller.
   * PUBLIC — no auth required.
   */
  @Get('sellers/:id/gallery')
  async getSellerGallery(
    @Param('id') id: string,
    @Query('page') page?: string | number,
    @Query('limit') limit?: string | number,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page.toString(), 10) || 1) : 1;
    const limitNum = limit ? Math.max(1, Math.min(50, parseInt(limit.toString(), 10) || 15)) : 15;
    return this.rankingService.getSellerGallery(id, pageNum, limitNum);
  }

  /**
   * POST /admin/ranking/recompute
   * Manually triggers a full ranking recomputation.
   * In addition to the automated cron job running every 4 hours.
   * AUTH required — admin only.
   */
  @Post('admin/ranking/recompute')
  @RequirePermission('manage_settings')
  async recomputeRankings() {
    return this.rankingService.recomputeAllRankings();
  }
}
