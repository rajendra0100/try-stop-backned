import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bullmq';
import { NotificationService } from '../notification.service';
import { Logger } from '@nestjs/common';

/**
 * NotificationProcessor — consumes jobs from the "notification" BullMQ queue.
 *
 * Currently handles transactional OTP email dispatch asynchronously, keeping HTTP
 * response times sub-50ms for user login trigger requests.
 */
@Processor('notification')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Process('send-otp-email')
  async handleSendOtpEmail(job: Job<{ email: string; otp: string }>) {
    const { email, otp } = job.data;
    this.logger.log(`[Job ${job.id}] Sending OTP email to ${email}`);
    // Call the direct method to perform the actual integration call to Brevo
    await this.notificationService.sendOtpViaEmailDirect(email, otp);
  }
}
