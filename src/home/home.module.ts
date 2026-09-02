import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { HomeSection, HomeSectionSchema } from './schemas/home-section.schema';
import { ProductModule } from '../product/product.module';
import { CategoryModule } from '../category/category.module';
import { BannerModule } from '../banner/banner.module';

/**
 * HomeModule — the /home BFF aggregator.
 *
 * Purely a composition layer — no business logic of its own.
 * Imports ProductModule, CategoryModule, and BannerModule, then its HomeService
 * calls their exported services in parallel (Promise.all) to assemble the homepage.
 *
 * This is why there's no separate "Carousel module": a carousel is just
 * ProductService.getProducts() called with a tag filter, invoked from inside HomeService.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HomeSection.name, schema: HomeSectionSchema },
    ]),
    ProductModule,
    CategoryModule,
    BannerModule,
  ],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
