import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlatformConfigDocument = PlatformConfig & Document;

/**
 * PlatformConfig Schema — dynamic key-value store for platform-wide settings.
 *
 * Used for:
 *   - commission_rate (global fallback, e.g. 0.15)
 *   - wallet_usage_cap (global max wallet %, e.g. 0.75)
 *   - cashback_rate (global default, e.g. 0.10)
 *   - pg_fee_rate (gateway fee, e.g. 0.02)
 *
 * Admin can change these anytime via admin endpoints — no code deployment needed.
 */
@Schema({ timestamps: true })
export class PlatformConfig {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true, type: Number })
  value: number;

  /** Human-readable description of what this config controls */
  @Prop({ default: '' })
  description: string;
}

export const PlatformConfigSchema = SchemaFactory.createForClass(PlatformConfig);

PlatformConfigSchema.index({ key: 1 }, { unique: true });
