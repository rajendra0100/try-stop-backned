import {
  IsNotEmpty, IsString, IsOptional, IsIn, IsMongoId, IsObject,
} from 'class-validator';

/**
 * DTO for sending push notifications.
 * Supports single-user and broadcast (via Firebase topic) sends.
 * Admin-only for manual sends; also used internally by PaymentService on success.
 */
export class SendNotificationDto {
  @IsNotEmpty()
  @IsIn(['user', 'seller', 'all'])
  target: 'user' | 'seller' | 'all';

  /** Required when target = "user" or "seller" */
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;

  /** Optional data payload for the notification */
  @IsOptional()
  @IsObject()
  data?: Record<string, string>;
}

/**
 * DTO for registering/updating a device's FCM token.
 * Called on app launch.
 */
export class RegisterFcmTokenDto {
  @IsNotEmpty()
  @IsString()
  fcmToken: string;
}
