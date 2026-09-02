import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HomeSection, HomeSectionDocument } from './schemas/home-section.schema';
import { ProductService } from '../product/product.service';
import { CategoryService } from '../category/category.service';
import { BannerService } from '../banner/banner.service';

/**
 * HomeService — BFF (Backend For Frontend) aggregator for the homepage.
 *
 * This is purely a composition layer — no business logic of its own.
 * It reads home_sections config from DB, then calls into ProductService,
 * CategoryService, and BannerService in parallel (Promise.all) to assemble
 * the full homepage response.
 *
 * Every section includes a `style` key so the frontend knows which registered
 * layout component to render — this is what lets marketing swap content
 * without any app store release.
 *
 * There is no separate "Carousel module" — a carousel is just
 * ProductService.getProducts() called with a tag filter, invoked from here.
 */
@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  constructor(
    @InjectModel(HomeSection.name)
    private readonly homeSectionModel: Model<HomeSectionDocument>,
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
    private readonly bannerService: BannerService,
  ) {}

  /**
   * Build the full homepage response — server-driven UI.
   *
   * 1. Reads active home_sections from DB (ordered by `order` field)
   * 2. For each section, fetches the appropriate data in parallel:
   *    - banner_carousel → BannerService.getActiveBanners()
   *    - category_grid → CategoryService.getCategoryTree()
   *    - product_carousel → ProductService.getProductsByFilter(section.filter)
   *    - deal_strip → ProductService.getProductsByFilter(section.filter)
   * 3. Returns the assembled sections with `style` key for frontend rendering
   *
   * Caching note: this response should be cached in Redis with a short TTL (~30-60s).
   * The cache key is simply "home:response". Invalidation happens on section/banner updates.
   */
  async getHomePage(): Promise<any[]> {
    // Fetch active sections from DB, sorted by display order
    const sections = await this.homeSectionModel
      .find({ isActive: true })
      .sort({ order: 1 })
      .lean();

    if (sections.length === 0) {
      this.logger.warn('No active home sections found in DB — returning empty homepage');
      return [];
    }

    // Resolve all sections in parallel for maximum speed
    const resolvedSections = await Promise.all(
      sections.map((section) => this.resolveSection(section)),
    );

    // Filter out any sections that failed to resolve (e.g. empty product carousels)
    return resolvedSections.filter((s) => s !== null);
  }

  /**
   * Resolve a single home section — fetch the appropriate data based on type.
   * Returns null if the section has no data (e.g. empty product carousel).
   */
  private async resolveSection(section: HomeSectionDocument): Promise<any | null> {
    const base = {
      _id: section._id,
      type: section.type,
      title: section.title,
      style: section.style,
      order: section.order,
    };

    try {
      switch (section.type) {
        case 'banner_carousel': {
          const banners = await this.bannerService.getActiveBanners('home');
          if (banners.length === 0) return null;
          return { ...base, data: banners };
        }

        case 'category_grid': {
          const categories = await this.categoryService.getCategoryTree();
          return { ...base, data: categories };
        }

        case 'product_carousel':
        case 'deal_strip': {
          if (!section.filter) {
            // No filter = fetch recent live products
            const products = await this.productService.getProductsByFilter({}, 20);
            if (products.length === 0) return null;
            return { ...base, data: products };
          }

          const products = await this.productService.getProductsByFilter(
            section.filter,
            20,
          );
          if (products.length === 0) return null;
          return { ...base, data: products };
        }

        default:
          this.logger.warn(`Unknown home section type: ${section.type}`);
          return null;
      }
    } catch (error) {
      // Don't let one failed section crash the entire homepage
      this.logger.error(
        `Failed to resolve home section "${section.title}" (${section.type}): ${error.message}`,
      );
      return null;
    }
  }

  // ─── Admin CRUD for home_sections ──────────────────────────────────────────

  /** Get all home sections (including inactive) for admin management */
  async getAllSections(): Promise<HomeSectionDocument[]> {
    return this.homeSectionModel.find().sort({ order: 1 }).lean();
  }

  async createSection(dto: any): Promise<HomeSectionDocument> {
    const section = await this.homeSectionModel.create(dto);
    this.logger.log(`Home section created: ${dto.title ?? dto.type}`);
    return section;
  }

  async updateSection(id: string, dto: any): Promise<HomeSectionDocument> {
    const section = await this.homeSectionModel.findByIdAndUpdate(id, dto, {
      new: true,
    });
    if (!section) throw new Error('Home section not found');
    this.logger.log(`Home section updated: ${section.title ?? section.type}`);
    return section;
  }

  async deleteSection(id: string): Promise<{ message: string }> {
    const section = await this.homeSectionModel.findByIdAndDelete(id);
    if (!section) throw new Error('Home section not found');
    this.logger.log(`Home section deleted: ${section.title ?? section.type}`);
    return { message: 'Home section deleted' };
  }
}
