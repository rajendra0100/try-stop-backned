import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PendingVoucherOrderDocument = PendingVoucherOrder & Document;

@Schema({ timestamps: true })
export class PendingVoucherOrder {
  @Prop({ required: true, unique: true })
  orderId: string; // e.g. VOUCH_...

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'VoucherConfig', default: null })
  voucherConfigId: Types.ObjectId | null;

  @Prop({ required: true })
  faceValue: number;

  @Prop({ required: true })
  amountToPay: number;

  @Prop({ default: 'pending', enum: ['pending', 'paid', 'failed'] })
  status: 'pending' | 'paid' | 'failed';

  @Prop({ type: Boolean, default: false })
  isGatewayDoubleConfirmed?: boolean;

  @Prop({ type: String, default: null })
  gatewayPaymentId?: string | null;

  @Prop({ type: String, default: null })
  bankReferenceNumber?: string | null;

  @Prop({ type: Date, default: null })
  gatewayDoubleConfirmedAt?: Date | null;
}

export const PendingVoucherOrderSchema =
  SchemaFactory.createForClass(PendingVoucherOrder);
