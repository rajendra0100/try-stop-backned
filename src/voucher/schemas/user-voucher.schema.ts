import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserVoucherDocument = UserVoucher & Document;

@Schema({ timestamps: true })
export class UserVoucher {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'VoucherConfig', required: false, default: null })
  voucherConfigId: Types.ObjectId | null;

  @Prop({ required: true })
  faceValue: number;

  @Prop({ required: true })
  amountPaid: number;

  @Prop({ required: true, default: 0 })
  remainingBalance: number;

  @Prop({ required: true, enum: ['active', 'fully_redeemed', 'expired'], default: 'active' })
  status: 'active' | 'fully_redeemed' | 'expired';

  @Prop({ type: Types.ObjectId, ref: 'Transaction', default: null })
  purchaseTransactionId: Types.ObjectId | null;
}

export const UserVoucherSchema = SchemaFactory.createForClass(UserVoucher);
