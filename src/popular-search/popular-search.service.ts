import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PopularSearch, PopularSearchDocument } from './schemas/popular-search.schema';
import { Category, CategoryDocument } from '../category/schemas/category.schema';
import { CreatePopularSearchDto } from './dto/create-popular-search.dto';
import { UpdatePopularSearchDto } from './dto/update-popular-search.dto';

@Injectable()
export class PopularSearchService {
  constructor(
    @InjectModel(PopularSearch.name)
    private readonly popularSearchModel: Model<PopularSearchDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  /**
   * Public API: Returns top 10 dynamic trending keywords for the mobile app.
   * Uses an industry-standard 7-day rolling window with dynamic DB fallbacks.
   *
   * Priority Order:
   * 1. Admin Pinned Keywords (isPinned: true)
   * 2. Top Searched Keywords within recent 7-day window
   * 3. All-Time Top Searched Keywords (if 7-day window has < 10)
   * 4. Admin Database Fallbacks (isFallback: true)
   * 5. Active Category Names from Category Collection in MongoDB
   */
  async getPopularSearches(daysWindow: number = 7): Promise<string[]> {
    const resultKeywords: string[] = [];
    const usedIds: string[] = [];

    // 1. Fetch Pinned Keywords set by Admin
    const pinned = await this.popularSearchModel
      .find({ isBlocked: false, isPinned: true })
      .sort({ priority: -1, searchCount: -1 })
      .limit(10)
      .exec();

    pinned.forEach((item) => {
      resultKeywords.push(item.keyword);
      usedIds.push(item._id.toString());
    });

    // 2. Fetch Top Keywords searched within recent 7-day window
    if (resultKeywords.length < 10) {
      const remaining = 10 - resultKeywords.length;
      const windowStartDate = new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000);

      const recent7Days = await this.popularSearchModel
        .find({
          isBlocked: false,
          isPinned: false,
          isFallback: false,
          _id: { $nin: usedIds },
          lastSearchedAt: { $gte: windowStartDate },
        })
        .sort({ searchCount: -1 })
        .limit(remaining)
        .exec();

      recent7Days.forEach((item) => {
        resultKeywords.push(item.keyword);
        usedIds.push(item._id.toString());
      });
    }

    // 3. Fallback to All-Time Top Searched Keywords
    if (resultKeywords.length < 10) {
      const remaining = 10 - resultKeywords.length;

      const allTime = await this.popularSearchModel
        .find({
          isBlocked: false,
          isPinned: false,
          isFallback: false,
          _id: { $nin: usedIds },
        })
        .sort({ searchCount: -1 })
        .limit(remaining)
        .exec();

      allTime.forEach((item) => {
        resultKeywords.push(item.keyword);
        usedIds.push(item._id.toString());
      });
    }

    // 4. Fallback to Admin-configured Fallback Keywords (isFallback: true in DB)
    if (resultKeywords.length < 10) {
      const remaining = 10 - resultKeywords.length;

      const dbFallbacks = await this.popularSearchModel
        .find({
          isBlocked: false,
          isFallback: true,
          _id: { $nin: usedIds },
        })
        .sort({ priority: -1, searchCount: -1 })
        .limit(remaining)
        .exec();

      dbFallbacks.forEach((item) => {
        resultKeywords.push(item.keyword);
        usedIds.push(item._id.toString());
      });
    }

    // 5. Dynamic Fallback: Fetch Category Names directly from Category collection in DB
    if (resultKeywords.length < 10) {
      const remaining = 10 - resultKeywords.length;

      const categories = await this.categoryModel
        .find({ isActive: true })
        .select('name')
        .limit(remaining)
        .exec();

      categories.forEach((cat) => {
        if (!resultKeywords.includes(cat.name)) {
          resultKeywords.push(cat.name);
        }
      });
    }

    return resultKeywords.slice(0, 10);
  }

  /**
   * Public API: Automatically tracks search queries executed in mobile app.
   */
  async trackSearchKeyword(rawKeyword: string): Promise<void> {
    if (!rawKeyword || typeof rawKeyword !== 'string') return;
    const trimmed = rawKeyword.trim();
    if (trimmed.length < 2) return;

    const normalizedKeyword = trimmed.toLowerCase();

    await this.popularSearchModel.findOneAndUpdate(
      { normalizedKeyword },
      {
        $setOnInsert: { keyword: trimmed, isPinned: false, isFallback: false, isBlocked: false },
        $inc: { searchCount: 1 },
        $set: { lastSearchedAt: new Date() },
      },
      { upsert: true, new: true },
    );
  }

  /**
   * Admin API: Get all keywords for Admin Panel dashboard.
   */
  async getAllForAdmin(): Promise<PopularSearch[]> {
    return this.popularSearchModel
      .find()
      .sort({ isPinned: -1, isFallback: -1, searchCount: -1, updatedAt: -1 })
      .exec();
  }

  /**
   * Admin API: Add a new custom keyword manually (pinned, fallback, or standard).
   */
  async createAdminKeyword(dto: CreatePopularSearchDto): Promise<PopularSearch> {
    const trimmed = dto.keyword.trim();
    const normalizedKeyword = trimmed.toLowerCase();

    const existing = await this.popularSearchModel.findOne({ normalizedKeyword });
    if (existing) {
      if (dto.isPinned !== undefined) existing.isPinned = dto.isPinned;
      if (dto.isFallback !== undefined) existing.isFallback = dto.isFallback;
      if (dto.priority !== undefined) existing.priority = dto.priority;
      existing.isBlocked = false;
      return existing.save();
    }

    return this.popularSearchModel.create({
      keyword: trimmed,
      normalizedKeyword,
      searchCount: 1,
      isPinned: dto.isPinned ?? false,
      isFallback: dto.isFallback ?? false,
      isBlocked: false,
      priority: dto.priority ?? 0,
      lastSearchedAt: new Date(),
    });
  }

  /**
   * Admin API: Toggle pinned/fallback/blocked status or update keyword.
   */
  async updateAdminKeyword(id: string, dto: UpdatePopularSearchDto): Promise<PopularSearch> {
    const keyword = await this.popularSearchModel.findById(id);
    if (!keyword) {
      throw new NotFoundException('Search keyword not found');
    }

    if (dto.keyword !== undefined) {
      keyword.keyword = dto.keyword.trim();
      keyword.normalizedKeyword = dto.keyword.trim().toLowerCase();
    }
    if (dto.isPinned !== undefined) keyword.isPinned = dto.isPinned;
    if (dto.isFallback !== undefined) keyword.isFallback = dto.isFallback;
    if (dto.isBlocked !== undefined) keyword.isBlocked = dto.isBlocked;
    if (dto.priority !== undefined) keyword.priority = dto.priority;

    return keyword.save();
  }

  /**
   * Admin API: Delete a search keyword entry.
   */
  async deleteAdminKeyword(id: string): Promise<void> {
    const result = await this.popularSearchModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Search keyword not found');
    }
  }
}
