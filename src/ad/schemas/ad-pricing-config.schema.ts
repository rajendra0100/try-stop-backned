import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdPricingConfigDocument = AdPricingConfig & Document;

/**
 * AdPricingConfig Schema — admin-configurable ad pricing.
 *
 * Stores the daily rate for each ad type ("shop" or "product").
 * Never hardcoded — admin can change anytime via /admin/ads/pricing.
 */
@Schema({ timestamps: true })
export class AdPricingConfig {
  @Prop({ required: true, enum: ['shop', 'product'] })
  type: 'shop' | 'product';

  /** Price per day in ₹ */
  @Prop({ required: true })
  pricePerDay: number;
}

export const AdPricingConfigSchema = SchemaFactory.createForClass(AdPricingConfig);

AdPricingConfigSchema.index({ type: 1 }, { unique: true });
