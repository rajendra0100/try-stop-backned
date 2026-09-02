import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { BrevoClient } from '@getbrevo/brevo';

/**
 * NotificationService — abstraction layer over delivery channels.
 *
 * Currently uses Brevo (formerly Sendinblue) to deliver OTP via email.
 * Uses BullMQ queue to perform transactional OTP email dispatch asynchronously.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly brevo: BrevoClient;
  private readonly senderEmail: string;
  private readonly senderName: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('notification') private readonly notificationQueue: Queue,
  ) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'BREVO_API_KEY is not configured. Email notifications will not work.',
      );
    }

    // Initialize the new Brevo SDK
    this.brevo = new BrevoClient({ apiKey });

    this.senderEmail =
      this.configService.get<string>('BREVO_SENDER_EMAIL') ?? 'no-reply@trystop.com';
    this.senderName =
      this.configService.get<string>('BREVO_SENDER_NAME') ?? 'TryStop';
  }

  /**
   * Enqueues an OTP dispatch job into the "notification" queue.
   * This keeps the response time of OTP request endpoints extremely low.
   */
  async sendOtpViaEmail(email: string, otp: string): Promise<void> {
    try {
      await this.notificationQueue.add('send-otp-email', { email, otp });
      this.logger.log(`Queued OTP email job for: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to queue OTP email for ${email}`, error?.message);
      // Fallback: send directly if queueing fails (so user isn't stuck)
      await this.sendOtpViaEmailDirect(email, otp);
    }
  }

  /**
   * Performs the actual direct integration call to Brevo.
   * Called by the queue processor.
   */
  async sendOtpViaEmailDirect(email: string, otp: string): Promise<void> {
    try {
      await this.brevo.transactionalEmails.sendTransacEmail({
        sender: { email: this.senderEmail, name: this.senderName },
        to: [{ email }],
        subject: 'Your TryStop Verification Code',
        htmlContent: this.buildOtpEmailTemplate(otp),
        textContent: `Your TryStop verification code is: ${otp}. It expires in 5 minutes. Do not share this code with anyone.`,
      });

      this.logger.log(`OTP email sent directly to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email directly to ${email}`, error?.message);
      throw new InternalServerErrorException(
        'Failed to send OTP. Please try again shortly.',
      );
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private buildOtpEmailTemplate(otp: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>OTP Verification</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background:#1a1a2e;padding:24px 32px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:1px;">TryStop</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px 32px;text-align:center;">
                    <p style="margin:0 0 8px;color:#555;font-size:15px;">Your verification code is</p>
                    <div style="display:inline-block;margin:16px 0;padding:16px 40px;background:#f0f0ff;border-radius:8px;border:2px dashed #6c63ff;">
                      <span style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#1a1a2e;">${otp}</span>
                    </div>
                    <p style="margin:8px 0 0;color:#888;font-size:13px;">⏱ This code expires in <strong>5 minutes</strong>.</p>
                    <p style="margin:24px 0 0;color:#aaa;font-size:12px;">If you did not request this, please ignore this email.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 32px;background:#f9f9f9;text-align:center;">
                    <p style="margin:0;color:#ccc;font-size:11px;">&copy; ${new Date().getFullYear()} TryStop. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }
}
