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
    page: number = 1,
    limit?: number,
  ): Promise<any> {
    // 1. Fetch the banner
    const banner = await this.bannerModel.findById(bannerId).lean();
    if (!banner) throw new NotFoundException('Banner not found');

    // 2. Read the configurable limit from platform config (safe default: 10)
    const limitConfig = await this.platformConfigModel?.findOne({ key: 'banner_top_sellers_limit' });
    const defaultLimit = limitConfig && Number(limitConfig.value) > 0 ? Number(limitConfig.value) : 10;
    const effectiveLimit = limit && limit > 0 ? limit : defaultLimit;

    // 3. Read the max distance radius from platform config (safe default: 5km)
    const distanceConfig = await this.platformConfigModel?.findOne({ key: 'banner_max_distance_km' });
    const maxDistanceKm = distanceConfig && Number(distanceConfig.value) > 0 ? Number(distanceConfig.value) : 5;

    // 4. Build the seller query from the banner's targetFilter
    const query: any = { verificationStatus: 'approved' };

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

      if (filter.offerTag) {
        query.offerTags = filter.offerTag;
      }

      if (filter.minDiscount && filter.minDiscount > 0) {
        query.discountPercent = { $gte: filter.minDiscount };
      }

      if (filter.verificationStatus) {
        query.verificationStatus = filter.verificationStatus;
      }
    }

    // 5. Fetch matching sellers
    let sellers = await this.sellerModel
      .find(query)
      .select(
        'shopName ownerName shopLogoUrl shopBannerUrl shopAddress categories avgRating reviewCount rankingScore onlineTxnVolume30d offerTags discountPercent minPrice maxPrice productTypes isOpenNow openingHours operatingHoursSchedule shopDescription',
      )
      .lean();

    // Fallback A: If specific targetFilter matched 0 sellers, fetch all approved sellers
    if (sellers.length === 0 && filter) {
      this.logger.warn(
        `Banner "${banner.title}": 0 sellers matched targetFilter — using fallback (all approved sellers)`,
      );
      sellers = await this.sellerModel
        .find({ verificationStatus: 'approved' })
        .select(
          'shopName ownerName shopLogoUrl shopBannerUrl shopAddress categories avgRating reviewCount rankingScore onlineTxnVolume30d offerTags discountPercent minPrice maxPrice productTypes isOpenNow openingHours operatingHoursSchedule shopDescription',
        )
        .lean();
    }

    // 6. Compute distance for all matching sellers
    const allSellersWithDistance = sellers.map((seller) => {
      const lat = seller.shopAddress?.lat;
      const lng = seller.shopAddress?.lng;
      const hasCoords =
        lat !== undefined &&
        lat !== null &&
        lng !== undefined &&
        lng !== null &&
        userLat !== undefined &&
        userLng !== undefined &&
        userLat !== 0 &&
        userLng !== 0;
      const distance = hasCoords
        ? this.haversineDistance(userLat, userLng, Number(lat), Number(lng))
        : null;

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
        minPrice: seller.minPrice,
        maxPrice: seller.maxPrice,
        productTypes: seller.productTypes,
        isOpenNow: seller.isOpenNow,
        openingHours: seller.openingHours,
        operatingHoursSchedule: seller.operatingHoursSchedule,
        shopDescription: seller.shopDescription,
        distanceKm: distance !== null ? Math.round(distance * 10) / 10 : null,
      };
    });

    // ─── 3-TIER LAYERED FALLBACK STRATEGY ───

    // Tier 1: Immediate Neighborhood (<= maxDistanceKm, e.g. 5km)
    // Sorted by top ranking score first, with distance as tiebreaker
    const tier1Nearby = allSellersWithDistance
      .filter((s) => s.distanceKm !== null && s.distanceKm <= maxDistanceKm)
      .sort((a, b) => {
        const rankDiff = (b.rankingScore || 0) - (a.rankingScore || 0);
        return rankDiff !== 0 ? rankDiff : ((a.distanceKm || 0) - (b.distanceKm || 0));
      });

    let candidateSellers: any[] = [];
    let strategyUsed = 'Tier 1 (Within ' + maxDistanceKm + 'km)';

    if (tier1Nearby.length > 0) {
      candidateSellers = tier1Nearby;
    } else {
      // Tier 2: Mid-Range City Fallback (<= 100km)
      // If user is slightly farther away, prioritize nearest within city + high ranking
      const tier2MidRange = allSellersWithDistance
        .filter((s) => s.distanceKm !== null && s.distanceKm <= 100)
        .sort((a, b) => {
          if (a.distanceKm !== b.distanceKm) return (a.distanceKm || 0) - (b.distanceKm || 0);
          return (b.rankingScore || 0) - (a.rankingScore || 0);
        });

      if (tier2MidRange.length > 0) {
        candidateSellers = tier2MidRange;
        strategyUsed = 'Tier 2 (City Radius <= 100km)';
      } else {
        // Tier 3: Global / Out of Region Fallback (> 100km or no coords)
        // Show the platform's Top-Rated Approved Stores (highest ranking score first)
        candidateSellers = allSellersWithDistance
          .sort((a, b) => {
            const rankDiff = (b.rankingScore || 0) - (a.rankingScore || 0);
            if (rankDiff !== 0) return rankDiff;
            if (a.distanceKm === null) return 1;
            if (b.distanceKm === null) return -1;
            return (a.distanceKm || 0) - (b.distanceKm || 0);
          });
        strategyUsed = 'Tier 3 (Top Rated Overall Platform Fallback)';
      }
    }

    // Paginate in memory
    const total = candidateSellers.length;
    const startIndex = (page - 1) * effectiveLimit;
    const paginatedSellers = candidateSellers.slice(startIndex, startIndex + effectiveLimit);

    // Enrich sellers with clean subcategory names
    const enrichedSellers = await this.enrichSellersWithSubcategoryNames(paginatedSellers);

    this.logger.log(
      `Banner "${banner.title}": returning ${enrichedSellers.length}/${total} shops (page ${page}, limit ${effectiveLimit}) via ${strategyUsed} for user at (${userLat}, ${userLng})`,
    );

    return {
      sellers: enrichedSellers,
      total,
      page,
      limit: effectiveLimit,
      totalPages: Math.ceil(total / effectiveLimit),
      hasMore: startIndex + effectiveLimit < total,
    };
  }
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
