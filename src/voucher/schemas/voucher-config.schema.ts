import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VoucherConfigDocument = VoucherConfig & Document;

@Schema({ timestamps: true })
export class VoucherConfig {
  @Prop({ required: true })
  title: string;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ required: true, min: 1 })
  faceValue: number; // e.g. ₹500

  @Prop({ required: true, min: 0, max: 100 })
  discountPercent: number; // e.g. 10 for 10% (user pays ₹450)

  @Prop({ type: Types.ObjectId, ref: 'Seller', default: null })
  sellerId: Types.ObjectId | null;

  @Prop({ required: true, enum: ['admin', 'seller'], default: 'admin' })
  createdBy: 'admin' | 'seller';

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  spendLimitToReactivate: number;

  @Prop({
    type: {
      trystopSharePercent: { type: Number, default: 0 },
      sellerSharePercent: { type: Number, default: 0 },
    },
    default: null,
  })
  splitConfig: {
    trystopSharePercent: number;
    sellerSharePercent: number;
  } | null;
}

export const VoucherConfigSchema = SchemaFactory.createForClass(VoucherConfig);
