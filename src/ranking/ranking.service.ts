import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Seller, SellerDocument } from '../auth/schemas/seller.schema';
import { Transaction, TransactionDocument } from '../payment/schemas/transaction.schema';
import { Review, ReviewDocument } from '../review/schemas/review.schema';
import { Category, CategoryDocument } from '../category/schemas/category.schema';

/**
 * RankingService — shop ranking algorithm engine (§7).
 *
 * Scoring formula:
 *   rankingScore = (normalizedAvgRating × 0.35)
 *                + (normalizedReviewCount × 0.15)
 *                + (normalizedOnlineTxnVolume × 0.50)
 *
 * Key design decisions:
 *   - 50% weight on transaction volume is intentional — online payment volume
 *     is the single biggest lever. This directly counters cash-side-dealing.
 *   - Uses 30-day rolling window (not lifetime) for transaction volume,
 *     so sellers who move customers to cash recently will see rank drop.
 *   - Review count is log-scaled to prevent dominance by review-farming.
 *   - Recomputed as a background job, NOT on every request.
 *   - Cached on seller document for cheap, fast reads.
 */
@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  // Scoring weights (§7.1)
  private readonly WEIGHT_RATING = 0.35;
  private readonly WEIGHT_REVIEWS = 0.15;
  private readonly WEIGHT_TXN_VOLUME = 0.50;

  constructor(
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  /**
   * Recomputes ranking scores for ALL sellers.
   *
   * Called by:
   *   - Scheduled cron job (every few hours or nightly)
   *   - Admin manual trigger (POST /admin/ranking/recompute)
   *
   * Steps:
   *   1. Compute 30-day transaction volumes per seller
   *   2. Get review counts per seller
   *   3. Find max values for normalization
   *   4. Calculate normalized scores and update seller documents
   */
  async recomputeAllRankings(): Promise<{
    sellersProcessed: number;
    duration: number;
  }> {
    const startTime = Date.now();
    this.logger.log('=== Starting ranking recomputation ===');

    // 1. Get all approved sellers
    const sellers = await this.sellerModel.find({ verificationStatus: 'approved' });
    if (sellers.length === 0) {
      this.logger.log('No approved sellers found — skipping');
      return { sellersProcessed: 0, duration: 0 };
    }

    // 2. Compute 30-day rolling transaction volume per seller
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const txnVolumes = await this.transactionModel.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          paidAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: '$sellerId',
          txnCount: { $sum: 1 },
          txnVolume: { $sum: '$totalAmount' },
        },
      },
    ]);

    const txnVolumeMap = new Map<string, { count: number; volume: number }>();
    for (const item of txnVolumes) {
      txnVolumeMap.set(item._id.toString(), {
        count: item.txnCount,
        volume: item.txnVolume,
      });
    }

    // 3. Find max values for normalization (log-scaled)
    let maxReviewCount = 0;
    let maxTxnCount = 0;

    for (const seller of sellers) {
      if (seller.reviewCount > maxReviewCount) maxReviewCount = seller.reviewCount;
      const txnData = txnVolumeMap.get(seller._id.toString());
      if (txnData && txnData.count > maxTxnCount) maxTxnCount = txnData.count;
    }

    // Prevent division by zero
    const logMaxReview = Math.log(1 + maxReviewCount) || 1;
    const logMaxTxn = Math.log(1 + maxTxnCount) || 1;

    // 4. Calculate and update each seller's ranking score
    const bulkOps = sellers.map((seller) => {
      const txnData = txnVolumeMap.get(seller._id.toString());
      const txnCount = txnData?.count || 0;

      // §7.1 — Normalized values
      const normalizedAvgRating = seller.avgRating / 5; // Scale 1-5 to 0-1
      const normalizedReviewCount =
        maxReviewCount > 0
          ? Math.log(1 + seller.reviewCount) / logMaxReview
          : 0;
      const normalizedTxnVolume =
        maxTxnCount > 0
          ? Math.log(1 + txnCount) / logMaxTxn
          : 0;

      // Weighted score
      const rankingScore =
        normalizedAvgRating * this.WEIGHT_RATING +
        normalizedReviewCount * this.WEIGHT_REVIEWS +
        normalizedTxnVolume * this.WEIGHT_TXN_VOLUME;

      return {
        updateOne: {
          filter: { _id: seller._id },
          update: {
            rankingScore: Math.round(rankingScore * 10000) / 10000, // 4 decimal places
            onlineTxnVolume30d: txnCount,
          },
        },
      };
    });

    if (bulkOps.length > 0) {
      await this.sellerModel.bulkWrite(bulkOps);
    }

    const duration = Date.now() - startTime;
    this.logger.log(`=== Ranking recomputation complete: ${sellers.length} sellers in ${duration}ms ===`);

    return { sellersProcessed: sellers.length, duration };
  }

  /**
   * Gets sellers sorted by ranking score.
   * Public endpoint — feeds the shop-list screen.
   */
  async getRankedSellers(
    page: number = 1,
    limit: number = 20,
    lat?: number,
    lng?: number,
    category?: string,
    search?: string,
  ): Promise<any> {
    const query: any = { verificationStatus: 'approved' };

    // 'premium' is a virtual keyword — it means "top-ranked sellers", not a literal category.
    const isPremiumRequest = category?.toLowerCase() === 'premium';

    if (category && !isPremiumRequest && category.toLowerCase() !== 'all' && category.toLowerCase() !== 'all categories') {
      const categoriesArray = category.split(',').map((c) => c.trim().toLowerCase());
      query.categories = { $in: categoriesArray };
    }

    if (search && search.trim() !== '') {
      const searchClean = search.trim();
      const searchRegex = new RegExp(searchClean, 'i');
      query.$or = [
        { shopName: { $regex: searchRegex } },
        { ownerName: { $regex: searchRegex } },
        { categories: { $in: [searchClean.toLowerCase()] } },
      ];
    }

    let allSellers: any[] = await this.sellerModel
      .find(query)
      .select(
        'shopName ownerName shopLogoUrl shopBannerUrl shopAddress categories avgRating reviewCount rankingScore onlineTxnVolume30d offerTags discountPercent minPrice maxPrice productTypes isOpenNow openingHours operatingHoursSchedule shopDescription',
      )
      .lean();

    // Fallback: if category filter returned zero sellers, fetch ALL approved sellers
    if (allSellers.length === 0 && (category || search)) {
      this.logger.warn(
        `getRankedSellers: 0 sellers matched filters (category="${category}", search="${search}") — using fallback (all approved sellers)`,
      );
      allSellers = await this.sellerModel
        .find({ verificationStatus: 'approved' })
        .select(
          'shopName ownerName shopLogoUrl shopBannerUrl shopAddress categories avgRating reviewCount rankingScore onlineTxnVolume30d offerTags discountPercent minPrice maxPrice productTypes isOpenNow openingHours operatingHoursSchedule shopDescription',
        )
        .lean();
    }

    let sortedSellers: any[] = [...allSellers];

    if (lat !== undefined && lng !== undefined) {
      // Calculate distances for each seller
      sortedSellers = allSellers.map((seller) => {
        let distance = null;
        if (seller.shopAddress?.lat !== undefined && seller.shopAddress?.lng !== undefined) {
          distance = this.getHaversineDistance(
            Number(lat),
            Number(lng),
            Number(seller.shopAddress.lat),
            Number(seller.shopAddress.lng),
          );
        }
        return {
          ...seller,
          distance: distance !== null ? Math.round(distance * 10) / 10 : null, // 1 decimal place
        };
      });

      if (isPremiumRequest) {
        // Premium: sort by rankingScore descending first, then distance ascending as tiebreaker
        sortedSellers.sort((a, b) => {
          const rankDiff = (b.rankingScore || 0) - (a.rankingScore || 0);
          if (rankDiff !== 0) return rankDiff;
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
      } else {
        // Normal: sort by distance (nearest first). Sellers without coordinates go to the end.
        sortedSellers.sort((a, b) => {
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
      }
    } else {
      // Sort by rankingScore descending (default behavior)
      sortedSellers.sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
    }

    // Paginate in memory
    const total = sortedSellers.length;
    const startIndex = (page - 1) * limit;
    const paginatedSellers = sortedSellers.slice(startIndex, startIndex + limit);

    // Enrich sellers with clean subcategory names
    const enrichedSellers = await this.enrichSellersWithSubcategoryNames(paginatedSellers);

    return {
      sellers: enrichedSellers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      userLocation: lat !== undefined && lng !== undefined ? { lat, lng } : null,
    };
  }

  private getHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Gets details of a single seller by ID.
   * Excludes sensitive fields.
   */
  async getSellerById(sellerId: string): Promise<any> {
    if (!Types.ObjectId.isValid(sellerId)) {
      throw new NotFoundException('Invalid seller ID format');
    }
    const seller = await this.sellerModel
      .findOne({ _id: new Types.ObjectId(sellerId), verificationStatus: 'approved' })
      .select(
        'shopName ownerName shopLogoUrl shopBannerUrl shopAddress categories avgRating reviewCount rankingScore onlineTxnVolume30d offerTags discountPercent shopCoverUrl shopImages shopVideos stories productTypes phone minPrice maxPrice isOpenNow openingHours operatingHoursSchedule shopDescription',
      );
    
    if (!seller) {
      throw new NotFoundException('Seller not found or not approved');
    }
    return seller;
  }



  /**
   * Root category slugs — these are main categories, NOT subcategories.
   * Used to filter them out when building the subcategoryNames list.
   */
  private static readonly ROOT_CATEGORY_SLUGS = new Set([
    'all', 'men', 'women', 'kids', 'unisex', 'all categories',
  ]);

  /**
   * Enriches seller objects with a `subcategoryNames` field containing
   * human-readable subcategory names (e.g. "Casual", "Traditional").
   *
   * How it works:
   *   1. Collects all unique category slugs from all sellers
   *   2. Filters out root category slugs (men, women, kids, etc.)
   *   3. Batch-fetches matching Category documents from DB (single query)
   *   4. Maps slug → name for each seller
   *
   * This avoids N+1 queries — one DB call serves all sellers in the page.
   */
  private async enrichSellersWithSubcategoryNames(sellers: any[]): Promise<any[]> {
    // 1. Collect all unique non-root slugs across all sellers
    const allSlugs = new Set<string>();
    for (const seller of sellers) {
      if (!seller.categories) continue;
      for (const slug of seller.categories) {
        const lower = slug.toLowerCase();
        if (!RankingService.ROOT_CATEGORY_SLUGS.has(lower)) {
          allSlugs.add(lower);
        }
      }
    }

    if (allSlugs.size === 0) {
      return sellers.map((s) => ({ ...s, subcategoryNames: [] }));
    }

    // 2. Batch-fetch Category documents for all subcategory slugs (single DB query)
    const categories = await this.categoryModel
      .find({ slug: { $in: Array.from(allSlugs) } })
      .select('slug name')
      .lean();

    // 3. Build slug → name lookup map
    const slugToName = new Map<string, string>();
    for (const cat of categories) {
      slugToName.set(cat.slug.toLowerCase(), cat.name);
    }

    // 4. Enrich each seller with deduplicated subcategory names
    return sellers.map((seller) => {
      const seenNames = new Set<string>();
      const subcategoryNames: string[] = [];

      if (seller.categories) {
        for (const slug of seller.categories) {
          const lower = slug.toLowerCase();
          if (RankingService.ROOT_CATEGORY_SLUGS.has(lower)) continue;

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
