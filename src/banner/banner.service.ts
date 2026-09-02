import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Banner, BannerDocument } from './schemas/banner.schema';
import { Seller, SellerDocument } from '../auth/schemas/seller.schema';
import { PlatformConfig, PlatformConfigDocument } from '../payment/schemas/platform-config.schema';
import { Category, CategoryDocument } from '../category/schemas/category.schema';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';

/**
 * BannerService — manages promotional banners for the homepage.
 * Exported for use by HomeModule.
 *
 * Also handles seller-targeting queries: when a user taps a banner,
 * this service finds matching sellers and sorts them by proximity.
 */
@Injectable()
export class BannerService {
  private readonly logger = new Logger(BannerService.name);

  constructor(
    @InjectModel(Banner.name) private readonly bannerModel: Model<BannerDocument>,
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(PlatformConfig.name) private readonly platformConfigModel: Model<PlatformConfigDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  /**
   * Get all active banners, ordered for the carousel.
   * Also filters by date range if startsAt/endsAt are set (time-limited campaigns).
   */
  async getActiveBanners(slot?: string): Promise<BannerDocument[]> {
    const now = new Date();
    const query: any = {
      isActive: true,
      $or: [
        { startsAt: { $exists: false } },
        { startsAt: null },
        { startsAt: { $lte: now } },
      ],
      $and: [
        {
          $or: [
            { endsAt: { $exists: false } },
            { endsAt: null },
            { endsAt: { $gte: now } },
          ],
        },
      ],
    };
    if (slot) {
      query.slot = slot;
    }
    return this.bannerModel.find(query).sort({ order: 1 }).lean();
  }

  // ─── Banner CRUD ──────────────────────────────────────────────────────────

  async createBanner(dto: CreateBannerDto): Promise<BannerDocument> {
    const data = { ...dto };
    if (dto.position !== undefined && dto.order === undefined) {
      data.order = dto.position;
    }
    const banner = await this.bannerModel.create(data);
    this.logger.log(`Banner created: ${dto.title}`);
    return banner;
  }

  async updateBanner(id: string, dto: UpdateBannerDto): Promise<BannerDocument> {
    const data = { ...dto };
    if (dto.position !== undefined && dto.order === undefined) {
      data.order = dto.position;
    }
    const banner = await this.bannerModel.findByIdAndUpdate(id, data, { new: true });
    if (!banner) throw new NotFoundException('Banner not found');
    this.logger.log(`Banner updated: ${banner.title}`);
    return banner;
  }

  async deleteBanner(id: string): Promise<{ message: string }> {
    const banner = await this.bannerModel.findByIdAndDelete(id);
    if (!banner) throw new NotFoundException('Banner not found');
    this.logger.log(`Banner deleted: ${banner.title}`);
    return { message: `Banner '${banner.title}' deleted` };
  }

  // ─── Seller Targeting ──────────────────────────────────────────────────────

  /**
   * Get sellers matching a banner's target filter, sorted by distance from user.
   *
   * Flow:
   * 1. Fetch the banner by ID and read its targetFilter
   * 2. Build a MongoDB query on the Seller collection
   * 3. Compute Haversine distance from user coordinates
   * 4. Sort by distance ascending (nearest first)
   *
   * @param bannerId - The banner document ID
   * @param userLat - User's latitude
   * @param userLng - User's longitude
   * @returns Sellers with distance info, sorted by ranking then distance, within 5km, capped by config limit
   */
  async getSellersByBanner(
    bannerId: string,
    userLat: number,
    userLng: number,
  ): Promise<any[]> {
    // 1. Fetch the banner
    const banner = await this.bannerModel.findById(bannerId).lean();
    if (!banner) throw new NotFoundException('Banner not found');

    // 2. Read the configurable limit from platform config (admin can set via POST /admin/config)
    //    Key: 'banner_top_sellers_limit', default: 10
    const limitConfig = await this.platformConfigModel?.findOne({ key: 'banner_top_sellers_limit' });
    const maxResults = limitConfig ? limitConfig.value : 10;

    // 3. Read the max distance radius from platform config
    //    Key: 'banner_max_distance_km', default: 5
    const distanceConfig = await this.platformConfigModel?.findOne({ key: 'banner_max_distance_km' });
    const maxDistanceKm = distanceConfig ? distanceConfig.value : 5;

    // 4. Build the seller query from the banner's targetFilter
    const query: any = {
      verificationStatus: 'approved',
      'shopAddress.lat': { $exists: true, $ne: null },
      'shopAddress.lng': { $exists: true, $ne: null },
    };

    // If targetType is not 'seller_list', skip filter logic and return all nearby sellers
    const filter = banner.targetType === 'seller_list' ? banner.targetFilter : null;
    if (banner.targetType !== 'seller_list') {
      this.logger.log(
        `Banner "${banner.title}" has targetType="${banner.targetType}" — returning top nearby ranked sellers`,
      );
    }
    if (filter) {
      if (filter.categories && filter.categories.length > 0) {
        const targetCats = filter.categories
          .map((cat: string) => cat.toLowerCase().trim())
          .filter(Boolean);
        query.categories = { $in: targetCats };
      }

      // Filter by offer tag
      if (filter.offerTag) {
        query.offerTags = filter.offerTag;
      }

      // Filter by minimum discount
      if (filter.minDiscount && filter.minDiscount > 0) {
        query.discountPercent = { $gte: filter.minDiscount };
      }

      // Override verification status if explicitly set in filter
      if (filter.verificationStatus) {
        query.verificationStatus = filter.verificationStatus;
      }
    }

    // 5. Fetch matching sellers
    const sellers = await this.sellerModel
      .find(query)
      .select(
        'shopName ownerName shopLogoUrl shopBannerUrl shopAddress categories avgRating reviewCount rankingScore onlineTxnVolume30d offerTags discountPercent isOpenNow openingHours operatingHoursSchedule',
      )
      .lean();

    // 6. Compute distance for all matching sellers
    const allSellersWithDistance = sellers
      .map((seller) => {
        const lat = seller.shopAddress?.lat;
        const lng = seller.shopAddress?.lng;
        if (!lat || !lng) return null;

        const distance = this.haversineDistance(userLat, userLng, lat, lng);
        return {
          _id: seller._id,
          shopName: seller.shopName,
          ownerName: seller.ownerName,
          shopLogoUrl: seller.shopLogoUrl,
          shopBannerUrl: seller.shopBannerUrl,
          shopAddress: seller.shopAddress,
          categories: seller.categories,
          avgRating: seller.avgRating,
          reviewCount: seller.reviewCount,
          rankingScore: seller.rankingScore,
          onlineTxnVolume30d: seller.onlineTxnVolume30d,
          offerTags: seller.offerTags,
          discountPercent: seller.discountPercent,
          isOpenNow: seller.isOpenNow,
          openingHours: seller.openingHours,
          operatingHoursSchedule: seller.operatingHoursSchedule,
          distanceKm: Math.round(distance * 10) / 10, // Round to 1 decimal
        };
      })
      .filter((s) => s !== null);

    // 7. Primary: sellers within max distance radius
    const nearbySellers = allSellersWithDistance
      .filter((s) => s.distanceKm <= maxDistanceKm)
      .sort((a, b) => {
        const rankDiff = (b.rankingScore || 0) - (a.rankingScore || 0);
        return rankDiff !== 0 ? rankDiff : a.distanceKm - b.distanceKm;
      })
      .slice(0, maxResults);

    // 8. Fallback: if no sellers found within distance, return top-ranked sellers regardless of distance
    let finalSellers = nearbySellers;
    if (finalSellers.length === 0 && allSellersWithDistance.length > 0) {
      this.logger.warn(
        `Banner "${banner.title}": no sellers within ${maxDistanceKm}km — using fallback (top-ranked sellers regardless of distance)`,
      );
      finalSellers = allSellersWithDistance
        .sort((a, b) => {
          const rankDiff = (b.rankingScore || 0) - (a.rankingScore || 0);
          return rankDiff !== 0 ? rankDiff : a.distanceKm - b.distanceKm;
        })
        .slice(0, maxResults);
    }

    // Enrich sellers with clean subcategory names
    const enrichedSellers = await this.enrichSellersWithSubcategoryNames(finalSellers);

    this.logger.log(
      `Banner "${banner.title}": found ${enrichedSellers.length} sellers (limit=${maxResults}, maxDist=${maxDistanceKm}km, fallback=${finalSellers !== nearbySellers}) for user at (${userLat}, ${userLng})`,
    );

    return enrichedSellers;
  }

  /**
   * Haversine formula — calculates distance between two lat/lng points in kilometers.
   */
  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Root category slugs — excluded from subcategory name resolution.
   */
  private static readonly ROOT_CATEGORY_SLUGS = new Set([
    'all', 'men', 'women', 'kids', 'unisex', 'all categories',
  ]);

  /**
   * Enriches seller objects with `subcategoryNames` — clean, human-readable
   * subcategory names resolved from slugs via the Category collection.
   * Uses a single batch DB query for all sellers.
   */
  private async enrichSellersWithSubcategoryNames(sellers: any[]): Promise<any[]> {
    const allSlugs = new Set<string>();
    for (const seller of sellers) {
      if (!seller.categories) continue;
      for (const slug of seller.categories) {
        const lower = slug.toLowerCase();
        if (!BannerService.ROOT_CATEGORY_SLUGS.has(lower)) {
          allSlugs.add(lower);
        }
      }
    }

    if (allSlugs.size === 0) {
      return sellers.map((s) => ({ ...s, subcategoryNames: [] }));
    }

    const categories = await this.categoryModel
      .find({ slug: { $in: Array.from(allSlugs) } })
      .select('slug name')
      .lean();

    const slugToName = new Map<string, string>();
    for (const cat of categories) {
      slugToName.set(cat.slug.toLowerCase(), cat.name);
    }

    return sellers.map((seller) => {
      const seenNames = new Set<string>();
      const subcategoryNames: string[] = [];

      if (seller.categories) {
        for (const slug of seller.categories) {
          const lower = slug.toLowerCase();
          if (BannerService.ROOT_CATEGORY_SLUGS.has(lower)) continue;

          const name = slugToName.get(lower);
          if (name && !seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            subcategoryNames.push(name);
          }
        }
      }

      return { ...seller, subcategoryNames };
    });
  }
}
