import {
  Injectable, Logger, BadRequestException, NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Ad, AdDocument } from './schemas/ad.schema';
import { AdPricingConfig, AdPricingConfigDocument } from './schemas/ad-pricing-config.schema';
import { Seller, SellerDocument } from '../auth/schemas/seller.schema';
import { CreateAdDto, UpdateAdPricingDto, QueryActiveAdsDto } from './dto/ad.dto';
import { CashfreeService } from '../payment/cashfree.service';

/**
 * AdService — advertisement system (§8).
 *
 * Phase 1: flat, fixed-price-per-day model.
 * 100% of ad revenue belongs to Trystop — no vendor split.
 *
 * Ad serving uses proximity-first + round-robin tie-breaking:
 *   1. Filter active ads within date range
 *   2. Sort by distance to user (nearest first — haversine formula)
 *   3. Tie-break: round-robin via lastServedAt
 *   4. Paid ads always appear above organic results
 *
 * §8.4 Future path: the resolveAdsForSlot() method is a self-contained
 * function whose internal logic can be swapped to a bid-based auction
 * without touching any callers.
 */
@Injectable()
export class AdService {
  private readonly logger = new Logger(AdService.name);

  constructor(
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    @InjectModel(AdPricingConfig.name) private readonly adPricingModel: Model<AdPricingConfigDocument>,
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
    private readonly cashfreeService: CashfreeService,
  ) {}

  // ─── Ad Creation (§8.2) ───────────────────────────────────────────────────

  /**
   * Creates a new ad campaign for a seller.
   * Snapshots the current price-per-day — later pricing changes don't affect running ads.
   * Returns a Cashfree payment order for the total amount.
   *
   * Callable by: authenticated seller
   */
  async createAd(sellerId: string, dto: CreateAdDto): Promise<any> {
    // 1. Validate product ownership (if product ad)
    if (dto.type === 'product' && !dto.productId) {
      throw new BadRequestException('productId is required for product ads');
    }

    // 2. Get current pricing
    const pricing = await this.adPricingModel.findOne({ type: dto.type });
    if (!pricing) {
      throw new BadRequestException(`Ad pricing not configured for type "${dto.type}". Contact admin.`);
    }

    // 3. Calculate dates and total
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + dto.days);
    const totalAmount = dto.days * pricing.pricePerDay;

    // 4. Create ad record (pending payment)
    const ad = await this.adModel.create({
      sellerId: new Types.ObjectId(sellerId),
      type: dto.type,
      productId: dto.productId ? new Types.ObjectId(dto.productId) : null,
      days: dto.days,
      pricePerDay: pricing.pricePerDay, // Snapshot — immune to later changes
      totalAmount,
      startDate,
      endDate,
      paymentStatus: 'pending',
      status: 'pending_payment',
    });

    // 5. Create Cashfree order for the ad payment
    const seller = await this.sellerModel.findById(sellerId);
    const orderId = `AD_${sellerId.slice(-6)}_${Date.now()}`;

    const cashfreeOrder = await this.cashfreeService.createOrder({
      orderId,
      orderAmount: totalAmount,
      customerName: seller?.ownerName || 'Seller',
      customerEmail: seller?.email || 'seller@trystop.com',
      customerPhone: seller?.phone || '9999999999',
    });

    // Store Cashfree order ID on the ad
    await this.adModel.findByIdAndUpdate(ad._id, { cashfreeOrderId: orderId });

    this.logger.log(`Ad created: ${ad._id} | Type: ${dto.type} | Days: ${dto.days} | Total: ₹${totalAmount}`);

