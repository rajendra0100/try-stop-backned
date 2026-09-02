import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdDocument = Ad & Document;

/**
 * Ad Schema — seller-purchased shop or product advertisements.
 *
 * Phase 1: flat, fixed-price-per-day model.
 * Phase 2 (future): bid-based auction — the schema is designed to be extensible
 * for adding bidAmount, costPerClick, impressions tracking, etc. without migration.
 *
 * Ad serving uses proximity-first + round-robin tie-breaking (§8.3).
 */
@Schema({ timestamps: true })
export class Ad {
  @Prop({ type: Types.ObjectId, ref: 'Seller', required: true })
  sellerId: Types.ObjectId;

  @Prop({ required: true, enum: ['shop', 'product'] })
  type: 'shop' | 'product';

  /** Required if type = "product" */
  @Prop({ type: Types.ObjectId, ref: 'Product', default: null })
  productId: Types.ObjectId | null;

  /** Number of days the ad runs */
  @Prop({ required: true })
  days: number;

  /** Snapshot of the rate at purchase time — immune to later price changes */
  @Prop({ required: true })
  pricePerDay: number;

  /** days × pricePerDay */
  @Prop({ required: true })
  totalAmount: number;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  /** Cashfree order ID for the ad payment */
  @Prop({ type: String, default: null })
  cashfreeOrderId: string | null;

  @Prop({ required: true, enum: ['paid', 'pending'], default: 'pending' })
  paymentStatus: 'paid' | 'pending';

  @Prop({
    required: true,
    enum: ['active', 'expired', 'stopped_by_admin', 'pending_payment'],
    default: 'pending_payment',
  })
  status: 'active' | 'expired' | 'stopped_by_admin' | 'pending_payment';

  /** Admin who stopped the ad (if stopped) */
  @Prop({ type: Types.ObjectId, default: null })
  stoppedBy: Types.ObjectId | null;

  /** Used for round-robin tie-breaking in ad serving (§8.3) */
  @Prop({ type: Date, default: null })
  lastServedAt: Date | null;
}

export const AdSchema = SchemaFactory.createForClass(Ad);

// ─── Indexes ────────────────────────────────────────────────────────────────
// Active ads lookup for serving
AdSchema.index({ status: 1, startDate: 1, endDate: 1 });
AdSchema.index({ status: 1, endDate: 1 });
// Seller's ad history
AdSchema.index({ sellerId: 1, createdAt: -1 });
// Round-robin tie-breaking
AdSchema.index({ status: 1, lastServedAt: 1 });
