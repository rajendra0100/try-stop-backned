import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpDocument = Otp & Document;

/**
 * OTP Schema — stores a one-time password tied to a contact (email or phone).
 * The `expiresAt` field uses a MongoDB TTL index so expired documents are
 * automatically deleted by the database without any cron job.
 *
 * When we switch from email → phone OTP, only the delivery channel changes
 * (in NotificationService). This schema remains identical.
 */
@Schema({ timestamps: true })
export class Otp {
  /** The contact value — currently an email, later will be a phone number */
  @Prop({ required: true, index: true })
  contact: string;

  /** The type of contact — makes future migration from email→phone trivial */
  @Prop({ required: true, enum: ['email', 'phone'], default: 'email' })
  contactType: 'email' | 'phone';

  /** Hashed OTP code — never store plain OTPs */
  @Prop({ required: true })
  hashedOtp: string;

  /** Timestamp when this OTP expires — MongoDB TTL index removes it automatically */
  @Prop({ required: true })
  expiresAt: Date;

  /** Whether this OTP has already been consumed */
  @Prop({ default: false })
  isUsed: boolean;

  /** Rate-limiting: number of verification attempts */
  @Prop({ default: 0 })
  attempts: number;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

// MongoDB TTL index — documents auto-delete after expiresAt
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for fast lookups
OtpSchema.index({ contact: 1, contactType: 1 });
