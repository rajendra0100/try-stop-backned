import {
  Injectable, Logger, InternalServerErrorException, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as path from 'path';
import * as fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { User, UserDocument } from '../auth/schemas/user.schema';
import { Seller, SellerDocument } from '../auth/schemas/seller.schema';


@Injectable()
export class FcmNotificationService {
  private readonly logger = new Logger(FcmNotificationService.name);
  private firebaseInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    try {
      const rawPath =
        this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH') ||
        'config/firebase-service-account.json';

      const resolvedPath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(process.cwd(), rawPath);

      if (fs.existsSync(resolvedPath)) {
        const serviceAccount = require(resolvedPath);
        initializeApp({
          credential: cert(serviceAccount),
        });
        this.firebaseInitialized = true;
        this.logger.log(`Firebase Admin SDK initialized successfully from ${resolvedPath}`);
      } else {
        this.logger.warn(
          `FIREBASE_SERVICE_ACCOUNT_PATH file not found at ${resolvedPath}. Push notifications will be logged but not sent.`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error?.message);
      this.logger.warn('Push notifications will be logged but not sent.');
    }
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    // 1. Persist in-app notification into User document
    try {
      await this.userModel.findByIdAndUpdate(userId, {
        $push: {
          notifications: {
            $each: [
              {
                title,
                message: body,
                type: data?.type || "general",
                data: data || {},
                isRead: false,
                createdAt: new Date(),
              },
            ],
            $position: 0,
            $slice: 100,
          },
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist in-app notification for user ${userId}: ${err?.message}`);
    }

    // 2. Deliver push notification
    const user = await this.userModel.findById(userId).select('fcmToken name');
    if (!user?.fcmToken) {
      this.logger.warn(`No FCM token for user ${userId} — push notification not sent`);
      return;
    }

    await this.sendToToken(user.fcmToken, title, body, data);
    this.logger.log(`Push notification sent to user ${userId}: "${title}"`);
  }

  async sendToSeller(
    sellerId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    let fcmToken: string | null = null;

    // 1. Check sellerModel by sellerId
    try {
      const seller = await this.sellerModel.findById(sellerId).select("fcmToken phone email shopName");
      if (seller?.fcmToken) {
        fcmToken = seller.fcmToken;
      } else if (seller?.phone || seller?.email) {
        // Fallback: check if User with same phone/email has fcmToken
        const user = await this.userModel.findOne({
          $or: [
            seller.phone ? { phone: seller.phone } : null,
            seller.email ? { email: seller.email } : null,
          ].filter(Boolean) as any,
        }).select("fcmToken");
        if (user?.fcmToken) {
          fcmToken = user.fcmToken;
        }
      }
    } catch (err) {
      this.logger.warn(`Error looking up seller ${sellerId} in sellerModel: ${err?.message}`);
    }

    // 2. Check userModel if sellerId was a User _id or staff member
    if (!fcmToken) {
      try {
        const user = await this.userModel.findById(sellerId).select("fcmToken phone email");
        if (user?.fcmToken) {
          fcmToken = user.fcmToken;
        } else if (user?.phone || user?.email) {
          const matchingSeller = await this.sellerModel.findOne({
            $or: [
              user.phone ? { phone: user.phone } : null,
              user.email ? { email: user.email } : null,
            ].filter(Boolean) as any,
          }).select("fcmToken");
          if (matchingSeller?.fcmToken) {
            fcmToken = matchingSeller.fcmToken;
          }
        }
      } catch (err) {
        this.logger.warn(`Error looking up seller in userModel: ${err?.message}`);
      }
    }

    if (!fcmToken) {
      this.logger.warn(`No FCM token for seller ${sellerId} — notification not sent`);
      return;
    }

    // Persist in-app notification to seller
    try {
      await this.sellerModel.findByIdAndUpdate(sellerId, {
        $push: {
          notifications: {
            $each: [
              {
                title,
                message: body,
                type: data?.type || "general",
                data: data || {},
                isRead: false,
                createdAt: new Date(),
              },
            ],
            $position: 0,
            $slice: 100,
          },
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist in-app notification for seller ${sellerId}: ${err?.message}`);
    }

    await this.sendToToken(fcmToken, title, body, data);
    this.logger.log(`Push notification sent to seller ${sellerId}: "${title}"`);
  }

  async sendToAll(
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    await this.sendToTopic('all_users', title, body, data);
    this.logger.log(`Broadcast notification sent to all_users topic: "${title}"`);
  }

  async sendPaymentSuccessNotifications(params: {
    customerId: string;
    sellerId: string;
    totalAmount: number;
    cashbackEarned: number;
    amountPaidOnline: number;
    walletAmountUsed: number;
    transactionId?: string;
  }): Promise<void> {
    const txnId = params.transactionId ? params.transactionId.toString() : '';

    const hasCashback = params.cashbackEarned && Number(params.cashbackEarned) > 0;
    const customerBody = hasCashback
      ? `Your payment of ₹${params.totalAmount} was successful. You earned ₹${params.cashbackEarned} cashback! 🎉`
      : `Your payment of ₹${params.totalAmount} was successful.`;

    await this.sendToUser(
      params.customerId,
      'Payment Successful! 🎉',
      customerBody,
      {
        type: 'payment_success',
        screen: 'WALLET',
        totalAmount: params.totalAmount.toString(),
        cashbackEarned: hasCashback ? params.cashbackEarned.toString() : '0',
        transactionId: txnId,
        sound: 'payment_received',
      },
    );

    await this.sendToSeller(
      params.sellerId,
      '💰 Payment Received!',
      `Payment of ₹${params.totalAmount} Received Successfully!`,
      {
        type: 'payment_received',
        screen: 'SELLER_ORDERS',
        totalAmount: params.totalAmount.toString(),
        amountOnline: params.amountPaidOnline.toString(),
        walletUsed: params.walletAmountUsed.toString(),
        transactionId: txnId,
        sound: 'payment_received',
      },
    );
  }

  async registerUserToken(userId: string, fcmToken: string): Promise<void> {
    const user = await this.userModel.findByIdAndUpdate(userId, { fcmToken }, { new: true });
    // Also sync to sellerModel if matching phone or email exists
    if (user?.phone || user?.email) {
      await this.sellerModel.updateMany(
        {
          $or: [
            user.phone ? { phone: user.phone } : null,
            user.email ? { email: user.email } : null,
          ].filter(Boolean) as any,
        },
        { fcmToken },
      );
    }

    if (this.firebaseInitialized) {
      try {
        await getMessaging().subscribeToTopic([fcmToken], "all_users");
        this.logger.log(`User ${userId} subscribed to all_users topic`);
      } catch (error) {
        this.logger.error(`Failed to subscribe to topic: ${error?.message}`);
      }
    }
  }

  async registerSellerToken(sellerId: string, fcmToken: string): Promise<void> {
    const seller = await this.sellerModel.findByIdAndUpdate(sellerId, { fcmToken }, { new: true });
    // Also sync to userModel if matching phone or email exists
    if (seller?.phone || seller?.email) {
      await this.userModel.updateMany(
        {
          $or: [
            seller.phone ? { phone: seller.phone } : null,
            seller.email ? { email: seller.email } : null,
          ].filter(Boolean) as any,
        },
        { fcmToken },
      );
    } else {
      // In case sellerId was stored as user _id
      await this.userModel.findByIdAndUpdate(sellerId, { fcmToken });
    }

    if (this.firebaseInitialized) {
      try {
        await getMessaging().subscribeToTopic([fcmToken], "all_sellers");
        this.logger.log(`Seller ${sellerId} subscribed to all_sellers topic`);
      } catch (error) {
        this.logger.error(`Failed to subscribe seller to topic: ${error?.message}`);
      }
    }
  }

  private async sendToToken(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.firebaseInitialized) {
      this.logger.log(`[DEV] Would send push to token: "${title}" — "${body}"`);
      return;
    }

    try {
      await getMessaging().send({
        token,
        notification: { title, body },
        data: data || {},
        android: {
          priority: 'high',
          notification: {
            sound: data?.sound || 'default',
            channelId: 'trystop_payments',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: data?.sound ? (data.sound.includes('.') ? data.sound : `${data.sound}.wav`) : 'default',
              badge: 1,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send push notification: ${error?.message}`);
    }
  }
  
  private async sendToTopic(
    topic: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.firebaseInitialized) {
      this.logger.log(`[DEV] Would send broadcast to topic "${topic}": "${title}" — "${body}"`);
      return;
    }

    try {
      await getMessaging().send({
        topic,
        notification: { title, body },
        data: data || {},
        android: { priority: 'high' },
      });
    } catch (error) {
      this.logger.error(`Failed to send topic notification: ${error?.message}`);
    }
  }
  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const user = await this.userModel.findById(userId).select("notifications");
    if (!user) throw new NotFoundException("User not found");

    const allNotifications = (user as any).notifications || [];
    const sorted = [...allNotifications].sort((a: any, b: any) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 20);
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedItems = sorted.slice(startIndex, startIndex + limitNum);
    const total = sorted.length;
    const totalPages = Math.ceil(total / limitNum);
    const hasMore = pageNum < totalPages;
    const unreadCount = sorted.filter((n: any) => !n.isRead).length;

    return {
      notifications: paginatedItems,
      total,
      unreadCount,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasMore,
    };
  }

  async markUserNotificationRead(userId: string, notificationId?: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException("User not found");

    if (notificationId) {
      (user as any).notifications = ((user as any).notifications || []).map((n: any) =>
        n._id?.toString() === notificationId || n.id === notificationId
          ? { ...n, isRead: true }
          : n,
      );
    } else {
      (user as any).notifications = ((user as any).notifications || []).map((n: any) => ({
        ...n,
        isRead: true,
      }));
    }

    user.markModified("notifications");
    await user.save();
    return { success: true, message: "Notifications marked as read" };
  }
}
