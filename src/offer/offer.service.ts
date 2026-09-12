import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CashbackConfig, CashbackConfigDocument } from './schemas/cashback-config.schema';
import { Coupon, CouponDocument } from './schemas/coupon.schema';
import { CouponUsage, CouponUsageDocument } from './schemas/coupon-usage.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Seller, SellerDocument } from '../auth/schemas/seller.schema';
import { PlatformConfig, PlatformConfigDocument } from '../payment/schemas/platform-config.schema';
import { Transaction, TransactionDocument } from '../payment/schemas/transaction.schema';
import { SetCashbackRateDto, CreateCouponDto, SellerCreateCouponDto, SetWalletCapDto } from './dto/offer.dto';
import { FcmNotificationService } from '../fcm-notification/fcm-notification.service';

@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  constructor(
    @InjectModel(CashbackConfig.name) private readonly cashbackConfigModel: Model<CashbackConfigDocument>,
    @InjectModel(Coupon.name) private readonly couponModel: Model<CouponDocument>,
    @InjectModel(CouponUsage.name) private readonly couponUsageModel: Model<CouponUsageDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(PlatformConfig.name) private readonly platformConfigModel: Model<PlatformConfigDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    private readonly fcmNotificationService: FcmNotificationService,
  ) {}

  private async evaluateCashbackRate(
    config: CashbackConfig,
    userId: string,
    amount?: number,
  ): Promise<number> {
    const orderCount = await this.transactionModel.countDocuments({
      customerId: new Types.ObjectId(userId),
      paymentStatus: 'paid',
    });

    if (orderCount === 0 && config.firstOrderRate !== null && config.firstOrderRate !== undefined) {
      return config.firstOrderRate;
    }

    if (amount !== undefined && config.slabs && config.slabs.length > 0) {
      const sortedSlabs = [...config.slabs].sort((a, b) => a.maxAmount - b.maxAmount);
      for (const slab of sortedSlabs) {
        if (amount <= slab.maxAmount) {
          return slab.cashbackRate;
        }
      }
      return sortedSlabs[sortedSlabs.length - 1].cashbackRate;
    }

    if (orderCount > 0 && config.subsequentRate !== null && config.subsequentRate !== undefined) {
      return config.subsequentRate;
    }

    return config.cashbackRate;
  }

  async resolveEffectiveCashbackRate(userId: string, amount?: number): Promise<number> {
    const now = new Date();

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

  async createSellerCoupon(sellerId: string, dto: SellerCreateCouponDto): Promise<CouponDocument> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.couponModel.findOne({
      code,
      sellerId: new Types.ObjectId(sellerId),
      isDeleted: false,
    });
    if (existing) {
      throw new BadRequestException(`A coupon with code "${code}" already exists for your store`);
    }

    const discountVal = Number(dto.discountValue);
    if (isNaN(discountVal) || discountVal <= 0) {
      throw new BadRequestException('Discount value must be greater than 0');
    }

    if (dto.discountType === 'percent' && discountVal > 100) {
      throw new BadRequestException('Discount percentage cannot exceed 100%');
    }

    const createdCoupon = await this.couponModel.create({
      sellerId: new Types.ObjectId(sellerId),
      code,
      title: dto.title?.trim() || '',
      description: dto.description?.trim() || '',
      discountType: dto.discountType || 'percent',
      discountValue: discountVal,
      minOrderValue: dto.minOrderValue ? Number(dto.minOrderValue) : 0,
      maxDiscountAmount: dto.maxDiscountAmount ? Number(dto.maxDiscountAmount) : null,
      appliesTo: dto.appliesTo || 'all',
      validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
      validTill: dto.validTill ? new Date(dto.validTill) : null,
      usageLimit: dto.usageLimit ? Number(dto.usageLimit) : null,
      perUserLimit: dto.perUserLimit ? Number(dto.perUserLimit) : 1,
      isActive: true,
      isDeleted: false,
      createdBy: 'seller',
      createdById: new Types.ObjectId(sellerId),
    });

    // Notify connected audience (followers + past shoppers) about the new coupon
    try {
      const sellerObjectId = new Types.ObjectId(sellerId);
      const [seller, followers, pastShoppers] = await Promise.all([
        this.sellerModel.findById(sellerId).select('shopName'),
        this.userModel.find({ favoriteSellers: sellerObjectId }, '_id'),
        this.transactionModel.distinct('customerId', {
          sellerId: sellerObjectId,
          paymentStatus: 'paid',
        }),
      ]);

      const followerIds = followers.map((f) => f._id.toString());
      const shopperIds = pastShoppers.filter((p) => p !== null && p !== undefined).map((p) => p.toString());
      const allUserIds = Array.from(new Set([...followerIds, ...shopperIds]));

      if (allUserIds.length > 0) {
        const shopName = seller?.shopName || 'Store';
        const discountText =
          dto.discountType === 'percent'
            ? `${discountVal}% OFF`
            : `₹${discountVal} OFF`;

        this.fcmNotificationService.sendToUsers(
          allUserIds,
          `New Offer from ${shopName}! 🎁`,
          `Get ${discountText} with code "${code}" at ${shopName}! Valid now.`,
          {
            type: 'seller_coupon',
            screen: 'SHOP_DETAILS',
            sellerId: sellerId,
            sellerName: shopName,
            couponCode: code,
          },
        ).catch((err) => {
          this.logger.warn(`Failed to dispatch coupon push notification: ${err?.message}`);
        });
      }
    } catch (err: any) {
      this.logger.warn(`Error calculating connected audience for coupon: ${err?.message}`);
    }

    return createdCoupon;
  }

  async listSellerCoupons(
    sellerId: string,
    page: number = 1,
    limit: number = 10,
    search: string = '',
    status: string = 'all',
  ): Promise<{
    coupons: CouponDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    const skip = (pageNum - 1) * limitNum;

    const query: any = {
      sellerId: new Types.ObjectId(sellerId),
      isDeleted: false,
    };

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ code: searchRegex }, { title: searchRegex }];
    }

    const [coupons, total] = await Promise.all([
      this.couponModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      this.couponModel.countDocuments(query),
    ]);

    return {
      coupons,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  async toggleCouponStatus(couponId: string, sellerId?: string): Promise<CouponDocument> {
    const query: any = { _id: new Types.ObjectId(couponId), isDeleted: false };
    if (sellerId) {
      query.sellerId = new Types.ObjectId(sellerId);
    }

    const coupon = await this.couponModel.findOne(query);
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();
    return coupon;
  }

  async deleteCoupon(couponId: string, sellerId?: string): Promise<{ success: boolean; message: string }> {
    const query: any = { _id: new Types.ObjectId(couponId), isDeleted: false };
    if (sellerId) {
      query.sellerId = new Types.ObjectId(sellerId);
    }

    const coupon = await this.couponModel.findOne(query);
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    coupon.isDeleted = true;
    coupon.isActive = false;
    await coupon.save();

    return { success: true, message: 'Coupon removed successfully' };
  }

  async adminCreateCoupon(adminId: string, dto: CreateCouponDto): Promise<CouponDocument> {
    const code = dto.code.trim().toUpperCase();
    const query: any = { code, isDeleted: false };
    if (dto.sellerId) {
      query.sellerId = new Types.ObjectId(dto.sellerId);
    }
    const existing = await this.couponModel.findOne(query);
    if (existing) {
      throw new BadRequestException(`Coupon code "${code}" already exists`);
    }

    const discountVal = Number(dto.discountValue);
    if (isNaN(discountVal) || discountVal <= 0) {
      throw new BadRequestException('Discount value must be greater than 0');
    }

    if (dto.discountType === 'percent' && discountVal > 100) {
      throw new BadRequestException('Discount percentage cannot exceed 100%');
    }

    return this.couponModel.create({
      sellerId: dto.sellerId ? new Types.ObjectId(dto.sellerId) : null,
      code,
      title: dto.title?.trim() || '',
      description: dto.description?.trim() || '',
      discountType: dto.discountType || 'percent',
      discountValue: discountVal,
      minOrderValue: dto.minOrderValue ? Number(dto.minOrderValue) : 0,
      maxDiscountAmount: dto.maxDiscountAmount ? Number(dto.maxDiscountAmount) : null,
      appliesTo: dto.appliesTo || 'all',
      validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
      validTill: dto.validTill ? new Date(dto.validTill) : null,
      usageLimit: dto.usageLimit ? Number(dto.usageLimit) : null,
      perUserLimit: dto.perUserLimit ? Number(dto.perUserLimit) : 1,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      isDeleted: false,
      createdBy: 'admin',
      createdById: adminId ? new Types.ObjectId(adminId) : null,
    });
  }

  async adminListCoupons(params: {
    page?: any;
    limit?: any;
    search?: string;
    sellerId?: string;
    status?: string;
    appliesTo?: string;
  }): Promise<{
    coupons: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const pageNum = Math.max(1, Number(params.page) || 1);
    const limitNum = Math.max(1, Number(params.limit) || 10);
    const skip = (pageNum - 1) * limitNum;

    const query: any = { isDeleted: false };

    if (params.sellerId && Types.ObjectId.isValid(params.sellerId)) {
      query.sellerId = new Types.ObjectId(params.sellerId);
    }

    if (params.status === 'active') {
      query.isActive = true;
    } else if (params.status === 'inactive') {
      query.isActive = false;
    }

    if (params.appliesTo && params.appliesTo !== 'all') {
      query.appliesTo = params.appliesTo;
    }

    if (params.search && params.search.trim()) {
      const searchRegex = new RegExp(params.search.trim(), 'i');
      query.$or = [{ code: searchRegex }, { title: searchRegex }];
    }

    const [coupons, total] = await Promise.all([
      this.couponModel
        .find(query)
        .populate('sellerId', 'shopName ownerName phone shopLogoUrl email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      this.couponModel.countDocuments(query),
    ]);

    return {
      coupons,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  async adminGetSellerCoupons(sellerId: string): Promise<CouponDocument[]> {
    return this.couponModel
      .find({ sellerId: new Types.ObjectId(sellerId), isDeleted: false })
      .sort({ createdAt: -1 });
  }

  async createCoupon(dto: CreateCouponDto): Promise<CouponDocument> {
    return this.adminCreateCoupon('', dto);
  }

  async validateCoupon(
    code: string,
    orderAmount: number,
    userId: string,
    sellerId?: string,
  ): Promise<{ valid: boolean; discountAmount: number; coupon: CouponDocument }> {
    const cleanCode = code.trim().toUpperCase();
    const query: any = { code: cleanCode, isDeleted: false };
    if (sellerId && Types.ObjectId.isValid(sellerId)) {
      query.$or = [{ sellerId: new Types.ObjectId(sellerId) }, { sellerId: null }];
    }

    const coupon = await this.couponModel.findOne(query);
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Coupon is currently disabled');
    }

    if (coupon.sellerId && sellerId && coupon.sellerId.toString() !== sellerId.toString()) {
      throw new BadRequestException('This coupon is not valid for this store');
    }

    const now = new Date();
    if ((coupon.validFrom && now < coupon.validFrom) || (coupon.validTill && now > coupon.validTill)) {
      throw new BadRequestException('Coupon has expired or is not yet valid');
    }

    if (orderAmount < coupon.minOrderValue) {
      throw new BadRequestException(`Minimum order value of ₹${coupon.minOrderValue} required`);
    }

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    const userUsage = await this.couponUsageModel.findOne({
      userId: new Types.ObjectId(userId),
      couponId: coupon._id,
    });
    if (userUsage && userUsage.usageCount >= coupon.perUserLimit) {
      throw new BadRequestException('You have already used this coupon the maximum number of times');
    }

    if (coupon.appliesTo === 'first_order' || coupon.appliesTo === 'subsequent_orders') {
      const txQuery: any = { customerId: new Types.ObjectId(userId), paymentStatus: 'paid' };
      if (coupon.sellerId) {
        txQuery.sellerId = coupon.sellerId;
      }
      const txCount = await this.transactionModel.countDocuments(txQuery);
      if (coupon.appliesTo === 'first_order' && txCount > 0) {
        throw new BadRequestException('This coupon is valid only on your first order');
      }
      if (coupon.appliesTo === 'subsequent_orders' && txCount === 0) {
        throw new BadRequestException('This coupon is valid only on repeat orders');
      }
    }

    let discountAmount: number;
    if (coupon.discountType === 'flat') {
      discountAmount = coupon.discountValue;
    } else {
      discountAmount = Math.round(((orderAmount * coupon.discountValue) / 100) * 100) / 100;
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    }

    if (discountAmount > orderAmount) {
      discountAmount = orderAmount;
    }

    return { valid: true, discountAmount, coupon };
  }

  async recordCouponUsage(couponCode: string, userId: string): Promise<void> {
    const coupon = await this.couponModel.findOne({ code: couponCode.trim().toUpperCase() });
    if (!coupon) return;

    await this.couponModel.findByIdAndUpdate(coupon._id, { $inc: { usageCount: 1 } });

    await this.couponUsageModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), couponId: coupon._id },
      { $inc: { usageCount: 1 } },
      { upsert: true },
    );
  }

  async validateCouponPublic(
    code: string,
    orderAmount: number,
    userId: string,
    sellerId?: string,
  ): Promise<any> {
    const result = await this.validateCoupon(code, orderAmount, userId, sellerId);
    return {
      valid: result.valid,
      discountAmount: result.discountAmount,
      discountType: result.coupon.discountType,
      discountValue: result.coupon.discountValue,
      maxDiscountAmount: result.coupon.maxDiscountAmount,
      title: result.coupon.title,
    };
  }

  async setWalletCap(dto: SetWalletCapDto): Promise<any> {
    if (dto.target === 'global') {
      const config = await this.platformConfigModel.findOneAndUpdate(
        { key: 'wallet_usage_cap' },
        { key: 'wallet_usage_cap', value: dto.walletUsageCap, description: 'Global wallet usage cap (e.g. 0.75 = 75%)' },
        { upsert: true, new: true },
      );
      this.logger.log(`Global wallet cap set to ${dto.walletUsageCap}`);
      return { target: 'global', walletUsageCap: dto.walletUsageCap, config };
    }

    if (!dto.userId) throw new BadRequestException('userId is required when target is "user"');

    const user = await this.userModel.findByIdAndUpdate(
      dto.userId,
      { walletUsageCap: dto.walletUsageCap },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');

    this.logger.log(`Wallet cap set to ${dto.walletUsageCap} for user ${dto.userId}`);
    return { target: 'user', userId: dto.userId, walletUsageCap: dto.walletUsageCap };
  }

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

  async listCashbackConfigs(): Promise<CashbackConfigDocument[]> {
    return this.cashbackConfigModel.find().populate('userId', 'name email').sort({ createdAt: -1 });
  }

  async getGlobalCashbackConfig(): Promise<CashbackConfigDocument | null> {
    return this.cashbackConfigModel.findOne({ scope: 'global', isActive: true }).sort({ validFrom: -1 });
  }

  async setGlobalCashbackConfig(dto: {
    firstOrderRate?: number;
    subsequentRate?: number;
    cashbackRate?: number;
    slabs?: { maxAmount: number; cashbackRate: number }[];
  }): Promise<CashbackConfigDocument> {
    const existing = await this.cashbackConfigModel.findOne({ scope: 'global', isActive: true });
    if (existing) {
      if (dto.firstOrderRate !== undefined) existing.firstOrderRate = dto.firstOrderRate;
      if (dto.subsequentRate !== undefined) existing.subsequentRate = dto.subsequentRate;
      if (dto.cashbackRate !== undefined) existing.cashbackRate = dto.cashbackRate;
      if (dto.slabs !== undefined) existing.slabs = dto.slabs as any;
      return existing.save();
    }

    return this.cashbackConfigModel.create({
      scope: 'global',
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
    return this.couponModel.find({ isDeleted: false }).populate('sellerId', 'shopName ownerName phone').sort({ createdAt: -1 });
  }

  async getStoreCouponsForUser(
    sellerId: string,
    userId?: string,
  ): Promise<any[]> {
    if (!sellerId || !Types.ObjectId.isValid(sellerId)) {
      throw new BadRequestException('Valid seller ID is required');
    }

    const now = new Date();
    const query: any = {
      $or: [{ sellerId: new Types.ObjectId(sellerId) }, { sellerId: null }],
      isActive: true,
      isDeleted: false,
      validFrom: { $lte: now },
      $and: [
        {
          $or: [
            { validTill: null },
            { validTill: { $exists: false } },
            { validTill: { $gte: now } },
          ],
        },
      ],
    };

    const coupons = await this.couponModel
      .find(query)
      .sort({ discountValue: -1, createdAt: -1 });

    let pastOrderCount = 0;
    const userUsages: Record<string, number> = {};

    if (userId && Types.ObjectId.isValid(userId)) {
      pastOrderCount = await this.transactionModel.countDocuments({
        customerId: new Types.ObjectId(userId),
        sellerId: new Types.ObjectId(sellerId),
        paymentStatus: 'paid',
      });

      const usages = await this.couponUsageModel.find({
        userId: new Types.ObjectId(userId),
        couponId: { $in: coupons.map((c) => c._id) },
      });

      for (const u of usages) {
        userUsages[u.couponId.toString()] = u.usageCount;
      }
    }

    return coupons.map((coupon) => {
      const terms: string[] = [];

      if (coupon.discountType === 'percent') {
        if (coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0) {
          terms.push(
            'Get ' + coupon.discountValue + '% discount up to ₹' + coupon.maxDiscountAmount + ' on your bill',
          );
        } else {
          terms.push('Get ' + coupon.discountValue + '% discount on your total bill');
        }
      } else {
        terms.push('Get flat ₹' + coupon.discountValue + ' off on your order');
      }

      if (coupon.minOrderValue > 0) {
        terms.push('Minimum bill amount of ₹' + coupon.minOrderValue + ' required');
      } else {
        terms.push('No minimum order value required');
      }

      if (coupon.appliesTo === 'first_order') {
        terms.push('Valid exclusively on your first order with this store');
      } else if (coupon.appliesTo === 'subsequent_orders') {
        terms.push('Valid for repeat customers with previous orders');
      } else {
        terms.push('Applicable for all orders at this store');
      }

      terms.push('Redeemable once per customer (' + (coupon.perUserLimit || 1) + ' use per user)');

      if (coupon.usageLimit) {
        terms.push('Total offer redemption cap of ' + coupon.usageLimit + ' orders');
      }

      if (coupon.validTill) {
        const d = new Date(coupon.validTill);
        terms.push('Valid till ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
      } else {
        terms.push('Valid for a limited period only');
      }

      let isEligible = true;
      let ineligibilityReason = '';

      if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
        isEligible = false;
        ineligibilityReason = 'Coupon redemption limit reached';
      }

      const userUsedCount = userUsages[coupon._id.toString()] || 0;
      if (userUsedCount >= coupon.perUserLimit) {
        isEligible = false;
        ineligibilityReason = 'You have already used this coupon';
      }

      if (userId) {
        if (coupon.appliesTo === 'first_order' && pastOrderCount > 0) {
          isEligible = false;
          ineligibilityReason = 'Valid only on your first order with this store';
        } else if (coupon.appliesTo === 'subsequent_orders' && pastOrderCount === 0) {
          isEligible = false;
          ineligibilityReason = 'Valid only for repeat customers';
        }
      }

      return {
        _id: coupon._id,
        code: coupon.code,
        title: coupon.title || '',
        description: coupon.description || '',
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderValue: coupon.minOrderValue,
        maxDiscountAmount: coupon.maxDiscountAmount,
        appliesTo: coupon.appliesTo,
        usageLimit: coupon.usageLimit,
        usageCount: coupon.usageCount,
        validFrom: coupon.validFrom,
        validTill: coupon.validTill,
        terms,
        isEligible,
        ineligibilityReason,
      };
    });
  }
}

