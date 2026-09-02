import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewDocument = Review & Document;

/**
 * Review Schema — verified purchase reviews.
 *
 * Only customers with a successful (paid) transaction at a seller can leave a review.
 * One review per transaction — prevents fake/drive-by reviews.
 * Feeds directly into the seller ranking algorithm (§7).
 */
@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Seller', required: true })
  sellerId: Types.ObjectId;

  /** Required — ensures "verified purchase" integrity */
  @Prop({ type: Types.ObjectId, ref: 'Transaction', required: true })
  transactionId: Types.ObjectId;

  /** 1-5 star rating */
  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ default: '' })
  comment: string;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// ─── Indexes ────────────────────────────────────────────────────────────────
// One review per transaction (unique)
ReviewSchema.index({ transactionId: 1 }, { unique: true });
// Seller's reviews list (paginated, sorted by newest)
ReviewSchema.index({ sellerId: 1, createdAt: -1 });
// Customer's review history
ReviewSchema.index({ customerId: 1, createdAt: -1 });
