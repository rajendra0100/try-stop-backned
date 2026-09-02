import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CashbackConfig, CashbackConfigDocument } from './schemas/cashback-config.schema';
import { Coupon, CouponDocument } from './schemas/coupon.schema';
import { CouponUsage, CouponUsageDocument } from './schemas/coupon-usage.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { PlatformConfig, PlatformConfigDocument } from '../payment/schemas/platform-config.schema';
import { Transaction, TransactionDocument } from '../payment/schemas/transaction.schema';
import { SetCashbackRateDto, CreateCouponDto, SetWalletCapDto } from './dto/offer.dto';

/**
 * OfferService — manages cashback rates, coupons, and wallet cap settings.
 *
 * Cashback resolution: user-specific > global fallback.
 * Wallet cap resolution: user-specific > global fallback.
 * Nothing hardcoded — all values admin-configurable.
 *
 * Callable by:
 *   - PaymentService (resolves effective rates)
 *   - Admin (manages rates, coupons, wallet caps)
 */
@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  constructor(
    @InjectModel(CashbackConfig.name) private readonly cashbackConfigModel: Model<CashbackConfigDocument>,
    @InjectModel(Coupon.name) private readonly couponModel: Model<CouponDocument>,
    @InjectModel(CouponUsage.name) private readonly couponUsageModel: Model<CouponUsageDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(PlatformConfig.name) private readonly platformConfigModel: Model<PlatformConfigDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  // ─── Cashback Rate Management (§4) ──────────────────────────────────────────

  /**
   * Helper to evaluate custom/slab rates on a config document.
   */
  private async evaluateCashbackRate(
    config: CashbackConfig,
    userId: string,
    amount?: number,
  ): Promise<number> {
    // 1. Determine if this is the user's first order
    const orderCount = await this.transactionModel.countDocuments({
      customerId: new Types.ObjectId(userId),
      paymentStatus: 'paid',
    });

    // 2. First-order rate takes absolute precedence (bypasses slabs)
    if (orderCount === 0 && config.firstOrderRate !== null && config.firstOrderRate !== undefined) {
      return config.firstOrderRate;
    }

    // 3. Check slabs (applies to subsequent orders, or first orders if no firstOrderRate is configured)
    if (amount !== undefined && config.slabs && config.slabs.length > 0) {
      const sortedSlabs = [...config.slabs].sort((a, b) => a.maxAmount - b.maxAmount);
      for (const slab of sortedSlabs) {
        if (amount <= slab.maxAmount) {
          return slab.cashbackRate;
        }
      }
      return sortedSlabs[sortedSlabs.length - 1].cashbackRate;
    }

    // 4. If no slabs apply/exist, check subsequent order rate
    if (orderCount > 0 && config.subsequentRate !== null && config.subsequentRate !== undefined) {
      return config.subsequentRate;
    }

    // 5. Fallback to flat cashbackRate
    return config.cashbackRate;
  }

  /**
   * Resolves the effective cashback rate for a user.
   * Priority: active user-specific config > active global config > 0.
   *
   * Used internally by PaymentService during order creation.
   */
  async resolveEffectiveCashbackRate(userId: string, amount?: number): Promise<number> {
    const now = new Date();

    // 1. Check for active user-specific config
    const userConfig = await this.cashbackConfigModel.findOne({
      scope: 'user',
      userId: new Types.ObjectId(userId),
      isActive: true,
      validFrom: { $lte: now },
      $or: [{ validTill: null }, { validTill: { $gte: now } }],
    }).sort({ validFrom: -1 });

    if (userConfig) {
      return this.evaluateCashbackRate(userConfig, userId, amount);
    }

    // 2. Fallback to global config
    const globalConfig = await this.cashbackConfigModel.findOne({
      scope: 'global',
      isActive: true,
      validFrom: { $lte: now },
      $or: [{ validTill: null }, { validTill: { $gte: now } }],
    }).sort({ validFrom: -1 });

    if (globalConfig) {
      return this.evaluateCashbackRate(globalConfig, userId, amount);
    }

    return 0;
  }

  /**
   * Sets a cashback rate (global or per-user).
   * Admin-only endpoint.
   */
  async setCashbackRate(dto: SetCashbackRateDto): Promise<CashbackConfigDocument> {
    if (dto.scope === 'user' && !dto.userId) {
      throw new BadRequestException('userId is required when scope is "user"');
    }

    const config = await this.cashbackConfigModel.create({
      scope: dto.scope,
      userId: dto.userId ? new Types.ObjectId(dto.userId) : null,
      cashbackRate: dto.cashbackRate,
      firstOrderRate: dto.firstOrderRate !== undefined ? dto.firstOrderRate : null,
      subsequentRate: dto.subsequentRate !== undefined ? dto.subsequentRate : null,
      slabs: dto.slabs || [],
      validFrom: new Date(dto.validFrom),
      validTill: dto.validTill ? new Date(dto.validTill) : null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    this.logger.log(`Cashback rate set: ${dto.cashbackRate} (${dto.scope}${dto.userId ? ` for user ${dto.userId}` : ''})`);
    return config;
  }

  /**
   * Gets the effective cashback rate for a user (resolves user-specific vs global).
   * Used by both internal flow and admin dashboard.
   */
  async getCashbackRateForUser(userId: string, amount?: number): Promise<{
    effectiveRate: number;
    source: 'user' | 'global' | 'default';
  }> {
    const now = new Date();

    const userConfig = await this.cashbackConfigModel.findOne({
      scope: 'user',
      userId: new Types.ObjectId(userId),
      isActive: true,
      validFrom: { $lte: now },
      $or: [{ validTill: null }, { validTill: { $gte: now } }],
    }).sort({ validFrom: -1 });

    if (userConfig) {
      const rate = await this.evaluateCashbackRate(userConfig, userId, amount);
      return { effectiveRate: rate, source: 'user' };
    }

    const globalConfig = await this.cashbackConfigModel.findOne({
      scope: 'global',
      isActive: true,
      validFrom: { $lte: now },
      $or: [{ validTill: null }, { validTill: { $gte: now } }],
    }).sort({ validFrom: -1 });

    if (globalConfig) {
      const rate = await this.evaluateCashbackRate(globalConfig, userId, amount);
      return { effectiveRate: rate, source: 'global' };
    }

    return { effectiveRate: 0, source: 'default' };
  }

  // ─── Coupon Management (§4.2) ───────────────────────────────────────────────

  /**
   * Creates a new coupon. Admin-only.
   */
  async createCoupon(dto: CreateCouponDto): Promise<CouponDocument> {
    const existing = await this.couponModel.findOne({ code: dto.code.toUpperCase() });
    if (existing) throw new BadRequestException(`Coupon code "${dto.code}" already exists`);

    return this.couponModel.create({
      code: dto.code.toUpperCase(),
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      minOrderValue: dto.minOrderValue || 0,
      maxDiscountAmount: dto.maxDiscountAmount || null,
      validFrom: new Date(dto.validFrom),
      validTill: new Date(dto.validTill),
      usageLimit: dto.usageLimit || null,
      perUserLimit: dto.perUserLimit || 1,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });
  }

  /**
   * Validates a coupon and returns the discount amount.
   * Checks: active, not expired, usage limits not exceeded, min order value met.
   *
   * Returns the computed discount amount (capped if percent with maxDiscountAmount).
   */
  async validateCoupon(
    code: string,
    orderAmount: number,
    userId: string,
  ): Promise<{ valid: boolean; discountAmount: number; coupon: CouponDocument }> {
    const coupon = await this.couponModel.findOne({ code: code.toUpperCase() });
    if (!coupon) throw new NotFoundException('Coupon not found');

    if (!coupon.isActive) throw new BadRequestException('Coupon is not active');

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validTill) {
      throw new BadRequestException('Coupon has expired or is not yet valid');
    }

    if (orderAmount < coupon.minOrderValue) {
      throw new BadRequestException(`Minimum order value of ₹${coupon.minOrderValue} required`);
    }

    // Check total usage limit
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    // Check per-user usage limit
    const userUsage = await this.couponUsageModel.findOne({
      userId: new Types.ObjectId(userId),
      couponId: coupon._id,
    });
    if (userUsage && userUsage.usageCount >= coupon.perUserLimit) {
      throw new BadRequestException('You have already used this coupon the maximum number of times');
    }

    // Calculate discount
    let discountAmount: number;
    if (coupon.discountType === 'flat') {
      discountAmount = coupon.discountValue;
    } else {
      discountAmount = Math.round((orderAmount * coupon.discountValue / 100) * 100) / 100;
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    }

    // Don't let discount exceed order amount
    if (discountAmount > orderAmount) {
      discountAmount = orderAmount;
    }

    return { valid: true, discountAmount, coupon };
  }

  /**
   * Records a coupon usage after successful payment.
   * Called from the payment events queue processor.
   */
  async recordCouponUsage(couponCode: string, userId: string): Promise<void> {
    const coupon = await this.couponModel.findOne({ code: couponCode.toUpperCase() });
    if (!coupon) return;

    // Increment global usage count
    await this.couponModel.findByIdAndUpdate(coupon._id, { $inc: { usageCount: 1 } });

    // Increment per-user usage count (upsert)
    await this.couponUsageModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), couponId: coupon._id },
      { $inc: { usageCount: 1 } },
      { upsert: true },
    );
  }

  /**
   * Validates a coupon code for the public endpoint (without consuming it).
   */
  async validateCouponPublic(code: string, orderAmount: number, userId: string): Promise<any> {
    const result = await this.validateCoupon(code, orderAmount, userId);
    return {
      valid: result.valid,
      discountAmount: result.discountAmount,
      discountType: result.coupon.discountType,
      discountValue: result.coupon.discountValue,
    };
  }

  // ─── Wallet Cap Management (§4.1) ──────────────────────────────────────────

  /**
   * Sets the wallet usage cap globally or for a specific user.
   * Admin-only endpoint.
   */
  async setWalletCap(dto: SetWalletCapDto): Promise<any> {
    if (dto.target === 'global') {
      // Update global cap in platform_config
      const config = await this.platformConfigModel.findOneAndUpdate(
        { key: 'wallet_usage_cap' },
        { key: 'wallet_usage_cap', value: dto.walletUsageCap, description: 'Global wallet usage cap (e.g. 0.75 = 75%)' },
        { upsert: true, new: true },
      );
      this.logger.log(`Global wallet cap set to ${dto.walletUsageCap}`);
      return { target: 'global', walletUsageCap: dto.walletUsageCap, config };
    }

    if (!dto.userId) throw new BadRequestException('userId is required when target is "user"');

    // Set per-user cap
    const user = await this.userModel.findByIdAndUpdate(
      dto.userId,
      { walletUsageCap: dto.walletUsageCap },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');

    this.logger.log(`Wallet cap set to ${dto.walletUsageCap} for user ${dto.userId}`);
    return { target: 'user', userId: dto.userId, walletUsageCap: dto.walletUsageCap };
  }

  /**
   * Resolves the effective wallet cap for a user.
   * User-specific > global fallback > default 0.75.
   */
  async resolveWalletCap(userId: string): Promise<{
    effectiveCap: number;
    source: 'user' | 'global' | 'default';
  }> {
    const user = await this.userModel.findById(userId).select('walletUsageCap');
    if (user?.walletUsageCap !== null && user?.walletUsageCap !== undefined) {
      return { effectiveCap: user.walletUsageCap, source: 'user' };
    }

    const globalCap = await this.platformConfigModel.findOne({ key: 'wallet_usage_cap' });
    if (globalCap) {
      return { effectiveCap: globalCap.value, source: 'global' };
    }

    return { effectiveCap: 0.75, source: 'default' };
  }

  // ─── Admin Query Helpers ──────────────────────────────────────────────────

  /** List all cashback configs (for admin dashboard) */
  async listCashbackConfigs(): Promise<CashbackConfigDocument[]> {
    return this.cashbackConfigModel.find().populate('userId', 'name email').sort({ createdAt: -1 });
  }

  /** List all coupons (for admin dashboard) */

  /**
   * Retrieves the current active global cashback/discount configuration.
   */
  async getGlobalCashbackConfig(): Promise<CashbackConfigDocument | null> {
    return this.cashbackConfigModel.findOne({ scope: "global", isActive: true }).sort({ validFrom: -1 });
  }

  /**
   * Sets or updates the active global cashback/discount configuration.
   */
  async setGlobalCashbackConfig(dto: {
    firstOrderRate?: number;
    subsequentRate?: number;
    cashbackRate?: number;
    slabs?: { maxAmount: number; cashbackRate: number }[];
  }): Promise<CashbackConfigDocument> {
    const existing = await this.cashbackConfigModel.findOne({ scope: "global", isActive: true });
    if (existing) {
      if (dto.firstOrderRate !== undefined) existing.firstOrderRate = dto.firstOrderRate;
      if (dto.subsequentRate !== undefined) existing.subsequentRate = dto.subsequentRate;
      if (dto.cashbackRate !== undefined) existing.cashbackRate = dto.cashbackRate;
      if (dto.slabs !== undefined) existing.slabs = dto.slabs as any;
      return existing.save();
    }

    return this.cashbackConfigModel.create({
      scope: "global",
      userId: null,
      cashbackRate: dto.cashbackRate !== undefined ? dto.cashbackRate : 0.10,
      firstOrderRate: dto.firstOrderRate !== undefined ? dto.firstOrderRate : 0.15,
      subsequentRate: dto.subsequentRate !== undefined ? dto.subsequentRate : 0.08,
      slabs: dto.slabs || [],
      validFrom: new Date(),
      isActive: true,
    });
  }

  async listCoupons(): Promise<CouponDocument[]> {
    return this.couponModel.find().sort({ createdAt: -1 });
  }
}
