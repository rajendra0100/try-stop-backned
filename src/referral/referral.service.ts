import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Referral, ReferralDocument } from './schemas/referral.schema';
import { ReferralConfig, ReferralConfigDocument } from './schemas/referral-config.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { WalletService } from '../wallet/wallet.service';
import { FcmNotificationService } from '../fcm-notification/fcm-notification.service';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectModel(Referral.name) private readonly referralModel: Model<ReferralDocument>,
    @InjectModel(ReferralConfig.name) private readonly referralConfigModel: Model<ReferralConfigDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => FcmNotificationService))
    private readonly fcmNotificationService: FcmNotificationService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Links a referee user to their referrer.
   * Creates a 'pending' Referral document and updates the referee's referredBy cache.
   */
  async linkReferral(refereeId: string, referrerId: string): Promise<ReferralDocument> {
    if (refereeId === referrerId) {
      throw new BadRequestException('You cannot refer yourself.');
    }

    const referee = await this.userModel.findById(refereeId);
    if (!referee) {
      throw new NotFoundException('Referee user not found.');
    }

    if (referee.referredBy) {
      throw new ConflictException('You have already been referred by another user.');
    }

    const referrer = await this.userModel.findById(referrerId);
    if (!referrer) {
      throw new NotFoundException('Referrer user not found.');
    }

    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      // 1. Create Pending Referral
      const referral = await this.referralModel.create(
        [{
          referrerId: new Types.ObjectId(referrerId),
          refereeId: new Types.ObjectId(refereeId),
          status: 'pending',
          rewardAmount: 0,
        }],
        { session },
      );

      // 2. Set referredBy cache on referee User
      await this.userModel.findByIdAndUpdate(
        refereeId,
        { referredBy: new Types.ObjectId(referrerId) },
        { session },
      );

      await session.commitTransaction();
      this.logger.log(`Linked referee ${refereeId} to referrer ${referrerId}`);
      return referral[0];
    } catch (err) {
      await session.abortTransaction();
      this.logger.error(`Linking referral failed: ${err?.message}`);
      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * Retrieves the active referral configuration.
   * If none exists, creates a default config.
   */
  async getActiveConfig(): Promise<ReferralConfigDocument> {
    let config = await this.referralConfigModel.findOne();
    if (!config) {
      config = await this.referralConfigModel.create({
        rewardType: 'fixed',
        rewardValue: 50,
        bannerImageUrl: '',
      });
    }
    return config;
  }

  /**
   * Saves or updates the referral configuration.
   */
  async saveConfig(dto: { rewardType?: 'fixed' | 'percentage'; rewardValue?: number; bannerImageUrl?: string; appVersion?: string }): Promise<ReferralConfigDocument> {
    let config = await this.referralConfigModel.findOne();
    if (!config) {
      config = await this.referralConfigModel.create({
        rewardType: dto.rewardType || 'fixed',
        rewardValue: dto.rewardValue ?? 50,
        bannerImageUrl: dto.bannerImageUrl || '',
        appVersion: dto.appVersion || '1.0.0',
      });
    } else {
      if (dto.rewardType) config.rewardType = dto.rewardType;
      if (dto.rewardValue !== undefined) config.rewardValue = dto.rewardValue;
      if (dto.bannerImageUrl !== undefined) config.bannerImageUrl = dto.bannerImageUrl;
      if (dto.appVersion !== undefined) config.appVersion = dto.appVersion;
      await config.save();
    }
    return config;
  }

  /**
   * Process payout once referee pays successfully for the first time.
   */
  async processReferralReward(refereeId: string, purchaseAmount: number, transactionId: string): Promise<void> {
    const referee = await this.userModel.findById(refereeId).select('referredBy');
    if (!referee || !referee.referredBy) {
      return; // Not referred by anyone
    }

    // Check if there is a pending referral record
    const referral = await this.referralModel.findOne({
      refereeId: new Types.ObjectId(refereeId),
      status: 'pending',
    });

    if (!referral) {
      return; // Already rewarded or no pending invitation record exists
    }

    const config = await this.getActiveConfig();
    let rewardAmount = 0;

    if (config.rewardType === 'fixed') {
      rewardAmount = config.rewardValue;
    } else if (config.rewardType === 'percentage') {
      rewardAmount = Math.round(purchaseAmount * (config.rewardValue / 100));
    }

    if (rewardAmount <= 0) {
      return;
    }

    const referrerId = referee.referredBy.toString();
    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      // 1. Credit Referrer wallet
      await this.walletService.creditReferralReward(
        referrerId,
        rewardAmount,
        transactionId,
        `Referral reward for referee first order`,
      );

      // 2. Mark invite completed
      referral.status = 'completed';
      referral.rewardAmount = rewardAmount;
      referral.firstPurchaseTransactionId = new Types.ObjectId(transactionId);
      referral.firstPurchaseAmount = purchaseAmount;
      await referral.save({ session });

      await session.commitTransaction();
      this.logger.log(`Rewarded referrer ${referrerId} with ₹${rewardAmount} for referee ${refereeId} checkout`);

      // 3. Send Notification to referrer asynchronously
      try {
        await this.fcmNotificationService.sendToUser(
          referrerId,
          'Referral Reward Credited! 🎉',
          `Congratulations! You earned ₹${rewardAmount} cashback because your friend made their first purchase.`,
          { type: 'referral_completed', rewardAmount: rewardAmount.toString() },
        );
      } catch (fcmErr) {
        this.logger.warn(`Could not send referral success notification to user ${referrerId}: ${fcmErr?.message}`);
      }
    } catch (err) {
      await session.abortTransaction();
      this.logger.error(`Processing referral payout failed: ${err?.message}`);
    } finally {
      session.endSession();
    }
  }

  /**
   * Retrieves global statistics of shares/referrals for all referrers.
   */
  async getAdminStats(): Promise<any[]> {
    const stats = await this.referralModel.aggregate([
      {
        $group: {
          _id: '$referrerId',
          totalReferred: { $sum: 1 },
          completedReferred: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          totalCashbackEarned: { $sum: '$rewardAmount' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'referrer',
        },
      },
      { $unwind: '$referrer' },
      {
        $project: {
          _id: 1,
          totalReferred: 1,
          completedReferred: 1,
          totalCashbackEarned: 1,
          name: '$referrer.name',
          phone: '$referrer.phone',
          email: '$referrer.email',
        },
      },
    ]);
    return stats;
  }

  /**
   * Retrieves referee list for a specific referrer.
   */
  async getUserReferrals(referrerId: string): Promise<any[]> {
    const invites = await this.referralModel.aggregate([
      { $match: { referrerId: new Types.ObjectId(referrerId) } },
      {
        $lookup: {
          from: 'users',
          localField: 'refereeId',
          foreignField: '_id',
          as: 'referee',
        },
      },
      { $unwind: '$referee' },
      {
        $project: {
          _id: 1,
          status: 1,
          rewardAmount: 1,
          createdAt: 1,
          firstPurchaseAmount: 1,
          name: '$referee.name',
          phone: '$referee.phone',
          email: '$referee.email',
        },
      },
    ]);
    return invites;
  }
}
