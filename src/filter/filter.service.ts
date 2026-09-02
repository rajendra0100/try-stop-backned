import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FilterOption, FilterOptionDocument } from './schemas/filter-option.schema';
import { CreateFilterOptionDto, UpdateFilterOptionDto } from './dto/filter-option.dto';

/**
 * FilterService — manages global filter options (Color, Gender, Size, Fit, Discount).
 *
 * These are universal filters that apply across all products, used for browsing/search.
 * Completely independent from the category attribute template system.
 */
@Injectable()
export class FilterService {
  private readonly logger = new Logger(FilterService.name);

  constructor(
    @InjectModel(FilterOption.name)
    private readonly filterModel: Model<FilterOptionDocument>,
  ) {}

  /**
   * Get all filter options, optionally filtered by category slug.
   * Returns the widget-tagged config that drives the frontend filter panel.
   * If a category is specified, returns only filters applicable to that category
   * (plus any filters with no category restriction, which apply globally).
   */
  async getFilters(category?: string): Promise<FilterOptionDocument[]> {
    const query: any = {};
    if (category) {
      // Return filters that either apply globally (empty applicableCategories)
      // or are specifically applicable to this category
      query.$or = [
        { applicableCategories: { $size: 0 } },
        { applicableCategories: category },
      ];
    }
    return this.filterModel.find(query).lean();
  }

  /** Create a new filter option group (e.g. add "fit") */
  async createFilter(dto: CreateFilterOptionDto): Promise<FilterOptionDocument> {
    const filter = await this.filterModel.create(dto);
    this.logger.log(`Filter created: ${dto.key}`);
    return filter;
  }

  /** Update a filter option group — add/remove/edit values, change widget type */
  async updateFilter(
    id: string,
    dto: UpdateFilterOptionDto,
  ): Promise<FilterOptionDocument> {
    const filter = await this.filterModel.findByIdAndUpdate(id, dto, { new: true });
    if (!filter) throw new NotFoundException('Filter option not found');
    this.logger.log(`Filter updated: ${filter.key}`);
    return filter;
  }

  /** Delete a filter option group */
  async deleteFilter(id: string): Promise<{ message: string }> {
    const filter = await this.filterModel.findByIdAndDelete(id);
    if (!filter) throw new NotFoundException('Filter option not found');
    this.logger.log(`Filter deleted: ${filter.key}`);
    return { message: `Filter '${filter.key}' deleted` };
  }
}
