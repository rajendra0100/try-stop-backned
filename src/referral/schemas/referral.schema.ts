import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReferralDocument = Referral & Document;

@Schema({ timestamps: true })
export class Referral {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  referrerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  refereeId: Types.ObjectId;

  @Prop({ required: true, enum: ['pending', 'completed'], default: 'pending' })
  status: 'pending' | 'completed';

  @Prop({ required: true, default: 0 })
  rewardAmount: number;

  @Prop({ type: Types.ObjectId, ref: 'Transaction', default: null })
  firstPurchaseTransactionId: Types.ObjectId | null;

  @Prop({ default: null, type: Number })
  firstPurchaseAmount: number | null;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);

ReferralSchema.index({ referrerId: 1 });
ReferralSchema.index({ refereeId: 1 }, { unique: true });
ReferralSchema.index({ status: 1 });
