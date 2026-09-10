import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CouponDocument = Coupon & Document;

@Schema({ timestamps: true })
export class Coupon {
  @Prop({ type: Types.ObjectId, ref: 'Seller', default: null, index: true })
  sellerId: Types.ObjectId | null;

  @Prop({ required: true, uppercase: true, trim: true })
  code: string;

  @Prop({ default: '' })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true, enum: ['flat', 'percent'], default: 'percent' })
  discountType: 'flat' | 'percent';

  @Prop({ required: true })
  discountValue: number;

  @Prop({ default: 0 })
  minOrderValue: number;

  @Prop({ type: Number, default: null })
  maxDiscountAmount: number | null;

  @Prop({ required: true, enum: ['all', 'first_order', 'subsequent_orders'], default: 'all' })
  appliesTo: 'all' | 'first_order' | 'subsequent_orders';

  @Prop({ required: true, default: () => new Date() })
  validFrom: Date;

  @Prop({ type: Date, default: null })
  validTill: Date | null;

  @Prop({ type: Number, default: null })
  usageLimit: number | null;

  @Prop({ default: 0 })
  usageCount: number;

  @Prop({ default: 1 })
  perUserLimit: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop({ enum: ['seller', 'admin'], default: 'seller' })
  createdBy: 'seller' | 'admin';

  @Prop({ type: Types.ObjectId, default: null })
  createdById: Types.ObjectId | null;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);

CouponSchema.index({ code: 1, isDeleted: 1 });
CouponSchema.index({ sellerId: 1, isDeleted: 1, isActive: 1 });
CouponSchema.index({ isActive: 1, validFrom: 1 });
