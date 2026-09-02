import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VoucherTransactionDocument = VoucherTransaction & Document;

@Schema({ timestamps: true })
export class VoucherTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['credit', 'debit'] })
  type: 'credit' | 'debit';

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: ['purchase', 'redemption', 'admin_adjustment'] })
  reason: 'purchase' | 'redemption' | 'admin_adjustment';

  @Prop({ type: Types.ObjectId, ref: 'Transaction', default: null })
  relatedTransactionId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'UserVoucher', default: null })
  userVoucherId: Types.ObjectId | null;
}

export const VoucherTransactionSchema = SchemaFactory.createForClass(VoucherTransaction);
