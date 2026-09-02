import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DeletedUserDocument = DeletedUser & Document;

@Schema({ timestamps: true, collection: 'deleted_users' })
export class DeletedUser {
  @Prop({ required: true })
  originalUserId: string;

  @Prop({ required: false, lowercase: true, trim: true })
  phone?: string;

  @Prop({ required: false, lowercase: true, trim: true })
  email?: string;

  @Prop({ required: false })
  name?: string;

  @Prop({ default: 0 })
  totalSpentAmount: number;

  @Prop({ type: [String], default: [] })
  redeemedVoucherIds: string[];

  @Prop({ default: Date.now })
  deletedAt: Date;

  @Prop({ default: 'user_requested' })
  reason: string;
}

export const DeletedUserSchema = SchemaFactory.createForClass(DeletedUser);
DeletedUserSchema.index({ phone: 1 });
DeletedUserSchema.index({ email: 1 });
