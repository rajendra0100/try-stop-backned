import {
  Controller, Post, Get, Body, Param, UseGuards,
} from '@nestjs/common';
import { FcmNotificationService } from './fcm-notification.service';
import { SendNotificationDto, RegisterFcmTokenDto } from './dto/notification.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/guards/permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';

/**
 * FcmNotificationController — push notification endpoints.
 *
 * Route access summary:
 *   POST /notifications/send            — admin — manual/broadcast push notification
 *   POST /notifications/register-token  — auth (USER/SELLER) — register FCM token on app launch
 */
@Controller('notifications')
export class FcmNotificationController {
  constructor(
    private readonly fcmNotificationService: FcmNotificationService,
  ) {}

  /**
   * POST /notifications/send
   * Admin-only route for manual/broadcast push notifications.
   * Supports sending to a single user, a single seller, or all users (via topic).
   */
  @Post('send')
  @RequirePermission('manage_notifications')
  async send(@Body() dto: SendNotificationDto) {
    if (dto.target === 'user') {
      if (!dto.userId) return { error: 'userId required for user target' };
      await this.fcmNotificationService.sendToUser(dto.userId, dto.title, dto.body, dto.data);
      return { message: `Notification sent to user ${dto.userId}` };
    }

    if (dto.target === 'seller') {
      if (!dto.userId) return { error: 'userId (sellerId) required for seller target' };
      await this.fcmNotificationService.sendToSeller(dto.userId, dto.title, dto.body, dto.data);
      return { message: `Notification sent to seller ${dto.userId}` };
    }

    // target = 'all' — broadcast via Firebase topic
    await this.fcmNotificationService.sendToAll(dto.title, dto.body, dto.data);
    return { message: 'Broadcast notification sent to all users' };
  }

  /**
   * POST /notifications/register-token
   * Called on every app launch to register/update the device's FCM token.
   * Also subscribes the device to the "all_users" or "all_sellers" topic.
   * AUTH required — USER or SELLER.
   */
  @Post('register-token')
  @UseGuards(JwtAuthGuard)
  async registerToken(@CurrentUser() user: any, @Body() dto: RegisterFcmTokenDto) {
    if (user.role === Role.SELLER) {
      await this.fcmNotificationService.registerSellerToken(user._id.toString(), dto.fcmToken);
    } else {
      await this.fcmNotificationService.registerUserToken(user._id.toString(), dto.fcmToken);
    }
    return { message: 'FCM token registered successfully' };
  }
}
