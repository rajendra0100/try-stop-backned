import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PopularSearch, PopularSearchSchema } from './schemas/popular-search.schema';
import { Category, CategorySchema } from '../category/schemas/category.schema';
import { PopularSearchService } from './popular-search.service';
import { PopularSearchController } from './popular-search.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PopularSearch.name, schema: PopularSearchSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [PopularSearchController],
  providers: [PopularSearchService],
  exports: [PopularSearchService, MongooseModule],
})
export class PopularSearchModule {}
