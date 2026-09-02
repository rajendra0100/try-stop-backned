import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FcmNotificationController } from './fcm-notification.controller';
import { FcmNotificationService } from './fcm-notification.service';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Seller, SellerSchema } from '../auth/schemas/seller.schema';

/**
 * FcmNotificationModule — Firebase Cloud Messaging push notifications.
 *
 * Provides a generic notification service used:
 *   - Automatically on payment success (customer + seller alerts)
 *   - Manually by admin for broadcast/targeted sends
 *
 * Uses Firebase topics for efficient broadcast delivery.
 * Gracefully degrades in dev mode when Firebase isn't configured.
 *
 * IMPORTANT: This is separate from the existing NotificationModule (Brevo email).
 * That module handles email OTP; this handles push notifications.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Seller.name, schema: SellerSchema },
    ]),
  ],
  controllers: [FcmNotificationController],
  providers: [FcmNotificationService],
  exports: [FcmNotificationService],
})
export class FcmNotificationModule {}