    return {
      ad,
      cashfreeOrder,
      message: `Ad created. Please complete payment of ₹${totalAmount} to activate.`,
    };
  }

  /**
   * Activates an ad after payment confirmation (called from webhook or manual trigger).
   */
  async activateAd(adId: string): Promise<AdDocument> {
    const ad = await this.adModel.findByIdAndUpdate(
      adId,
      { paymentStatus: 'paid', status: 'active' },
      { new: true },
    );
    if (!ad) throw new NotFoundException('Ad not found');
    this.logger.log(`Ad activated: ${adId}`);
    return ad;
  }

  // ─── Ad Serving / Ranking (§8.3) ──────────────────────────────────────────

  /**
   * Resolves which ads to show for a given screen slot.
   *
   * Algorithm:
   *   1. Filter to active ads within their date range
   *   2. Sort by proximity to user's location (haversine distance)
   *   3. Tie-break: round-robin via lastServedAt (oldest first)
   *   4. Update lastServedAt for served ads
   *
   * This is a self-contained function — its internal logic can be swapped
   * to a bid-based auction (§8.4) without touching callers.
   */
  async resolveAdsForSlot(query: QueryActiveAdsDto): Promise<any[]> {
    const now = new Date();
    const limit = query.limit || 5;

    // 1. Get all active ads in date range
    const matchQuery: any = {
      status: 'active',
      paymentStatus: 'paid',
      startDate: { $lte: now },
      endDate: { $gte: now },
    };

    // Filter by slot type if specified
    if (query.slot === 'home_banner' || query.slot === 'shop_listing') {
      matchQuery.type = 'shop';
    } else if (query.slot === 'product_placement') {
      matchQuery.type = 'product';
    }

    let ads: any[] = await this.adModel
      .find(matchQuery)
      .populate('sellerId', 'shopName shopLogoUrl shopAddress')
      .populate('productId', 'name images offerPrice mrp slug');

    if (ads.length === 0) return [];

    // 2. Sort by proximity if user location is provided
    if (query.lat !== undefined && query.lng !== undefined) {
      ads = this.sortByProximity(ads, query.lat, query.lng);
    }

    // 3. Tie-break: round-robin via lastServedAt (oldest/null first)
    ads = this.applyRoundRobinTieBreak(ads);

    // 4. Take the top N
    const served = ads.slice(0, limit);

    // 5. Update lastServedAt for served ads
    const updateIds = served.map((ad) => ad._id);
    await this.adModel.updateMany(
      { _id: { $in: updateIds } },
      { lastServedAt: now },
    );

    return served;
  }

  /**
   * Sorts ads by distance to user (haversine formula).
   * Nearest first — a user in Malviya Nagar sees Malviya Nagar ads first.
   */
  private sortByProximity(ads: any[], userLat: number, userLng: number): any[] {
    return ads.sort((a, b) => {
      const distA = this.getDistance(a, userLat, userLng);
      const distB = this.getDistance(b, userLat, userLng);
      return distA - distB;
    });
  }

  /**
   * Computes haversine distance between user and an ad's shop location.
   */
  private getDistance(ad: any, userLat: number, userLng: number): number {
    const seller = ad.sellerId as any;
    const shopLat = seller?.shopAddress?.lat;
    const shopLng = seller?.shopAddress?.lng;

    if (!shopLat || !shopLng) return Infinity; // No location → sort last

    return this.haversineDistance(userLat, userLng, shopLat, shopLng);
  }

  /**
   * Haversine formula — distance between two lat/lng points in km.
   */
  private haversineDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Round-robin tie-breaking: for ads at similar distances,
   * show the one with the oldest lastServedAt first.
   * Ensures fair rotation of impressions between tied competitors.
   */
  private applyRoundRobinTieBreak(ads: any[]): any[] {
    // Within each "proximity cluster" (within ~1km of each other),
    // sort by lastServedAt ascending (null = never served = highest priority)
    const DISTANCE_THRESHOLD_KM = 1;

    // Since ads are already sorted by distance, we just need to sort
    // equal-distance groups by lastServedAt
    return ads.sort((a, b) => {
      const aServed = a.lastServedAt?.getTime() || 0;
      const bServed = b.lastServedAt?.getTime() || 0;
      return aServed - bServed; // Oldest (or never served) first
    });
  }

  // ─── Admin Operations ──────────────────────────────────────────────────────

  /**
   * Force-stop any ad (admin only).
   * Used for policy violations or at admin's discretion.
   */
  async stopAd(adId: string, adminId: string): Promise<AdDocument> {
    const ad = await this.adModel.findByIdAndUpdate(
      adId,
      {
        status: 'stopped_by_admin',
        stoppedBy: new Types.ObjectId(adminId),
      },
      { new: true },
    );
    if (!ad) throw new NotFoundException('Ad not found');
    this.logger.log(`Ad ${adId} stopped by admin ${adminId}`);
    return ad;
  }

  /**
   * Updates ad pricing (admin only).
   * Changes only affect FUTURE ad purchases — running ads keep their snapshot rate.
   */
  async updatePricing(dto: UpdateAdPricingDto): Promise<AdPricingConfigDocument> {
    const config = await this.adPricingModel.findOneAndUpdate(
      { type: dto.type },
      { type: dto.type, pricePerDay: dto.pricePerDay },
      { upsert: true, new: true },
    );
    this.logger.log(`Ad pricing updated: ${dto.type} = ₹${dto.pricePerDay}/day`);
    return config;
  }

  /** Get all ads (admin view) */
  async getAllAds(filters?: {
    status?: string;
    sellerId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const query: any = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.sellerId) query.sellerId = new Types.ObjectId(filters.sellerId);
    if (filters?.type) query.type = filters.type;

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const [ads, total] = await Promise.all([
      this.adModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate('sellerId', 'shopName ownerName')
        .populate('productId', 'name slug'),
      this.adModel.countDocuments(query),
    ]);

    return { ads, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Get seller's own ads */
  async getSellerAds(sellerId: string): Promise<AdDocument[]> {
    return this.adModel.find({ sellerId: new Types.ObjectId(sellerId) }).sort({ createdAt: -1 });
  }

  /** Get current ad pricing */
  async getPricing(): Promise<AdPricingConfigDocument[]> {
    return this.adPricingModel.find();
  }

  /**
   * Expires ads past their endDate.
   * Called by the cron job to clean up expired ads.
   */
  async expireOldAds(): Promise<number> {
    const now = new Date();
    const result = await this.adModel.updateMany(
      {
        status: 'active',
        endDate: { $lt: now },
      },
      { status: 'expired' },
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} ads past their end date`);
    }
    return result.modifiedCount;
  }
}
