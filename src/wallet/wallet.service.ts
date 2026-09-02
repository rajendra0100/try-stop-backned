import {
  Injectable, Logger, BadRequestException, NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';

import { WalletTransaction, WalletTransactionDocument } from './schemas/wallet-transaction.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';

// ─── Response shape interfaces ──────────────────────────────────────────────

export interface SystemWalletMetrics {
  totalLiability: number;
  totalUsers: number;
  totalCredits: number;
  totalCreditsCount: number;
  totalDebits: number;
  totalDebitsCount: number;
}

/**
 * WalletService — manages the wallet ledger and balance operations.
 *
 * Key design:
 *   - Every operation writes to the wallet_transactions ledger first
 *   - User.walletBalance is updated atomically in the same DB operation
 *   - The ledger is the source of truth; walletBalance is a read-optimization cache
 *   - Cashback is calculated ONLY on the real-money portion (§3.2)
 *   - Prevents double-crediting via relatedTransactionId + reason uniqueness check
 *
 * Callable by: PaymentService (on successful payment), Admin (manual credits)
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectModel(WalletTransaction.name) private readonly walletTxnModel: Model<WalletTransactionDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ─── Credit Operations ──────────────────────────────────────────────────────

  /**
   * Credits cashback to a customer's wallet after a successful payment.
   *
   * Cashback is calculated ONLY on amountPaidOnline (real money),
   * NOT on the wallet-covered portion — prevents infinite cashback loop (§3.2).
   *
   * Idempotent: checks if cashback for this transaction was already credited
   * (via relatedTransactionId + reason = 'cashback').
   */
  async creditCashback(
    userId: string,
    amount: number,
    relatedTransactionId: string,
  ): Promise<WalletTransactionDocument | null> {
    if (amount <= 0) {
      this.logger.log(`Skipping zero cashback for user ${userId}`);
      return null;
    }

    // Idempotency: don't double-credit cashback for the same transaction
    const existing = await this.walletTxnModel.findOne({
      relatedTransactionId: new Types.ObjectId(relatedTransactionId),
      reason: 'cashback',
    });
    if (existing) {
      this.logger.warn(`Cashback already credited for transaction ${relatedTransactionId} — skipping`);
      return existing;
    }

    return this.creditWallet(userId, amount, 'cashback', relatedTransactionId);
  }

  /**
   * Credit referral reward — adds referral invite rewards to the referrer's wallet.
   */
  async creditReferralReward(
    userId: string,
    amount: number,
    relatedTransactionId: string | null,
    note?: string,
  ): Promise<WalletTransactionDocument> {
    return this.creditWallet(userId, amount, 'referral_reward', relatedTransactionId, note);
  }

  /**
   * Admin credit — adds funds to a user's wallet.
   * Used for promotional credits, refunds, or compensation.
   */
  async adminCredit(
    userId: string,
    amount: number,
    reason: 'admin_credit' | 'promo_credit' = 'admin_credit',
    note?: string,
  ): Promise<WalletTransactionDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.creditWallet(userId, amount, reason, null, note);
  }

  /**
   * Broadcast credit — credits all active users.
   * Runs as a background operation (called from the queue processor).
   */
  async broadcastCredit(
    amount: number,
    reason: 'admin_credit' | 'promo_credit' = 'promo_credit',
    note?: string,
  ): Promise<{ credited: number; failed: number }> {
    const users = await this.userModel.find({}).select('_id');
    let credited = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await this.creditWallet(user._id.toString(), amount, reason, null, note);
        credited++;
      } catch (error) {
        failed++;
        this.logger.error(`Broadcast credit failed for user ${user._id}: ${error?.message}`);
      }
    }

    this.logger.log(`Broadcast credit complete: ${credited} credited, ${failed} failed`);
    return { credited, failed };
  }

  // ─── Debit Operations ──────────────────────────────────────────────────────

  /**
   * Debits a wallet redemption when a customer uses wallet balance for a payment.
   *
   * Idempotent: checks if debit for this transaction was already done.
   */
  async debitForPayment(
    userId: string,
    amount: number,
    relatedTransactionId: string,
  ): Promise<WalletTransactionDocument | null> {
    if (amount <= 0) return null;

    // Idempotency: don't double-debit for the same transaction
    const existing = await this.walletTxnModel.findOne({
      relatedTransactionId: new Types.ObjectId(relatedTransactionId),
      reason: 'wallet_redemption',
    });
    if (existing) {
      this.logger.warn(`Wallet debit already done for transaction ${relatedTransactionId} — skipping`);
      return existing;
    }

    // Check balance
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.walletBalance < amount) {
      throw new BadRequestException(`Insufficient wallet balance. Available: ₹${user.walletBalance}`);
    }

    return this.debitWallet(userId, amount, 'wallet_redemption', relatedTransactionId);
  }

  // ─── Core Wallet Operations (private, atomic) ────────────────────────────

  /**
   * Atomic credit: writes ledger entry + increments walletBalance in one operation.
   */
  private async creditWallet(
    userId: string,
    amount: number,
    reason: 'cashback' | 'admin_credit' | 'promo_credit' | 'referral_reward',
    relatedTransactionId: string | null,
    note?: string,
  ): Promise<WalletTransactionDocument> {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      const ledgerEntry = await this.walletTxnModel.create(
        [{
          userId: new Types.ObjectId(userId),
          type: 'credit',
          amount,
          reason,
          relatedTransactionId: relatedTransactionId
            ? new Types.ObjectId(relatedTransactionId)
            : null,
          note: note || null,
        }],
        { session },
      );

      await this.userModel.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: amount } },
        { session },
      );

      await session.commitTransaction();
      this.logger.log(`Wallet credited: ₹${amount} → user ${userId} (${reason})`);
      return ledgerEntry[0];
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(`Wallet credit failed for user ${userId}: ${error?.message}`);
      throw new InternalServerErrorException('Wallet credit operation failed');
    } finally {
      session.endSession();
    }
  }

  /**
   * Atomic debit: writes ledger entry + decrements walletBalance in one operation.
   */
  private async debitWallet(
    userId: string,
    amount: number,
    reason: 'wallet_redemption',
    relatedTransactionId: string | null,
  ): Promise<WalletTransactionDocument> {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      const ledgerEntry = await this.walletTxnModel.create(
        [{
          userId: new Types.ObjectId(userId),
          type: 'debit',
          amount,
          reason,
          relatedTransactionId: relatedTransactionId
            ? new Types.ObjectId(relatedTransactionId)
            : null,
        }],
        { session },
      );

      await this.userModel.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: -amount } },
        { session },
      );

      await session.commitTransaction();
      this.logger.log(`Wallet debited: ₹${amount} ← user ${userId} (${reason})`);
      return ledgerEntry[0];
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(`Wallet debit failed for user ${userId}: ${error?.message}`);
      throw new InternalServerErrorException('Wallet debit operation failed');
    } finally {
      session.endSession();
    }
  }

  // ─── Query Helpers ──────────────────────────────────────────────────────────

  /** Get user's wallet balance (fast read from cached field) */
  async getBalance(userId: string): Promise<{ balance: number; voucherBalance: number; walletUsageCap: number | null }> {
    const user = await this.userModel.findById(userId).select('walletBalance voucherBalance walletUsageCap');
    if (!user) throw new NotFoundException('User not found');
    return {
      balance: user.walletBalance,
      voucherBalance: user.voucherBalance ?? 0,
      walletUsageCap: user.walletUsageCap,
    };
  }

  /** Get user's wallet transaction history (paginated) */
  async getHistory(userId: string, page = 1, limit = 20): Promise<any> {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      this.walletTxnModel
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.walletTxnModel.countDocuments({ userId: new Types.ObjectId(userId) }),
    ]);
    return { transactions, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Admin: Get total outstanding wallet balance and system liability metrics.
   */
  async getSystemWalletMetrics(): Promise<SystemWalletMetrics> {
    const aggregate = await this.userModel.aggregate([
      { $group: { _id: null, totalLiability: { $sum: '$walletBalance' }, userCount: { $sum: 1 } } }
    ]);

    const totalLiability = aggregate.length > 0 ? aggregate[0].totalLiability : 0;
    const totalUsers = aggregate.length > 0 ? aggregate[0].userCount : 0;

    const txnsSummary = await this.walletTxnModel.aggregate([
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const credits = txnsSummary.find((t) => t._id === 'credit');
    const debits = txnsSummary.find((t) => t._id === 'debit');

    return {
      totalLiability,
      totalUsers,
      totalCredits: credits?.totalAmount || 0,
      totalCreditsCount: credits?.count || 0,
      totalDebits: debits?.totalAmount || 0,
      totalDebitsCount: debits?.count || 0,
    };
  }
}
