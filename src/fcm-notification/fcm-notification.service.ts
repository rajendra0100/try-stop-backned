import {
  Injectable, Logger, InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { initializeApp, cert } from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';

import { User, UserDocument } from '../auth/schemas/user.schema';
import { Seller, SellerDocument } from '../auth/schemas/seller.schema';

/**
 * FcmNotificationService — Firebase Cloud Messaging push notification wrapper.
 *
 * Provides a generic send() method used both:
 *   - Automatically on payment success (customer + seller notifications)
 *   - Manually by admin for broadcast/targeted sends
 *
 * For "all users" broadcasts, uses Firebase topics (all_users topic)
 * instead of looping through individual FCM tokens — faster and scalable.
 *
 * Uses a placeholder/dummy Firebase service account in dev/sandbox.
 * Swapping to production is a config change only (FIREBASE_SERVICE_ACCOUNT_PATH).
 */
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

  /**
   * Initializes Firebase Admin SDK.
   * Uses service account from env config. Falls back gracefully if not configured.
   */
  private initializeFirebase(): void {
    try {
      const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

      if (serviceAccountPath) {
        const serviceAccount = require(serviceAccountPath);
        initializeApp({
          credential: cert(serviceAccount),
        });
      } else {
        // Placeholder initialization for development/sandbox
        // In production, set FIREBASE_SERVICE_ACCOUNT_PATH in .env
        this.logger.warn(
          'FIREBASE_SERVICE_ACCOUNT_PATH not configured. Push notifications will be logged but not sent.',
        );
        return;
      }

      this.firebaseInitialized = true;
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error?.message);
      this.logger.warn('Push notifications will be logged but not sent.');
    }
  }

  // ─── Core Send Methods ────────────────────────────────────────────────────

  /**
   * Sends a push notification to a single user by userId.
   * Looks up the user's FCM token from their profile.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).select('fcmToken name');
    if (!user?.fcmToken) {
      this.logger.warn(`No FCM token for user ${userId} — notification not sent`);
      return;
    }

    await this.sendToToken(user.fcmToken, title, body, data);
    this.logger.log(`Push notification sent to user ${userId}: "${title}"`);
  }

  /**
   * Sends a push notification to a seller by sellerId.
   * Uses the seller's FCM token from their profile.
   */
  async sendToSeller(
    sellerId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const seller = await this.sellerModel.findById(sellerId).select('fcmToken shopName');
    if (!seller?.fcmToken) {
      this.logger.warn(`No FCM token for seller ${sellerId} — notification not sent`);
      return;
    }

    await this.sendToToken(seller.fcmToken, title, body, data);
    this.logger.log(`Push notification sent to seller ${sellerId}: "${title}"`);
  }

  /**
   * Sends a broadcast notification to all users via Firebase topic.
   * Devices subscribe to "all_users" topic on app launch.
   */
  async sendToAll(
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    await this.sendToTopic('all_users', title, body, data);
    this.logger.log(`Broadcast notification sent to all_users topic: "${title}"`);
  }

  // ─── Payment Success Notifications (§5) ──────────────────────────────────

  /**
   * Sends payment success notifications to both customer and seller.
   * Called automatically from the payment events queue processor.
   *
   * Customer: "Payment successful, you earned ₹X cashback"
   * Seller: "Payment of ₹X Received Successfully!" (with loud sound)
   */
  async sendPaymentSuccessNotifications(params: {
    customerId: string;
    sellerId: string;
    totalAmount: number;
    cashbackEarned: number;
    amountPaidOnline: number;
    walletAmountUsed: number;
  }): Promise<void> {
    // Customer notification
    await this.sendToUser(
      params.customerId,
      'Payment Successful! 🎉',
      `Your payment of ₹${params.totalAmount} was successful. You earned ₹${params.cashbackEarned} cashback!`,
      {
        type: 'payment_success',
        totalAmount: params.totalAmount.toString(),
        cashbackEarned: params.cashbackEarned.toString(),
      },
    );

    // Seller notification (with loud sound — handled by client app using 'sound' field)
    await this.sendToSeller(
      params.sellerId,
      '💰 Payment Received!',
      `Payment of ₹${params.totalAmount} Received Successfully!`,
      {
        type: 'payment_received',
        totalAmount: params.totalAmount.toString(),
        amountOnline: params.amountPaidOnline.toString(),
        walletUsed: params.walletAmountUsed.toString(),
        sound: 'payment_received', // Client handles the loud notification sound
      },
    );
  }

  // ─── FCM Token Management ──────────────────────────────────────────────────

  /**
   * Registers or updates a user's FCM token.
   * Called on every app launch to keep tokens fresh.
   * Also subscribes the device to the "all_users" topic.
   */
  async registerUserToken(userId: string, fcmToken: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { fcmToken });

    // Subscribe to all_users topic for broadcast notifications
    if (this.firebaseInitialized) {
      try {
        await getMessaging().subscribeToTopic([fcmToken], 'all_users');
        this.logger.log(`User ${userId} subscribed to all_users topic`);
      } catch (error) {
        this.logger.error(`Failed to subscribe to topic: ${error?.message}`);
      }
    }
  }

  /**
   * Registers or updates a seller's FCM token.
   */
  async registerSellerToken(sellerId: string, fcmToken: string): Promise<void> {
    await this.sellerModel.findByIdAndUpdate(sellerId, { fcmToken });

    if (this.firebaseInitialized) {
      try {
        await getMessaging().subscribeToTopic([fcmToken], 'all_sellers');
      } catch (error) {
        this.logger.error(`Failed to subscribe seller to topic: ${error?.message}`);
      }
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Sends a notification to a specific FCM token.
   */
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
              sound: data?.sound || 'default',
              badge: 1,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send push notification: ${error?.message}`);
      // Don't throw — notification failure should never block the caller
    }
  }

  /**
   * Sends a notification to a Firebase topic.
   */
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
}
