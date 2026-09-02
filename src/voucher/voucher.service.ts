import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import {
  VoucherConfig,
  VoucherConfigDocument,
} from './schemas/voucher-config.schema';
import {
  UserVoucher,
  UserVoucherDocument,
} from './schemas/user-voucher.schema';
import {
  VoucherTransaction,
  VoucherTransactionDocument,
} from './schemas/voucher-transaction.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import {
  CustomVoucherSlab,
  CustomVoucherSlabDocument,
} from './schemas/custom-voucher-slab.schema';
import {
  PendingVoucherOrder,
  PendingVoucherOrderDocument,
} from './schemas/pending-voucher-order.schema';
import { CashfreeService } from '../payment/cashfree.service';
import { CreateVoucherConfigDto } from './dto/voucher.dto';
import { ReferralService } from '../referral/referral.service';

import { WalletTransaction, WalletTransactionDocument } from '../wallet/schemas/wallet-transaction.schema';
import { Transaction, TransactionDocument } from '../payment/schemas/transaction.schema';

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  constructor(
    @InjectModel(VoucherConfig.name)
    private readonly voucherConfigModel: Model<VoucherConfigDocument>,
    @InjectModel(UserVoucher.name)
    private readonly userVoucherModel: Model<UserVoucherDocument>,
    @InjectModel(VoucherTransaction.name)
    private readonly voucherTxnModel: Model<VoucherTransactionDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(CustomVoucherSlab.name)
    private readonly customSlabModel: Model<CustomVoucherSlabDocument>,
    @InjectModel(PendingVoucherOrder.name)
    private readonly pendingOrderModel: Model<PendingVoucherOrderDocument>,
    @InjectModel(WalletTransaction.name)
    private readonly walletTxnModel: Model<WalletTransactionDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    private readonly cashfreeService: CashfreeService,
    @InjectConnection() private readonly connection: Connection,
    private readonly referralService: ReferralService,
  ) {}

  /**
   * Creates a new voucher configuration (Admin or Seller).
   */
  async createVoucherConfig(
    dto: CreateVoucherConfigDto,
    creator: 'admin' | 'seller',
  ): Promise<VoucherConfigDocument> {
    const configData: any = {
      title: dto.title,
      description: dto.description || null,
      faceValue: dto.faceValue,
      discountPercent: dto.discountPercent,
      sellerId: dto.sellerId ? new Types.ObjectId(dto.sellerId) : null,
      createdBy: creator,
      isActive: true,
      splitConfig: dto.splitConfig || null,
      spendLimitToReactivate: dto.spendLimitToReactivate || 0,
    };

    return this.voucherConfigModel.create(configData);
  }

  /**
   * Lists all active/available voucher configs, resolved with user-specific reactivation limits.
   */
  async getVoucherConfigs(sellerId?: string, userId?: string): Promise<any[]> {
    const query: any = { isActive: true };
    if (sellerId) {
      query.sellerId = new Types.ObjectId(sellerId);
    }
    const configs = await this.voucherConfigModel.find(query).lean().exec();

    if (!userId) {
      return configs.map(c => ({
        ...c,
        isAvailable: true,
        remainingSpendToReactivate: 0,
      }));
    }

    const results = [];
    for (const config of configs) {
      const spendLimit = config.spendLimitToReactivate || 0;
      if (spendLimit <= 0) {
        results.push({
          ...config,
          isAvailable: true,
          remainingSpendToReactivate: 0,
        });
        continue;
      }

      // Find the user's latest purchase of this voucher config
      const latestVoucher = await this.userVoucherModel
        .findOne({
          userId: new Types.ObjectId(userId),
          voucherConfigId: config._id,
        })
        .sort({ createdAt: -1 })
        .exec();

      if (!latestVoucher) {
        results.push({
          ...config,
          isAvailable: true,
          remainingSpendToReactivate: 0,
        });
        continue;
      }

      // Sum the totalAmount of paid transactions since this purchase
      const aggregateResult = await this.transactionModel.aggregate([
        {
          $match: {
            customerId: new Types.ObjectId(userId),
            paymentStatus: 'paid',
            createdAt: { $gt: (latestVoucher as any).createdAt },
          },
        },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: '$totalAmount' },
          },
        },
      ]);

      const totalSpent = aggregateResult[0]?.totalSpent || 0;

      if (totalSpent >= spendLimit) {
        results.push({
          ...config,
          isAvailable: true,
          remainingSpendToReactivate: 0,
        });
      } else {
        results.push({
          ...config,
          isAvailable: false,
          remainingSpendToReactivate: spendLimit - totalSpent,
        });
      }
    }

    return results;
  }

  /**
   * Admin-only: Lists all voucher configs (active and inactive).
   */
  async getAllConfigsForAdmin(): Promise<VoucherConfigDocument[]> {
    return this.voucherConfigModel
      .find()
      .populate('sellerId', 'shopName')
      .lean()
      .exec() as any;
  }

  /**
   * Deactivates or activates a voucher config.
   */
  async setConfigStatus(
    id: string,
    isActive: boolean,
  ): Promise<VoucherConfigDocument> {
    const config = await this.voucherConfigModel.findByIdAndUpdate(
      id,
      { isActive },
      { new: true },
    );
    if (!config) throw new NotFoundException('Voucher configuration not found');
    return config;
  }

  /**
   * Lists all custom voucher slabs.
   */
  async getCustomSlabs(): Promise<CustomVoucherSlab[]> {
    return this.customSlabModel.find().sort({ maxAmount: 1 }).exec();
  }

  /**
   * Creates or updates a custom voucher slab.
   */
  async upsertCustomSlab(
    maxAmount: number,
    discountPercent: number,
  ): Promise<CustomVoucherSlab> {
    return this.customSlabModel.findOneAndUpdate(
      { maxAmount },
      { maxAmount, discountPercent },
      { upsert: true, new: true },
    );
  }

  /**
   * Deletes a custom voucher slab.
   */
  async deleteCustomSlab(id: string): Promise<any> {
    const res = await this.customSlabModel.findByIdAndDelete(id);
    if (!res) throw new NotFoundException('Slab not found');
    return { success: true };
  }

  /**
   * Initiates a voucher purchase by generating a Cashfree PG payment order link.
   */
  async initiatePurchase(
    userId: string,
    voucherConfigId: string,
    quantity = 1,
  ): Promise<any> {
    const config = await this.voucherConfigModel.findById(voucherConfigId);
    if (!config || !config.isActive) {
      throw new BadRequestException(
        'Voucher configuration is inactive or not found',
      );
    }

    // Enforce spendLimitToReactivate check
    const spendLimit = config.spendLimitToReactivate || 0;
    if (spendLimit > 0) {
      const latestVoucher = await this.userVoucherModel
        .findOne({
          userId: new Types.ObjectId(userId),
          voucherConfigId: config._id,
        })
        .sort({ createdAt: -1 })
        .exec();

      if (latestVoucher) {
        const aggregateResult = await this.transactionModel.aggregate([
          {
            $match: {
              customerId: new Types.ObjectId(userId),
              paymentStatus: 'paid',
              createdAt: { $gt: (latestVoucher as any).createdAt },
            },
          },
          {
            $group: {
              _id: null,
              totalSpent: { $sum: '$totalAmount' },
            },
          },
        ]);

        const totalSpent = aggregateResult[0]?.totalSpent || 0;
        if (totalSpent < spendLimit) {
          const remaining = spendLimit - totalSpent;
          throw new BadRequestException(
            `You need to spend ₹${remaining} more before buying this voucher again.`,
          );
        }
      }
    }

    const qty = Math.max(1, Number(quantity) || 1);
    const totalFaceValue = config.faceValue * qty;
    const discountAmount = (totalFaceValue * config.discountPercent) / 100;
    const amountToPay = totalFaceValue - discountAmount;

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Unique order ID format for voucher purchase
    const orderId = `VOUCH_${userId.slice(-6)}_${Date.now()}`;

    // Create Cashfree order
    const cashfreeOrder = await this.cashfreeService.createOrder({
      orderId,
      orderAmount: amountToPay,
      customerName: user.name || 'Customer',
      customerEmail: user.email || 'customer@trystop.com',
      customerPhone: user.phone || '9999999999',
    });

    // Record pending order
    await this.pendingOrderModel.create({
      orderId,
      userId: new Types.ObjectId(userId),
      voucherConfigId: config._id,
      faceValue: totalFaceValue,
      amountToPay,
      status: 'pending',
    });

    return {
      orderId,
      faceValue: totalFaceValue,
      amountToPay,
      cashfreeOrder,
    };
  }

  /**
   * Initiates a custom amount voucher purchase.
   */
  async initiateCustomPurchase(userId: string, amount: number): Promise<any> {
    if (amount <= 0) {
      throw new BadRequestException('Invalid purchase amount');
    }

    // Find applicable slab
    const slabs = await this.customSlabModel
      .find()
      .sort({ maxAmount: 1 })
      .exec();
    let discountPercent = 0;
    if (slabs.length > 0) {
      for (const slab of slabs) {
        if (amount <= slab.maxAmount) {
          discountPercent = slab.discountPercent;
          break;
        }
      }
      if (amount > slabs[slabs.length - 1].maxAmount) {
        discountPercent = slabs[slabs.length - 1].discountPercent;
      }
    }

    const discountAmount = (amount * discountPercent) / 100;
    const amountToPay = amount - discountAmount;

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const orderId = `VOUCH_${userId.slice(-6)}_${Date.now()}`;

    // Create Cashfree order
    const cashfreeOrder = await this.cashfreeService.createOrder({
      orderId,
      orderAmount: amountToPay,
      customerName: user.name || 'Customer',
      customerEmail: user.email || 'customer@trystop.com',
      customerPhone: user.phone || '9999999999',
    });

    // Record pending order
    await this.pendingOrderModel.create({
      orderId,
      userId: new Types.ObjectId(userId),
      voucherConfigId: null,
      faceValue: amount,
      amountToPay,
      status: 'pending',
    });

    return {
      orderId,
      faceValue: amount,
      amountToPay,
      cashfreeOrder,
    };
  }

  /**
   * Finalizes/Confirms voucher purchase after payment succeeds (Webhook or manual resolution).
   * Credits user's voucherBalance atomically.
   */
  async confirmPurchase(
    userId: string,
    voucherConfigId: string,
    amountPaid: number,
    orderId: string,
  ): Promise<UserVoucherDocument> {
    // Keep this method for backwards-compatibility or resolve using orderId
    return this.confirmPurchaseByOrderId(orderId, amountPaid);
  }

  /**
   * Finalizes/Confirms voucher purchase using pending order document lookup (webhook-compatible).
   */

  /**
   * Handles payment failure or cancellation for a voucher order.
   */
  async handlePaymentFailureByOrderId(orderId: string, reason?: string): Promise<any> {
    const pendingOrder = await this.pendingOrderModel.findOne({ orderId });
    if (!pendingOrder) return { success: false, message: "Pending voucher order not found" };
    if (pendingOrder.status === "paid") return { success: true, status: "paid" };

    pendingOrder.status = "failed";
    (pendingOrder as any).isGatewayDoubleConfirmed = true;
    (pendingOrder as any).gatewayDoubleConfirmedAt = new Date();
    await pendingOrder.save();
    return { success: true, status: "failed" };
  }

  async confirmPurchaseByOrderId(
    orderId: string,
    amountPaid: number,
  ): Promise<any> {
    const pendingOrder = await this.pendingOrderModel.findOne({ orderId });
    if (!pendingOrder)
      throw new NotFoundException('Pending voucher order not found');
    if (pendingOrder.status !== 'pending') {
      return { success: true, alreadyProcessed: true };
    }

    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      pendingOrder.status = 'paid';
      await pendingOrder.save({ session });

      // Split the credit: amountPaid goes to voucher balance (100% usable),
      // and the discount/extra bonus goes to wallet balance (capped by wallet usage cap).
      const bonusAmount = Math.max(0, pendingOrder.faceValue - amountPaid);
      const voucherCreditAmount = pendingOrder.faceValue - bonusAmount; // This is amountPaid

      const userVoucher = (await this.userVoucherModel.create(
        [
          {
            userId: pendingOrder.userId,
            voucherConfigId: pendingOrder.voucherConfigId, // null for custom amount loading
            faceValue: voucherCreditAmount,
            amountPaid,
            remainingBalance: voucherCreditAmount,
            status: 'active',
          },
        ],
        { session },
      )) as UserVoucherDocument[];

      // 2. Log credit ledger transaction for Voucher
      await this.voucherTxnModel.create(
        [
          {
            userId: pendingOrder.userId,
            type: 'credit',
            amount: voucherCreditAmount,
            reason: 'purchase',
            userVoucherId: userVoucher[0]._id,
          },
        ],
        { session },
      );

      // 3. Atomically update User voucher balance cache
      await this.userModel.findByIdAndUpdate(
        pendingOrder.userId,
        { $inc: { voucherBalance: voucherCreditAmount } },
        { session },
      );

      // 4. If there is a discount/bonus amount, credit it to wallet balance (so it's subject to the wallet cap)
      if (bonusAmount > 0) {
        await this.walletTxnModel.create(
          [
            {
              userId: pendingOrder.userId,
              type: 'credit',
              amount: bonusAmount,
              reason: 'promo_credit',
              note: `Voucher bonus for order ${orderId}`,
            },
          ],
          { session },
        );

        await this.userModel.findByIdAndUpdate(
          pendingOrder.userId,
          { $inc: { walletBalance: bonusAmount } },
          { session },
        );
      }

      await session.commitTransaction();
      this.logger.log(
        `Confirmed voucher purchase for ${orderId}: ₹${voucherCreditAmount} credited to voucherBalance, ₹${bonusAmount} credited to walletBalance for user ${pendingOrder.userId}`,
      );

      try {
        await this.referralService.processReferralReward(
          pendingOrder.userId.toString(),
          amountPaid,
          orderId,
        );
      } catch (refErr) {
        this.logger.error(
          `Referral reward processing failed: ${refErr?.message}`,
        );
      }

      return userVoucher[0];
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(
        `Confirm voucher purchase failed for ${orderId}: ${error?.message}`,
      );
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Debits user's voucher balance atomically.
   */

  /**
   * Admin-only: Get all voucher purchase orders with pagination & status filters.
   */
  async getAllVoucherOrders(page = 1, limit = 20, search = "", status = "") {
    const query: any = {};
    if (status) query.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const parsedLimit = Number(limit);

    const [orders, total] = await Promise.all([
      this.pendingOrderModel
        .find(query)
        .populate("userId", "name email phone")
        .populate("voucherConfigId", "title faceValue discountPercent")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      this.pendingOrderModel.countDocuments(query),
    ]);

    return {
      orders,
      total,
      page: Number(page),
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
    };
  }

  async debitVoucherBalance(
    userId: string,
    amount: number,
    relatedTransactionId: string,
    session?: any,
  ): Promise<void> {
    if (amount <= 0) return;

    const user = await this.userModel.findById(userId).session(session);
    if (!user) throw new NotFoundException('User not found');
    if (user.voucherBalance < amount) {
      throw new BadRequestException(
        `Insufficient voucher balance. Available: ₹${user.voucherBalance}`,
      );
    }

    // 1. Log debit ledger transaction
    await this.voucherTxnModel.create(
      [
        {
          userId: new Types.ObjectId(userId),
          type: 'debit',
          amount,
          reason: 'redemption',
          relatedTransactionId: new Types.ObjectId(relatedTransactionId),
        },
      ],
      { session },
    );

    // 2. Decrement user's cached voucher balance
    await this.userModel.findByIdAndUpdate(
      userId,
      { $inc: { voucherBalance: -amount } },
      { session },
    );

    this.logger.log(`Debited voucher balance: ₹${amount} from user ${userId}`);
  }
}
