import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CouponUsageDocument = CouponUsage & Document;

/**
 * CouponUsage Schema — tracks per-user coupon redemptions.
 *
 * Used to enforce the perUserLimit field on coupons.
 * One record per user-coupon pair, incremented on each use.
 */
@Schema({ timestamps: true })
export class CouponUsage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Coupon', required: true })
  couponId: Types.ObjectId;

  @Prop({ default: 1 })
  usageCount: number;
}

export const CouponUsageSchema = SchemaFactory.createForClass(CouponUsage);

// ─── Indexes ────────────────────────────────────────────────────────────────
CouponUsageSchema.index({ userId: 1, couponId: 1 }, { unique: true });
