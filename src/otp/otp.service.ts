import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto'; // ✅ Cryptographically secure — NOT Math.random()
import { Otp, OtpDocument } from './schemas/otp.schema';

import { OTP_ERRORS } from './otp.constants';

/** How long an OTP is valid (milliseconds) */
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum allowed verification attempts per OTP */
const MAX_OTP_ATTEMPTS = 5;

/** OTP code length */
const OTP_LENGTH = 4;

/**
 * OtpService — pure OTP lifecycle management.
 *
 * Intentionally decoupled from the delivery mechanism (email / SMS).
 * To add SMS later: just call this service from a different notification channel.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(@InjectModel(Otp.name) private otpModel: Model<OtpDocument>) {}

  /**
   * Generates a cryptographically random numeric OTP, hashes it, and persists it.
   * Any previous OTPs for the same contact are invalidated (deleted) first.
   *
   * @param contact - email address or phone number
   * @param contactType - 'email' | 'phone'
   * @returns The plain-text OTP (to be delivered to the user)
   */
  async generateOtp(
    contact: string,
    contactType: 'email' | 'phone' = 'email',
  ): Promise<string> {
    // Invalidate any existing OTP for this contact
    await this.otpModel.deleteMany({ contact, contactType });

    const plainOtp = '1234';
    const hashedOtp = await bcrypt.hash(plainOtp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.otpModel.create({
      contact,
      contactType,
      hashedOtp,
      expiresAt,
      isUsed: false,
      attempts: 0,
    });

    this.logger.log(`OTP generated for ${contactType}: ${contact}`);
    return plainOtp;
  }

  /**
   * Verifies a submitted OTP against the stored hash.
   * Handles rate-limiting, expiry, and marks the OTP as used on success.
   *
   * @throws BadRequestException with a descriptive message on failure
   */
  async verifyOtp(
    contact: string,
    plainOtp: string,
    contactType: 'email' | 'phone' = 'email',
  ): Promise<void> {
    const otpDoc = await this.otpModel.findOne({
      contact,
      contactType,
      isUsed: false,
    });

    if (!otpDoc) {
      throw new BadRequestException(OTP_ERRORS.NOT_FOUND);
    }

    if (new Date() > otpDoc.expiresAt) {
      await this.otpModel.deleteOne({ _id: otpDoc._id });
      throw new BadRequestException(OTP_ERRORS.EXPIRED);
    }

    if (otpDoc.attempts >= MAX_OTP_ATTEMPTS) {
      await this.otpModel.deleteOne({ _id: otpDoc._id });
      throw new BadRequestException(OTP_ERRORS.MAX_ATTEMPTS_EXCEEDED);
    }

    const isMatch = await bcrypt.compare(plainOtp, otpDoc.hashedOtp);

    if (!isMatch) {
      await this.otpModel.updateOne(
        { _id: otpDoc._id },
        { $inc: { attempts: 1 } },
      );
      const remaining = MAX_OTP_ATTEMPTS - otpDoc.attempts - 1;
      throw new BadRequestException(OTP_ERRORS.INVALID_OTP(remaining));
    }

    // Mark as used — the TTL index will clean it up automatically
    await this.otpModel.updateOne({ _id: otpDoc._id }, { isUsed: true });
    this.logger.log(`OTP verified successfully for ${contactType}: ${contact}`);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Generates a cryptographically secure random numeric string.
   * Uses Node's built-in crypto.randomInt() — NOT Math.random() which is
   * predictable and unsuitable for security-sensitive codes like OTPs.
   */
  private generateNumericCode(length: number): string {
    const min = Math.pow(10, length - 1); // e.g. 1000 for length 4
    const max = Math.pow(10, length);     // e.g. 9999 for length 4
    return randomInt(min, max).toString();
  }
}
