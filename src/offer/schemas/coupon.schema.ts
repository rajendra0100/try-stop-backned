import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CouponDocument = Coupon & Document;

/**
 * Coupon Schema — promotional coupon codes.
 *
 * Supports flat and percentage discounts with minimum order value,
 * total usage limits, and per-user limits to prevent abuse.
 */
@Schema({ timestamps: true })
export class Coupon {
  /** Unique coupon code (e.g. "WELCOME50") */
  @Prop({ required: true, uppercase: true })
  code: string;

  @Prop({ required: true, enum: ['flat', 'percent'] })
  discountType: 'flat' | 'percent';

  /** Flat amount or percentage value */
  @Prop({ required: true })
  discountValue: number;

  /** Minimum order value to apply this coupon */
  @Prop({ default: 0 })
  minOrderValue: number;

  /** Maximum discount cap for percentage coupons (null = no cap) */
  @Prop({ type: Number, default: null })
  maxDiscountAmount: number | null;

  @Prop({ required: true })
  validFrom: Date;

  @Prop({ required: true })
  validTill: Date;

  /** Total redemptions allowed across all users (null = unlimited) */
  @Prop({ type: Number, default: null })
  usageLimit: number | null;

  /** Current total usage count */
  @Prop({ default: 0 })
  usageCount: number;

  /** Max redemptions per individual user */
  @Prop({ default: 1 })
  perUserLimit: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);

// ─── Indexes ────────────────────────────────────────────────────────────────
CouponSchema.index({ code: 1 }, { unique: true });
CouponSchema.index({ isActive: 1, validFrom: 1, validTill: 1 });
