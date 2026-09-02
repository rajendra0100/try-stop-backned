import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FilterController } from './filter.controller';
import { FilterService } from './filter.service';
import { FilterOption, FilterOptionSchema } from './schemas/filter-option.schema';

/**
 * FilterModule — standalone module for global filter options.
 *
 * Unlike CategoryModule, nothing else in the backend needs to call into FilterService —
 * the frontend calls GET /filters directly to build the filter panel.
 * Kept standalone for clean separation of concerns.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FilterOption.name, schema: FilterOptionSchema },
    ]),
  ],
  controllers: [FilterController],
  providers: [FilterService],
  exports: [FilterService],
})
export class FilterModule {}
