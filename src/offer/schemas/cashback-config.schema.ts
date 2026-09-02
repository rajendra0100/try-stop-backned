import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CashbackConfigDocument = CashbackConfig & Document;

/**
 * CashbackConfig Schema — dynamic cashback rate configuration.
 *
 * Supports both global (scope: "global") and per-user (scope: "user") overrides.
 * Resolution: check for active user-specific config first, fallback to global.
 * This lets Admin run a 20% promo for one user while everyone else stays on 10%.
 */
@Schema()
export class CashbackSlab {
  @Prop({ required: true })
  maxAmount: number;

  @Prop({ required: true })
  cashbackRate: number; // e.g. 0.08 for 8%
}

export const CashbackSlabSchema = SchemaFactory.createForClass(CashbackSlab);

@Schema({ timestamps: true })
export class CashbackConfig {
  @Prop({ required: true, enum: ['global', 'user'] })
  scope: 'global' | 'user';

  /** Only set when scope = "user" */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;

  /** Cashback rate as a decimal fallback (e.g. 0.10 = 10%) */
  @Prop({ required: true })
  cashbackRate: number;

  @Prop({ type: Number, default: null })
  firstOrderRate: number | null;

  @Prop({ type: Number, default: null })
  subsequentRate: number | null;

  @Prop({ type: [CashbackSlabSchema], default: [] })
  slabs: CashbackSlab[];

  /** When this config becomes active */
  @Prop({ required: true })
  validFrom: Date;

  /** When this config expires (null = no expiry) */
  @Prop({ type: Date, default: null })
  validTill: Date | null;

  @Prop({ default: true })
  isActive: boolean;
}

export const CashbackConfigSchema = SchemaFactory.createForClass(CashbackConfig);

// ─── Indexes ────────────────────────────────────────────────────────────────
// Find active global config
CashbackConfigSchema.index({ scope: 1, isActive: 1, validFrom: 1, validTill: 1 });
// Find active user-specific config
CashbackConfigSchema.index({ scope: 1, userId: 1, isActive: 1, validFrom: 1, validTill: 1 });
