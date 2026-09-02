import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReferralConfigDocument = ReferralConfig & Document;

@Schema({ timestamps: true })
export class ReferralConfig {
  @Prop({ required: true, enum: ['fixed', 'percentage'], default: 'fixed' })
  rewardType: 'fixed' | 'percentage';

  @Prop({ required: true, default: 50 })
  rewardValue: number;

  @Prop({ default: '' })
  bannerImageUrl: string;

  @Prop({ default: '1.0.0' })
  appVersion: string;
}

export const ReferralConfigSchema = SchemaFactory.createForClass(ReferralConfig);
