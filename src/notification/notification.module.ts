import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './processors/notification.processor';

/**
 * NotificationModule — handles all external notifications (email, SMS, push).
 *
 * Currently wires Brevo for transactional email via BullMQ async queue.
 * The 'notification' queue dispatches OTP emails asynchronously so HTTP
 * response times stay sub-50ms for login/OTP endpoints.
 *
 * Future: add SMS provider (Twilio, MSG91) as a second provider here,
 * then inject whichever you need in consuming services.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'notification' }),
  ],
  providers: [NotificationService, NotificationProcessor],
  exports: [NotificationService],
})
export class NotificationModule {}
