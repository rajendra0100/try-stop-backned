import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BannerController } from './banner.controller';
import { BannerService } from './banner.service';
import { Banner, BannerSchema } from './schemas/banner.schema';
import { Seller, SellerSchema } from '../auth/schemas/seller.schema';
import { PlatformConfig, PlatformConfigSchema } from '../payment/schemas/platform-config.schema';
import { Category, CategorySchema } from '../category/schemas/category.schema';

/**
 * BannerModule — manages promotional banners.
 * Exports BannerService for use by HomeModule.
 * Imports Seller model for seller-targeting queries on banner tap.
 * Imports PlatformConfig model for admin-configurable limits (banner_top_sellers_limit, banner_max_distance_km).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Banner.name, schema: BannerSchema },
      { name: Seller.name, schema: SellerSchema },
      { name: PlatformConfig.name, schema: PlatformConfigSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [BannerController],
  providers: [BannerService],
  exports: [BannerService],
})
export class BannerModule {}
