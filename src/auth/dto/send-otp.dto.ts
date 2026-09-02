import { IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Used by both User and Rider OTP flows.
 * Accepts email address OR phone number — service detects type automatically.
 *
 * ── FUTURE MIGRATION ──────────────────────────────────────────────────────
 * When phone OTP (SMS) is ready, no DTO change needed.
 * Only NotificationService.sendOtpViaSms() needs to be added.
 */
export class SendOtpDto {
  @IsNotEmpty({ message: 'Email or phone number is required' })
  @IsString()
  @Transform(({ value }) => value?.toLowerCase().trim())
  identifier: string; // email address or phone number
}
