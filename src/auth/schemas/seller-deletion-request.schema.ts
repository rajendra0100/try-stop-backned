import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SellerDeletionRequestDocument = SellerDeletionRequest & Document;

@Schema({ timestamps: true })
export class SellerDeletionRequest {
  @Prop({ type: Types.ObjectId, ref: 'Seller', required: true, index: true })
  sellerId: Types.ObjectId;

  @Prop({ required: true })
  shopName: string;

  @Prop({ required: true })
  ownerName: string;

  @Prop({ required: true })
  email: string;

  @Prop({ default: '' })
  phone?: string;

  @Prop({ default: 'Other' })
  reason: string;

  @Prop({ required: true })
  message: string;

  @Prop({
    type: String,
    enum: ['pending', 'contacted', 'resolved', 'deleted'],
    default: 'pending',
    index: true,
  })
  status: string;

  @Prop({ default: '' })
  adminNotes?: string;

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const SellerDeletionRequestSchema = SchemaFactory.createForClass(SellerDeletionRequest);
