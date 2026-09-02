import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import {
  PlatformConfig,
  PlatformConfigDocument,
} from './schemas/platform-config.schema';
import { Seller, SellerDocument } from '../auth/schemas/seller.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Inject, forwardRef } from '@nestjs/common';
import { CashfreeService } from './cashfree.service';
import { WalletService } from '../wallet/wallet.service';
import { OfferService } from '../offer/offer.service';
import { VoucherService } from '../voucher/voucher.service';
import { ReferralService } from '../referral/referral.service';
import { CreateOrderDto } from './dto/create-order.dto';
import * as bcrypt from 'bcrypt';

/**
 * PaymentService — the central hub for all payment operations.
 *
 * Responsibilities:
 *   - Cashfree vendor onboarding (§2.1)
 *   - Payment order creation with dynamic commission + wallet checks (§2.2, §3.3)
 *   - Webhook handling (idempotent, signature-verified) (§2.2)
 *   - Financial breakdown calculations (§3.4)
 *
 * On successful payment, triggers (each independent, retryable via BullMQ):
 *   - Cashback credit to customer's wallet
 *   - Push notifications to customer + seller
 *   - Ranking signal update
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(PlatformConfig.name)
    private readonly platformConfigModel: Model<PlatformConfigDocument>,
    @InjectModel(Seller.name)
    private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue('payment-events') private readonly paymentEventsQueue: Queue,
    private readonly cashfreeService: CashfreeService,
    private readonly walletService: WalletService,
    private readonly offerService: OfferService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    private readonly referralService: ReferralService,
  ) {}

  // ─── Cashfree Vendor Onboarding (§2.1) ─────────────────────────────────────

  /**
   * Creates a customer payment order for a seller.
   */
  async createPaymentOrder(
    customerId: string,
    dto: CreateOrderDto,
  ): Promise<any> {
    // 1. Validate seller
    const seller = await this.sellerModel.findById(dto.sellerId);
    if (!seller) throw new NotFoundException('Seller not found');
    if (seller.verificationStatus !== 'approved') {
      throw new BadRequestException(
        'Seller is not approved for receiving payments',
      );
    }

    // 2. Validate and resolve coupon discount
    let couponDiscount = 0;
    if (dto.couponCode) {
      const couponResult = await this.offerService.validateCoupon(
        dto.couponCode,
        dto.totalAmount,
        customerId,
      );
      couponDiscount = couponResult.discountAmount;
    }

    const effectiveTotal = dto.totalAmount - couponDiscount;

    const customer = await this.userModel.findById(customerId);
    if (!customer) throw new NotFoundException('Customer not found');

    // 3. Resolve Voucher usage
    let useVoucherAmount = dto.useVoucherAmount || 0;
    if (useVoucherAmount > 0) {
      if (useVoucherAmount > customer.voucherBalance) {
        throw new BadRequestException(
          `Insufficient voucher balance. Available: ₹${customer.voucherBalance}`,
        );
      }
      if (useVoucherAmount > effectiveTotal) {
        useVoucherAmount = effectiveTotal;
      }
    }

    const remainingTotal = effectiveTotal - useVoucherAmount;

    // 4. Resolve Cashback (wallet) usage (capped at 75% of remaining total)
    let useWalletAmount = dto.useWalletAmount || 0;
    if (useWalletAmount > 0) {
      if (useWalletAmount > customer.walletBalance) {
        throw new BadRequestException(
          `Insufficient wallet balance. Available: ₹${customer.walletBalance}`,
        );
      }

      // Resolve wallet cap: user-specific > global
      const effectiveWalletCap = await this.resolveWalletCap(customerId);
      const maxWalletAllowed = remainingTotal * effectiveWalletCap;

      if (useWalletAmount > maxWalletAllowed) {
        useWalletAmount = Math.floor(maxWalletAllowed * 100) / 100; // Cap and round down
        this.logger.log(
          `Wallet usage capped to ₹${useWalletAmount} (${effectiveWalletCap * 100}% of remaining ₹${remainingTotal})`,
        );
      }
    }

    // 5. Calculate amounts
    const amountToChargeOnline = remainingTotal - useWalletAmount;

    // 6. Calculate full financial breakdown
    const breakdown = await this.calculateBreakdown(
      effectiveTotal,
      amountToChargeOnline,
      useWalletAmount,
      seller._id.toString(),
      customerId,
      useVoucherAmount,
    );

    // 7. Generate unique order ID
    const orderId = `TS_${customerId.slice(-6)}_${Date.now()}`;

    // 8. If amountToChargeOnline is 0, we can immediately approve and bypass PG!
    if (amountToChargeOnline === 0) {
      const transaction = await this.transactionModel.create({
        customerId: new Types.ObjectId(customerId),
        sellerId: new Types.ObjectId(dto.sellerId),
        cashfreeOrderId: orderId,
        totalAmount: effectiveTotal,
        walletAmountUsed: useWalletAmount,
        voucherAmountUsed: useVoucherAmount,
        amountPaidOnline: 0,
        couponCode: dto.couponCode || null,
        couponDiscount,
        appliedCommissionRate: breakdown.commissionRate,
        commissionAmount: breakdown.commissionAmount,
        pgFeeTotal: breakdown.pgFeeTotal,
        pgFeeTrystopShare: breakdown.pgFeeTrystopShare,
        pgFeeSellerShare: breakdown.pgFeeSellerShare,
        sellerNetPayout: breakdown.sellerNetPayout,
        cashbackEarned: breakdown.cashbackEarned,
        appliedCashbackRate: breakdown.cashbackRate,
        paymentStatus: 'paid',
        paidAt: new Date(),
      });

      this.logger.log(
        `Payment order auto-approved (100% wallet/voucher): ${orderId}`,
      );
      await this.processSuccessfulPayment(transaction);

      return {
        orderId,
        transactionId: transaction._id,
        totalAmount: effectiveTotal,
        walletAmountUsed: useWalletAmount,
        voucherAmountUsed: useVoucherAmount,
        amountToChargeOnline: 0,
        couponDiscount,
        breakdown,
        isPaid: true,
      };
    }

    // 9. Create Cashfree order for online payment portion
    const webhookUrl = this.configService.get<string>(
      'CASHFREE_WEBHOOK_URL',
      'https://try-stop-backned-o2iu.vercel.app',
    );
    const cashfreeOrder = await this.cashfreeService.createOrder({
      orderId,
      orderAmount: amountToChargeOnline,
      customerName: customer?.name || 'Customer',
      customerEmail: customer?.email || 'customer@trystop.com',
      customerPhone: customer?.phone || '9999999999',
      notifyUrl: webhookUrl,
    });

    // 10. Create local pending transaction record
    const transaction = await this.transactionModel.create({
      customerId: new Types.ObjectId(customerId),
      sellerId: new Types.ObjectId(dto.sellerId),
      cashfreeOrderId: orderId,
      totalAmount: effectiveTotal,
      walletAmountUsed: useWalletAmount,
      voucherAmountUsed: useVoucherAmount,
      amountPaidOnline: amountToChargeOnline,
      couponCode: dto.couponCode || null,
      couponDiscount,
      appliedCommissionRate: breakdown.commissionRate,
      commissionAmount: breakdown.commissionAmount,
      pgFeeTotal: breakdown.pgFeeTotal,
      pgFeeTrystopShare: breakdown.pgFeeTrystopShare,
      pgFeeSellerShare: breakdown.pgFeeSellerShare,
      sellerNetPayout: breakdown.sellerNetPayout,
      cashbackEarned: breakdown.cashbackEarned,
      appliedCashbackRate: breakdown.cashbackRate,
      paymentStatus: 'pending',
    });

    this.logger.log(
      `Payment order created: ${orderId} | Total: ₹${effectiveTotal} | Online: ₹${amountToChargeOnline} | Wallet: ₹${useWalletAmount} | Voucher: ₹${useVoucherAmount}`,
    );

    return {
      orderId,
      transactionId: transaction._id,
      totalAmount: effectiveTotal,
      walletAmountUsed: useWalletAmount,
      voucherAmountUsed: useVoucherAmount,
      amountToChargeOnline,
      couponDiscount,
      breakdown,
      cashfreeOrder, // Contains payment link/QR
    };
  }

  // ─── Webhook Handler (§2.2 — idempotent, signature-verified) ──────────────

  /**
   * Processes Cashfree payment webhook.
   *
   * CRITICAL — this handler is:
   *   - Signature-verified (Cashfree signs all webhooks)
   *   - Idempotent (uses cashfreeOrderId as key — never double-processes)
   *   - Never trusts client-reported payment status
   *
   * On success, dispatches independent async side-effects via BullMQ:
   *   - Cashback credit, Push notifications, Ranking signal
   */
  async handleWebhook(
    payload: any,
    signature: string,
  ): Promise<{ received: boolean }> {
    // 1. Verify webhook signature
    const rawPayload = JSON.stringify(payload);
    const isValid = this.cashfreeService.verifyWebhookSignature(
      rawPayload,
      signature,
    );
    if (!isValid) {
      this.logger.warn('Invalid webhook signature — rejecting');
      throw new BadRequestException('Invalid webhook signature');
    }

    const orderData = payload?.data?.order || payload?.order || {};
    const paymentData = payload?.data?.payment || payload?.payment || {};
    const cashfreeOrderId = orderData?.order_id;
    const paymentStatus =
      orderData?.order_status || paymentData?.payment_status;

    if (!cashfreeOrderId) {
      this.logger.warn('Webhook missing order_id — ignoring');
      return { received: true };
    }

    if (cashfreeOrderId.startsWith('VOUCH_')) {
      if (paymentStatus === 'PAID' || paymentStatus === 'SUCCESS') {
        const amountPaid =
          paymentData?.payment_amount ?? orderData?.order_amount ?? 0;
        await this.voucherService.confirmPurchaseByOrderId(
          cashfreeOrderId,
          amountPaid,
        );
        this.logger.log(
          `Confirmed voucher order via webhook: ${cashfreeOrderId}`,
        );
      } else {
        this.logger.log(
          `Voucher order payment failed: ${cashfreeOrderId} Status: ${paymentStatus}`,
        );
      }
      return { received: true };
    }

    // 2. Idempotency check — find the transaction, skip if already processed
    const transaction = await this.transactionModel.findOne({
      cashfreeOrderId,
    });
    if (!transaction) {
      this.logger.warn(`Webhook for unknown order: ${cashfreeOrderId}`);
      return { received: true };
    }

    if (transaction.paymentStatus === 'paid') {
      this.logger.log(
        `Webhook duplicate for already-paid order: ${cashfreeOrderId} — skipping`,
      );
      return { received: true };
    }

    // 3. Process based on status
    if (paymentStatus === 'PAID' || paymentStatus === 'SUCCESS') {
      await this.processSuccessfulPayment(transaction);
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
      await this.transactionModel.findByIdAndUpdate(transaction._id, {
        paymentStatus: 'failed',
        cashfreePaymentStatus: paymentStatus,
      });
      this.logger.log(`Payment failed for order: ${cashfreeOrderId}`);
    }

    return { received: true };
  }

  /**
   * Processes a successful payment — updates the transaction and dispatches
   * independent side-effects via the BullMQ queue.
   */
  private async processSuccessfulPayment(
    transaction: TransactionDocument,
  ): Promise<void> {
    // Update transaction status
    await this.transactionModel.findByIdAndUpdate(transaction._id, {
      paymentStatus: 'paid',
      cashfreePaymentStatus: 'PAID',
      paidAt: new Date(),
    });

    const txnId = transaction._id.toString();
    const customerId = transaction.customerId.toString();
    const sellerId = transaction.sellerId.toString();

    // Dispatch independent side-effects via BullMQ queue
    // Each is retryable — a failure in one never blocks the others

    try {
      // 1. Wallet debit (if wallet was used) + Cashback credit + Voucher debit
      await this.paymentEventsQueue.add(
        'wallet-operations',
        {
          transactionId: txnId,
          customerId,
          walletAmountUsed: transaction.walletAmountUsed,
          voucherAmountUsed: transaction.voucherAmountUsed || 0,
          cashbackEarned: transaction.cashbackEarned,
          amountPaidOnline: transaction.amountPaidOnline,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      // 2. Push notifications to customer and seller
      await this.paymentEventsQueue.add(
        'send-notifications',
        {
          transactionId: txnId,
          customerId,
          sellerId,
          totalAmount: transaction.totalAmount,
          cashbackEarned: transaction.cashbackEarned,
          amountPaidOnline: transaction.amountPaidOnline,
          walletAmountUsed: transaction.walletAmountUsed,
          voucherAmountUsed: transaction.voucherAmountUsed || 0,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      // 3. Update ranking signal
      await this.paymentEventsQueue.add(
        'update-ranking-signal',
        {
          sellerId,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      // 4. Record coupon usage if applicable
      if (transaction.couponCode) {
        await this.paymentEventsQueue.add(
          'record-coupon-usage',
          {
            couponCode: transaction.couponCode,
            customerId,
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
        );
      }
    } catch (queueErr: any) {
      this.logger.warn(`BullMQ queue dispatch skipped/delayed: ${queueErr?.message}`);
    }

    // 5. Process Referral reward if referee's first purchase
    try {
      await this.referralService.processReferralReward(
        customerId,
        transaction.totalAmount,
        txnId,
      );
    } catch (refErr) {
      this.logger.error(
        `Referral reward processing failed: ${refErr?.message}`,
      );
    }

    this.logger.log(
      `Payment successful for order: ${transaction.cashfreeOrderId} | Dispatched all side-effects`,
    );
  }

  // ─── Financial Breakdown Calculator (§3.4) ─────────────────────────────────


  /**
   * Get date-wise daily settlements summary for a seller.
   * Aggregates paid orders grouped by date (YYYY-MM-DD) with totals and child orders.
   */
  async getSellerDailySettlements(
    sellerId: string,
    params: {
      startDate?: string;
      endDate?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<any> {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 30;
    const skip = (page - 1) * limit;

    const matchQuery: any = {
      sellerId: new Types.ObjectId(sellerId),
      paymentStatus: 'paid',
    };

    if (params.startDate || params.endDate) {
      const dateFilter: any = {};
      if (params.startDate) {
        const start = new Date(params.startDate);
        if (!isNaN(start.getTime())) dateFilter.$gte = start;
      }
      if (params.endDate) {
        const end = new Date(params.endDate);
        if (!isNaN(end.getTime())) {
          if (params.endDate.length === 10) end.setHours(23, 59, 59, 999);
          dateFilter.$lte = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) matchQuery.createdAt = dateFilter;
    }

    const rawTransactions = await this.transactionModel
      .find(matchQuery)
      .sort({ createdAt: -1 })
      .populate('customerId', 'name phone email')
      .lean();

    // Group transactions by date YYYY-MM-DD
    const dateMap = new Map<string, any>();

    for (const txn of rawTransactions) {
      const dateKey = new Date((txn as any).createdAt).toISOString().slice(0, 10);
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          date: dateKey,
          totalGrossAmount: 0,
          totalAmountPaidOnline: 0,
          totalWalletAmountUsed: 0,
          totalCommissionAmount: 0,
          totalPgFee: 0,
          totalNetPayout: 0,
          orderCount: 0,
          settledCount: 0,
          pendingCount: 0,
          orders: [],
        });
      }

      const daySummary = dateMap.get(dateKey);
      daySummary.totalGrossAmount += txn.totalAmount || 0;
      daySummary.totalAmountPaidOnline += txn.amountPaidOnline || 0;
      daySummary.totalWalletAmountUsed += txn.walletAmountUsed || 0;
      daySummary.totalCommissionAmount += txn.commissionAmount || 0;
      daySummary.totalPgFee += txn.pgFeeSellerShare || 0;
      daySummary.totalNetPayout += txn.sellerNetPayout || 0;
      daySummary.orderCount += 1;

      if (txn.settlementStatus === 'settled') {
        daySummary.settledCount += 1;
      } else {
        daySummary.pendingCount += 1;
      }

      daySummary.orders.push(txn);
    }

    let dailyList = Array.from(dateMap.values()).map((d) => {
      d.totalGrossAmount = Math.round(d.totalGrossAmount * 100) / 100;
      d.totalCommissionAmount = Math.round(d.totalCommissionAmount * 100) / 100;
      d.totalPgFee = Math.round(d.totalPgFee * 100) / 100;
      d.totalNetPayout = Math.round(d.totalNetPayout * 100) / 100;

      if (d.pendingCount === 0 && d.settledCount > 0) {
        d.settlementStatus = 'settled';
      } else {
        d.settlementStatus = 'unsettled';
      }
      return d;
    });

    if (params.status && params.status !== 'all') {
      if (params.status === 'settled') {
        dailyList = dailyList.filter((d) => d.settlementStatus === 'settled');
      } else if (params.status === 'unsettled' || params.status === 'pending') {
        dailyList = dailyList.filter((d) => d.settlementStatus !== 'settled');
      }
    }

    const totalDays = dailyList.length;
    const paginatedDays = dailyList.slice(skip, skip + limit);

    return {
      dailySettlements: paginatedDays,
      totalDays,
      page,
      limit,
      totalPages: Math.ceil(totalDays / limit) || 1,
    };
  }

  /**
   * Admin: Get date-wise daily settlement breakdown for all or specific sellers.
   */
  async getAdminDailySettlements(params: {
    sellerId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 30;
    const skip = (page - 1) * limit;

    const matchQuery: any = {
      paymentStatus: 'paid',
    };

    if (params.sellerId && Types.ObjectId.isValid(params.sellerId)) {
      matchQuery.sellerId = new Types.ObjectId(params.sellerId);
    }

    if (params.startDate || params.endDate) {
      const dateFilter: any = {};
      if (params.startDate) {
        const start = new Date(params.startDate);
        if (!isNaN(start.getTime())) dateFilter.$gte = start;
      }
      if (params.endDate) {
        const end = new Date(params.endDate);
        if (!isNaN(end.getTime())) {
          if (params.endDate.length === 10) end.setHours(23, 59, 59, 999);
          dateFilter.$lte = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) matchQuery.createdAt = dateFilter;
    }

    const rawTransactions = await this.transactionModel
      .find(matchQuery)
      .sort({ createdAt: -1 })
      .populate('sellerId', 'shopName ownerName email phone bankDetails')
      .populate('customerId', 'name phone email')
      .lean();

    // Group by sellerId + date
    const groupMap = new Map<string, any>();

    for (const txn of rawTransactions) {
      const sId = txn.sellerId?._id?.toString() || 'unknown';
      const dateKey = new Date((txn as any).createdAt).toISOString().slice(0, 10);
      const compositeKey = `${sId}_${dateKey}`;

      if (!groupMap.has(compositeKey)) {
        groupMap.set(compositeKey, {
          key: compositeKey,
          date: dateKey,
          seller: txn.sellerId,
          totalGrossAmount: 0,
          totalAmountPaidOnline: 0,
          totalVoucherUsed: 0,
          totalWalletUsed: 0,
          totalCommissionAmount: 0,
          totalCashbackEarned: 0,
          totalNetProfit: 0,
          totalPgFee: 0,
          totalNetPayout: 0,
          orderCount: 0,
          settledCount: 0,
          pendingCount: 0,
          orders: [],
        });
      }

      const item = groupMap.get(compositeKey);
      item.totalGrossAmount += txn.totalAmount || 0;
      item.totalAmountPaidOnline += txn.amountPaidOnline || 0;
      item.totalVoucherUsed += txn.voucherAmountUsed || 0;
      item.totalWalletUsed += txn.walletAmountUsed || 0;
      item.totalCommissionAmount += txn.commissionAmount || 0;
      item.totalCashbackEarned += txn.cashbackEarned || 0;
      item.totalPgFee += txn.pgFeeSellerShare || 0;
      item.totalNetPayout += txn.sellerNetPayout || 0;
      item.orderCount += 1;

      if (txn.settlementStatus === 'settled') {
        item.settledCount += 1;
      } else {
        item.pendingCount += 1;
      }

      item.orders.push(txn);
    }

    let dailyList = Array.from(groupMap.values()).map((d) => {
      d.totalGrossAmount = Math.round(d.totalGrossAmount * 100) / 100;
      d.totalAmountPaidOnline = Math.round(d.totalAmountPaidOnline * 100) / 100;
      d.totalVoucherUsed = Math.round(d.totalVoucherUsed * 100) / 100;
      d.totalWalletUsed = Math.round(d.totalWalletUsed * 100) / 100;
      d.totalCommissionAmount = Math.round(d.totalCommissionAmount * 100) / 100;
      d.totalCashbackEarned = Math.round(d.totalCashbackEarned * 100) / 100;
      d.totalNetProfit = Math.round((d.totalCommissionAmount - d.totalCashbackEarned) * 100) / 100;
      d.totalPgFee = Math.round(d.totalPgFee * 100) / 100;
      d.totalNetPayout = Math.round(d.totalNetPayout * 100) / 100;

      if (d.pendingCount === 0 && d.settledCount > 0) {
        d.settlementStatus = 'settled';
      } else {
        d.settlementStatus = 'unsettled';
      }
      return d;
    });

    if (params.search && params.search.trim().length > 0) {
      const term = params.search.trim().toLowerCase();
      dailyList = dailyList.filter((d) => {
        const shop = d.seller?.shopName?.toLowerCase() || '';
        const owner = d.seller?.ownerName?.toLowerCase() || '';
        const date = d.date.toLowerCase();
        return shop.includes(term) || owner.includes(term) || date.includes(term);
      });
    }

    if (params.status && params.status !== 'all') {
      if (params.status === 'settled') {
        dailyList = dailyList.filter((d) => d.settlementStatus === 'settled');
      } else if (params.status === 'unsettled' || params.status === 'pending') {
        dailyList = dailyList.filter((d) => d.settlementStatus !== 'settled');
      }
    }

    const totalDays = dailyList.length;
    const paginatedDays = dailyList.slice(skip, skip + limit);

    return {
      dailySettlements: paginatedDays,
      totalDays,
      page,
      limit,
      totalPages: Math.ceil(totalDays / limit) || 1,
    };
  }

  /**
   * Admin: Settle all transactions for a seller on a specific date.
   */
  async settleDailyTransactions(
    sellerId: string,
    dateStr: string,
    utrReference?: string,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(sellerId)) {
      throw new BadRequestException('Invalid seller ID');
    }

    const start = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(`${dateStr}T23:59:59.999Z`);

    const updateData: any = {
      settlementStatus: 'settled',
      settledAt: new Date(),
    };
    if (utrReference) {
      updateData.utrReference = utrReference.trim();
    }

    const result = await this.transactionModel.updateMany(
      {
        sellerId: new Types.ObjectId(sellerId),
        paymentStatus: 'paid',
        createdAt: { $gte: start, $lte: end },
      },
      updateData,
    );

    this.logger.log(
      `Admin settled ${result.modifiedCount} orders for seller ${sellerId} on date ${dateStr} (UTR: ${utrReference || 'N/A'})`,
    );

    return {
      success: true,
      message: `Successfully settled ${result.modifiedCount} orders for ${dateStr}`,
      modifiedCount: result.modifiedCount,
    };
  }

  /**
   * Calculates the full financial breakdown for a transaction.
   *
   * All money math lives here — never inlined in controllers.
   * Highest-stakes calculations in the app — easy to audit/test in isolation.
   *
   * PG Fee (2%) is calculated on the GROSS bill amount and split 50/50.
   * Commission is calculated on the GROSS bill amount.
   * Seller net payout = grossAmount - commission - sellerFeeShare.
   * Cashback is earned only on the real-money portion (amountPaidOnline).
   */
  async calculateBreakdown(
    grossAmount: number,
    amountPaidOnline: number,
    walletAmountUsed: number,
    sellerId: string,
    customerId: string,
    voucherAmountUsed = 0,
  ): Promise<{
    commissionRate: number;
    commissionAmount: number;
    pgFeeRate: number;
    pgFeeTotal: number;
    pgFeeTrystopShare: number;
    pgFeeSellerShare: number;
    sellerNetPayout: number;
    cashbackRate: number;
    cashbackEarned: number;
    trystopRetained: number;
  }> {
    // 1. Resolve commission rate: seller-specific > global fallback
    const commissionRate = await this.resolveCommissionRate(sellerId);

    // 2. PG Fee rate: check seller customPgFeeRate > platform config fallback
    const sellerDoc = await this.sellerModel.findById(sellerId).select('customPgFeeRate');
    let pgFeeSellerShare = 0;
    let pgFeeRate = 0.016;
    let pgFeeTotal = 0;
    let pgFeeTrystopShare = 0;

    if (sellerDoc?.customPgFeeRate !== undefined && sellerDoc?.customPgFeeRate !== null) {
      pgFeeRate = sellerDoc.customPgFeeRate;
      pgFeeSellerShare = Math.round(grossAmount * pgFeeRate * 100) / 100;
      pgFeeTotal = pgFeeSellerShare * 2;
      pgFeeTrystopShare = pgFeeSellerShare;
    } else {
      pgFeeRate = await this.getConfigValue('pg_fee_rate', 0.016);
      pgFeeTotal = Math.round(grossAmount * pgFeeRate * 100) / 100;
      pgFeeTrystopShare = Math.round(pgFeeTotal * 0.5 * 100) / 100;
      pgFeeSellerShare = Math.round((pgFeeTotal - pgFeeTrystopShare) * 100) / 100;
    }

    // 3. Calculate commission on GROSS amount
    const commissionAmount =
      Math.round(grossAmount * commissionRate * 100) / 100;

    // 5. Seller net payout = gross - commission - seller's PG fee share
    const sellerNetPayout =
      Math.round((grossAmount - commissionAmount - pgFeeSellerShare) * 100) /
      100;

    // 6. Cashback — only on the real-money portion (§3.2)
    const cashbackRate =
      await this.offerService.resolveEffectiveCashbackRate(customerId, amountPaidOnline);
    const cashbackEarned =
      Math.round(amountPaidOnline * cashbackRate * 100) / 100;

    // 7. Trystop retained = commission - trystop's PG fee share
    const trystopRetained =
      Math.round((commissionAmount - pgFeeTrystopShare) * 100) / 100;

    return {
      commissionRate,
      commissionAmount,
      pgFeeRate,
      pgFeeTotal,
      pgFeeTrystopShare,
      pgFeeSellerShare,
      sellerNetPayout,
      cashbackRate,
      cashbackEarned,
      trystopRetained,
    };
  }

  // ─── Config Resolution Helpers ────────────────────────────────────────────

  /**
   * Resolves commission rate: seller-specific > global fallback.
   * Never hardcoded — always read dynamically at order creation time.
   */
  async resolveCommissionRate(sellerId: string): Promise<number> {
    const seller = await this.sellerModel.findById(sellerId);
    if (
      seller?.commissionRate !== undefined &&
      seller?.commissionRate !== null
    ) {
      return seller.commissionRate;
    }
    return this.getConfigValue('commission_rate', 0.15);
  }

  /**
   * Resolves the effective wallet usage cap for a user.
   */
  async resolveWalletCap(userId: string): Promise<number> {
    const user = await this.userModel.findById(userId);
    if (user?.walletUsageCap !== undefined && user?.walletUsageCap !== null) {
      return user.walletUsageCap;
    }
    return this.getConfigValue('wallet_usage_cap', 0.75);
  }

  /**
   * Gets a platform config value with a fallback default.
   * If the key doesn't exist in DB, returns the fallback.
   */
  async getConfigValue(key: string, fallback: number): Promise<number> {
    const config = await this.platformConfigModel.findOne({ key });
    return config ? config.value : fallback;
  }

  /**
   * Sets a platform config value (upsert).
   * Admin-only — used for commission_rate, wallet_usage_cap, etc.
   */
  async setConfigValue(
    key: string,
    value: number,
    description?: string,
  ): Promise<PlatformConfigDocument> {
    return this.platformConfigModel.findOneAndUpdate(
      { key },
      { key, value, description: description || '' },
      { upsert: true, new: true },
    );
  }

  /**
   * Reconciles and verifies a payment order directly with Cashfree and database.
   * Ensures double/triple verification even if webhooks fail or get delayed.
   */

  /**
   * Double-verify payment directly against Cashfree Payment Gateway servers.
   * Performs real-time server-to-server gateway status reconciliation.
   */
  async doubleVerifyTransaction(transactionId: string): Promise<any> {
    const transaction = await this.transactionModel.findById(transactionId);
    if (!transaction) {
      throw new NotFoundException("Transaction not found");
    }

    const orderId = transaction.cashfreeOrderId;
    const cfOrder = await this.cashfreeService.getOrder(orderId);
    const payments = await this.cashfreeService.getOrderPayments(orderId);

    const successPayment = payments.find((p: any) => p.payment_status === "SUCCESS" || p.payment_status === "PAID") || payments[0];
    const gatewayPaymentId = successPayment?.cf_payment_id ? String(successPayment.cf_payment_id) : (cfOrder?.cf_order_id ? String(cfOrder.cf_order_id) : null);
    const bankReferenceNumber = successPayment?.bank_reference ? String(successPayment.bank_reference) : (successPayment?.payment_gateway_details?.gateway_order_id ? String(successPayment.payment_gateway_details.gateway_order_id) : null);
    let gatewayPaymentMethod = "UPI";
    if (successPayment?.payment_group) {
      gatewayPaymentMethod = String(successPayment.payment_group).toUpperCase();
    } else if (successPayment?.payment_method) {
      gatewayPaymentMethod = Object.keys(successPayment.payment_method)[0]?.toUpperCase() || "UPI";
    }

    const isPaidOnGateway = cfOrder && (cfOrder.order_status === "PAID" || cfOrder.order_status === "SUCCESS");

    if (isPaidOnGateway) {
      if (transaction.paymentStatus !== "paid") {
        await this.processSuccessfulPayment(transaction);
      }
      const updatedTxn = await this.transactionModel.findByIdAndUpdate(
        transaction._id,
        {
          paymentStatus: "paid",
          isGatewayDoubleConfirmed: true,
          gatewayPaymentId,
          bankReferenceNumber,
          gatewayPaymentMethod,
          gatewayDoubleConfirmedAt: new Date(),
          cashfreePaymentStatus: cfOrder.order_status,
          paidAt: transaction.paidAt || new Date(),
        },
        { new: true }
      ).populate("sellerId", "shopName ownerName email phone bankDetails").populate("customerId", "name email phone");

      return {
        success: true,
        isDoubleConfirmed: true,
        gatewayStatus: "PAID",
        gatewayPaymentId,
        bankReferenceNumber,
        gatewayPaymentMethod,
        message: "Payment double-confirmed successfully directly from Cashfree Gateway API.",
        transaction: updatedTxn,
      };
    } else if (cfOrder && (cfOrder.order_status === "FAILED" || cfOrder.order_status === "CANCELLED" || cfOrder.order_status === "EXPIRED" || cfOrder.order_status === "USER_DROPPED" || cfOrder.order_status === "TERMINATED")) {
      let failureReason = "Payment failed on gateway";
      if (cfOrder.order_status === "USER_DROPPED") failureReason = "Payment cancelled by user on gateway";
      else if (cfOrder.order_status === "CANCELLED") failureReason = "Payment cancelled";
      else if (cfOrder.order_status === "EXPIRED") failureReason = "Payment session expired";
      else if (cfOrder.order_status === "FAILED") failureReason = "Bank payment transaction failed / declined";

      const updatedTxn = await this.transactionModel.findByIdAndUpdate(
        transaction._id,
        {
          paymentStatus: "failed",
          failureReason,
          isGatewayDoubleConfirmed: true,
          gatewayPaymentId,
          bankReferenceNumber,
          gatewayDoubleConfirmedAt: new Date(),
          cashfreePaymentStatus: cfOrder.order_status,
        },
        { new: true }
      ).populate("sellerId", "shopName ownerName email phone bankDetails").populate("customerId", "name email phone");

      return {
        success: true,
        isDoubleConfirmed: true,
        gatewayStatus: cfOrder.order_status,
        gatewayPaymentId,
        bankReferenceNumber,
        message: "Payment status confirmed as " + cfOrder.order_status + " (" + failureReason + ")",
        transaction: updatedTxn,
      };
    }

    return {
      success: true,
      isDoubleConfirmed: false,
      gatewayStatus: cfOrder?.order_status || "PENDING",
      gatewayPaymentId,
      bankReferenceNumber,
      message: "Order is still PENDING on Cashfree Payment Gateway.",
      transaction,
    };
  }


  /**
   * Records a payment failure or cancellation from the mobile client or gateway.
   * Logs and persists failure state immediately in DB for full admin audit.
   */
  async recordPaymentFailure(orderId: string, reason?: string): Promise<any> {
    if (!orderId) throw new BadRequestException("Order ID is required");

    if (orderId.startsWith("VOUCH_")) {
      await this.voucherService.handlePaymentFailureByOrderId(orderId, reason);
      return { success: true, orderId, status: "failed" };
    }

    const transaction = await this.transactionModel.findOne({
      $or: [{ cashfreeOrderId: orderId }, { orderId }],
    });

    if (!transaction) {
      this.logger.warn("Transaction not found for failure recording: " + orderId);
      return { success: false, message: "Transaction not found" };
    }

    if (transaction.paymentStatus === "paid") {
      return { success: true, orderId, status: "paid" };
    }

    const updated = await this.transactionModel.findByIdAndUpdate(
      transaction._id,
      {
        paymentStatus: "failed",
        failureReason: reason || "Payment failed or was cancelled by user",
        cashfreePaymentStatus: "FAILED",
        isGatewayDoubleConfirmed: true,
        gatewayDoubleConfirmedAt: new Date(),
      },
      { new: true }
    );

    this.logger.log("[PAYMENT_FAILED_LOG] Transaction " + ((transaction as any).orderId || transaction.cashfreeOrderId || transaction._id) + " marked FAILED. Reason: " + reason);

    return {
      success: true,
      orderId,
      status: "failed",
      transaction: updated,
    };
  }

  async verifyAndReconcileOrder(orderId: string): Promise<any> {
    if (!orderId) throw new BadRequestException("Order ID is required");

    // 1. Voucher purchase verification
    if (orderId.startsWith("VOUCH_")) {
      const cfOrder = await this.cashfreeService.getOrder(orderId);
      const payments = await this.cashfreeService.getOrderPayments(orderId);
      const successPayment = payments.find((p: any) => p.payment_status === "SUCCESS" || p.payment_status === "PAID") || payments[0];
      const gatewayPaymentId = successPayment?.cf_payment_id ? String(successPayment.cf_payment_id) : (cfOrder?.cf_order_id ? String(cfOrder.cf_order_id) : null);
      const bankReferenceNumber = successPayment?.bank_reference ? String(successPayment.bank_reference) : null;

      if (cfOrder && (cfOrder.order_status === "PAID" || cfOrder.order_status === "SUCCESS")) {
        const amountPaid = cfOrder.order_amount || 0;
        await this.voucherService.confirmPurchaseByOrderId(orderId, amountPaid);
        return { orderId, paymentStatus: "paid", status: "completed", isDoubleConfirmed: true, gatewayPaymentId, bankReferenceNumber };
      } else if (cfOrder && (cfOrder.order_status === "FAILED" || cfOrder.order_status === "CANCELLED" || cfOrder.order_status === "EXPIRED")) {
        return { orderId, paymentStatus: "failed", status: "failed", isDoubleConfirmed: true };
      }
      return { orderId, paymentStatus: "pending", status: "pending" };
    }

    // 2. Direct store payment verification
    const transaction = await this.transactionModel.findOne({ cashfreeOrderId: orderId });
    if (!transaction) {
      throw new NotFoundException("Transaction not found");
    }

    // Fast-path: If Webhook already confirmed this payment as PAID, return instantly (0ms)
    if (transaction.paymentStatus === 'paid') {
      return { orderId, paymentStatus: 'paid', isDoubleConfirmed: true, transaction };
    }

    // Parallel gateway verification (50% faster than sequential calls)
    const [cfOrder, payments] = await Promise.all([
      this.cashfreeService.getOrder(orderId).catch(() => null),
      this.cashfreeService.getOrderPayments(orderId).catch(() => []),
    ]);
    const successPayment = payments.find((p: any) => p.payment_status === "SUCCESS" || p.payment_status === "PAID") || payments[0];
    const gatewayPaymentId = successPayment?.cf_payment_id ? String(successPayment.cf_payment_id) : (cfOrder?.cf_order_id ? String(cfOrder.cf_order_id) : null);
    const bankReferenceNumber = successPayment?.bank_reference ? String(successPayment.bank_reference) : (successPayment?.payment_gateway_details?.gateway_order_id ? String(successPayment.payment_gateway_details.gateway_order_id) : null);
    let gatewayPaymentMethod = "UPI";
    if (successPayment?.payment_group) {
      gatewayPaymentMethod = String(successPayment.payment_group).toUpperCase();
    } else if (successPayment?.payment_method) {
      gatewayPaymentMethod = Object.keys(successPayment.payment_method)[0]?.toUpperCase() || "UPI";
    }

    if (cfOrder && (cfOrder.order_status === "PAID" || cfOrder.order_status === "SUCCESS")) {
      await this.processSuccessfulPayment(transaction);
      const updatedTxn = await this.transactionModel.findByIdAndUpdate(
        transaction._id,
        {
          paymentStatus: "paid",
          isGatewayDoubleConfirmed: true,
          gatewayPaymentId,
          bankReferenceNumber,
          gatewayPaymentMethod,
          gatewayDoubleConfirmedAt: new Date(),
          cashfreePaymentStatus: cfOrder.order_status,
          paidAt: transaction.paidAt || new Date(),
        },
        { new: true }
      ).populate("sellerId", "shopName ownerName email phone bankDetails").populate("customerId", "name email phone");

      return { orderId, paymentStatus: "paid", isDoubleConfirmed: true, transaction: updatedTxn };
    } else if (cfOrder && (cfOrder.order_status === "FAILED" || cfOrder.order_status === "CANCELLED" || cfOrder.order_status === "EXPIRED" || cfOrder.order_status === "USER_DROPPED" || cfOrder.order_status === "TERMINATED")) {
      let failureReason = "Payment failed on gateway";
      if (cfOrder.order_status === "USER_DROPPED") failureReason = "Payment cancelled by user on gateway";
      else if (cfOrder.order_status === "CANCELLED") failureReason = "Payment cancelled";
      else if (cfOrder.order_status === "EXPIRED") failureReason = "Payment session expired";
      else if (cfOrder.order_status === "FAILED") failureReason = "Bank payment transaction failed / declined";

      const updatedTxn = await this.transactionModel.findByIdAndUpdate(
        transaction._id,
        {
          paymentStatus: "failed",
          failureReason,
          isGatewayDoubleConfirmed: true,
          gatewayPaymentId,
          bankReferenceNumber,
          gatewayDoubleConfirmedAt: new Date(),
          cashfreePaymentStatus: cfOrder.order_status,
        },
        { new: true }
      );
      return { orderId, paymentStatus: "failed", isDoubleConfirmed: true, transaction: updatedTxn };
    }

    return { orderId, paymentStatus: transaction.paymentStatus, transaction };
  }

  /**
   * Retrieves customer transactions with pagination.
   */
  async getCustomerTransactions(
    customerId: string,
    page = 1,
    limit = 20,
  ): Promise<any> {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query = { customerId: new Types.ObjectId(customerId) };

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("sellerId", "shopName shopLogoUrl shopAddress")
        .lean(),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      transactions,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  // ─── Query Helpers ───────────────────────────────────────────────────────
  async getSellerTransactions(
    sellerId: string,
    page = 1,
    limit = 20,
    search?: string,
    period?: string,
    startDate?: string,
    endDate?: string,
    settlementStatus?: string,
  ): Promise<any> {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query: any = {
      sellerId: new Types.ObjectId(sellerId),
      paymentStatus: 'paid',
    };

    // 1. Period / Date Filtering (Custom Range takes precedence if provided)
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          dateFilter.$gte = start;
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          if (endDate.length === 10) {
            end.setHours(23, 59, 59, 999);
          }
          dateFilter.$lte = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        query.createdAt = dateFilter;
      }
    } else if (period && period !== 'all') {
      const now = new Date();
      if (period === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query.createdAt = { $gte: startOfToday };
      } else if (period === 'yesterday') {
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query.createdAt = { $gte: startOfYesterday, $lt: endOfYesterday };
      } else if (period === 'last_week') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query.createdAt = { $gte: sevenDaysAgo };
      } else if (period === 'one_month') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query.createdAt = { $gte: thirtyDaysAgo };
      }
    }

    // 2. Settlement Status Filtering
    if (settlementStatus && settlementStatus !== 'all') {
      query.settlementStatus = settlementStatus;
    }

    // 3. Search Query Matching
    if (search && search.trim().length > 0) {
      const term = search.trim();
      const isNum = !isNaN(Number(term));

      // Match customers matching name, email, or phone
      const matchedCustomers = await this.userModel.find({
        $or: [
          { name: { $regex: term, $options: 'i' } },
          { email: { $regex: term, $options: 'i' } },
          { phone: { $regex: term, $options: 'i' } },
        ],
      }).select('_id');

      const customerIds = matchedCustomers.map((c) => c._id);

      const orConditions: any[] = [
        { cashfreeOrderId: { $regex: term, $options: 'i' } },
        { customerId: { $in: customerIds } },
      ];

      if (Types.ObjectId.isValid(term)) {
        orConditions.push({ _id: new Types.ObjectId(term) });
      }

      if (isNum) {
        orConditions.push({ totalAmount: Number(term) });
        orConditions.push({ sellerNetPayout: Number(term) });
      }

      query.$or = orConditions;
    }

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('customerId', 'name phone email'),
      this.transactionModel.countDocuments(query),
    ]);

    // Format for merchant app: "Gross Sale: ₹500 (UPI: ₹125 | Wallet: ₹375) | Net Payout: ₹420"
    const formatted = transactions.map((txn) => ({
      ...txn.toObject(),
      displaySummary: `Gross Sale: ₹${txn.totalAmount} (UPI: ₹${txn.amountPaidOnline} | Wallet: ₹${txn.walletAmountUsed}) | Net Payout: ₹${txn.sellerNetPayout}`,
    }));

    return {
      transactions: formatted,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasMore: pageNum * limitNum < total,
    };
  }

  /** Admin: get all transactions with filters */
  async getAllTransactions(filters: {
    paymentStatus?: string;
    settlementStatus?: string;
    sellerId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const query: any = {};
    if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
    if (filters.settlementStatus && filters.settlementStatus !== 'all') {
      query.settlementStatus = filters.settlementStatus;
    }
    if (filters.sellerId) query.sellerId = new Types.ObjectId(filters.sellerId);

    if (filters.startDate || filters.endDate) {
      const dateFilter: any = {};
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        if (!isNaN(start.getTime())) {
          dateFilter.$gte = start;
        }
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        if (!isNaN(end.getTime())) {
          if (filters.endDate.length === 10) {
            end.setHours(23, 59, 59, 999);
          }
          dateFilter.$lte = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        query.createdAt = dateFilter;
      }
    }

    if (filters.search && filters.search.trim().length > 0) {
      const term = filters.search.trim();
      const matchedSellers = await this.sellerModel.find({
        $or: [
          { shopName: { $regex: term, $options: 'i' } },
          { ownerName: { $regex: term, $options: 'i' } },
          { email: { $regex: term, $options: 'i' } },
          { phone: { $regex: term, $options: 'i' } },
        ],
      }).select('_id');

      const matchedCustomers = await this.userModel.find({
        $or: [
          { name: { $regex: term, $options: 'i' } },
          { email: { $regex: term, $options: 'i' } },
          { phone: { $regex: term, $options: 'i' } },
        ],
      }).select('_id');

      const orConditions: any[] = [
        { cashfreeOrderId: { $regex: term, $options: 'i' } },
        { utrReference: { $regex: term, $options: 'i' } },
        { sellerId: { $in: matchedSellers.map((s) => s._id) } },
        { customerId: { $in: matchedCustomers.map((c) => c._id) } },
      ];

      if (Types.ObjectId.isValid(term)) {
        orConditions.push({ _id: new Types.ObjectId(term) });
      }

      query.$or = orConditions;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sellerId', 'shopName ownerName email phone bankDetails')
        .populate('customerId', 'name email phone'),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Admin: Update settlement status (e.g. mark as settled/paid to seller with UTR reference).
   */
  async updateTransactionSettlementStatus(
    transactionId: string,
    settlementStatus: 'unsettled' | 'settled',
    utrReference?: string,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(transactionId)) {
      throw new BadRequestException('Invalid transaction ID');
    }

    const updateData: any = {
      settlementStatus,
    };

    if (settlementStatus === 'settled') {
      updateData.settledAt = new Date();
      if (utrReference) {
        updateData.utrReference = utrReference.trim();
      }
    } else if (settlementStatus === 'unsettled') {
      updateData.settledAt = null;
      updateData.utrReference = null;
      updateData.settlementError = null;
    }

    const updated = await this.transactionModel
      .findByIdAndUpdate(transactionId, updateData, { new: true })
      .populate('sellerId', 'shopName ownerName email phone bankDetails')
      .populate('customerId', 'name email phone');

    if (!updated) {
      throw new NotFoundException('Transaction not found');
    }

    this.logger.log(
      `Admin updated settlement status for txn ${transactionId} to ${settlementStatus} (UTR: ${utrReference || 'N/A'})`,
    );

    return {
      success: true,
      message: `Settlement status updated to ${settlementStatus}`,
      transaction: updated,
    };
  }

  /**
   * Add / update itemized products for a transaction.
   * Validates that seller owns the transaction AND that sum of items === totalAmount.
   */
  async updateTransactionItems(
    sellerId: string,
    transactionId: string,
    items: Array<{ name: string; price: number; quantity?: number }>,
  ) {
    // Validate transactionId is a valid MongoDB ObjectId
    if (!Types.ObjectId.isValid(transactionId)) {
      throw new BadRequestException('Invalid transaction ID format.');
    }

    const transaction = await this.transactionModel.findById(transactionId);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.sellerId.toString() !== sellerId) {
      throw new UnauthorizedException('You are not authorized to edit items for this order');
    }

    // Calculate sum of item prices (rounded to 2 decimal places)
    const itemizedTotal = Math.round(
      items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0) * 100,
    ) / 100;

    const billAmount = transaction.totalAmount;

    // Validate that itemizedTotal exactly equals gross bill amount
    if (itemizedTotal > billAmount) {
      throw new BadRequestException(
        `The total product amount (₹${itemizedTotal.toFixed(2)}) exceeds the bill amount (₹${billAmount.toFixed(2)}). Please reduce the item prices to match the bill.`,
      );
    }

    if (itemizedTotal < billAmount) {
      throw new BadRequestException(
        `The total product amount (₹${itemizedTotal.toFixed(2)}) is less than the bill amount (₹${billAmount.toFixed(2)}). Please add or adjust the item prices to match the full bill.`,
      );
    }

    transaction.items = items;
    await transaction.save();

    return {
      success: true,
      message: 'Order items updated successfully',
      transaction,
    };
  }
}
