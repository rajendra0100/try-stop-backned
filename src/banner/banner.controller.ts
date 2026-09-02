import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { BannerService } from './banner.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';
import { RequirePermission } from '../common/guards/permission.guard';

/**
 * BannerController — manages promotional banners.
 * All write routes require admin/subadmin with manage_catalog permission.
 * Banners are consumed by the HomeModule's BFF endpoint.
 *
 * The GET /banners/:id/sellers endpoint is the key BFF route:
 * mobile app calls it when a user taps a banner to get matching sellers
 * sorted by distance from the user.
 */
@Controller('banners')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  /**
   * GET /banners
   * Get all active banners. Primarily called internally by HomeService,
   * but also available as a standalone endpoint for admin panel preview.
   * PUBLIC — no auth, so the admin panel preview doesn't need special handling.
   */
  @Get()
  async getActiveBanners(@Query('slot') slot?: string) {
    return this.bannerService.getActiveBanners(slot);
  }

  /**
   * GET /banners/:id/sellers?lat=26.85&lng=75.78
   * Get sellers matching a banner's target filter, sorted by distance.
   * PUBLIC — called by the mobile app when a user taps a banner.
   *
   * Query params:
   * - lat: User's latitude (required)
   * - lng: User's longitude (required)
   */
  @Get(':id/sellers')
  async getSellersByBanner(
    @Param('id') id: string,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    const userLat = parseFloat(lat) || 0;
    const userLng = parseFloat(lng) || 0;
    return this.bannerService.getSellersByBanner(id, userLat, userLng);
  }

  /**
   * POST /banners
   * Create a new banner. Admin or Subadmin with manage_catalog permission only.
   */
  @Post()
  @RequirePermission('manage_catalog')
  async createBanner(@Body() dto: CreateBannerDto) {
    return this.bannerService.createBanner(dto);
  }

  /**
   * PATCH /banners/:id
   * Update a banner. Admin or Subadmin with manage_catalog permission only.
   */
  @Patch(':id')
  @RequirePermission('manage_catalog')
  async updateBanner(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.bannerService.updateBanner(id, dto);
  }

  /**
   * DELETE /banners/:id
   * Delete a banner. Admin or Subadmin with manage_catalog permission only.
   */
  @Delete(':id')
  @RequirePermission('manage_catalog')
  async deleteBanner(@Param('id') id: string) {
    return this.bannerService.deleteBanner(id);
  }
}
