import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { Category, CategorySchema } from './schemas/category.schema';
import { AttributeTemplate, AttributeTemplateSchema } from './schemas/attribute-template.schema';
import { Seller, SellerSchema } from '../auth/schemas/seller.schema';

/**
 * CategoryModule — standalone module for the category tree + attribute templates.
 *
 * Kept separate from ProductModule because categories get reused in multiple places:
 *   - Home page category tabs
 *   - Seller's upload form (dynamic attribute rendering)
 *   - Filter panel
 *   - Future search/browse modules
 *
 * Exports CategoryService so other modules can import CategoryModule and use it.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: AttributeTemplate.name, schema: AttributeTemplateSchema },
      { name: Seller.name, schema: SellerSchema },
    ]),
  ],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
