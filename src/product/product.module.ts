import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Product, ProductSchema } from './schemas/product.schema';
import { CategoryModule } from '../category/category.module';

/**
 * ProductModule — handles product CRUD, ownership, approval, tags.
 *
 * Imports CategoryModule to validate categoryId/subcategoryId on product creation.
 * Exports ProductService so HomeModule can call it for carousel sections.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
    ]),
    CategoryModule, // Needed to validate category/subcategory on product create
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
