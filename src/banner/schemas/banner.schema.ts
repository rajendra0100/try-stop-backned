import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BannerDocument = Banner & Document;

/**
 * Banner target filter — criteria for finding sellers when banner is tapped.
 * Used when targetType is 'seller_list'.
 */
export interface BannerTargetFilter {
  categories?: string[];
  offerTag?: string;
  minDiscount?: number;
  verificationStatus?: string;
  sortBy?: 'ranking' | 'distance' | 'discount';
}

/**
 * Banner Schema — promotional banners for the homepage carousel.
 * Admin-managed: swap Diwali banner for Holi banner without any app build.
 *
 * Each banner is a "smart filter on sellers" — when tapped, the app calls
 * GET /banners/:id/sellers?lat=X&lng=Y and gets matching sellers sorted by distance.
 */
@Schema({ timestamps: true })
export class Banner {
  @Prop({ required: true })
  title: string;

  /** CDN URL for the banner image */
  @Prop({ required: true })
  imageUrl: string;

  /** Deep link or URL to navigate to when tapped (used for targetType='external_link') */
  @Prop({ default: '' })
  linkUrl: string;

  /** Controls display order in the carousel */
  @Prop({ default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;

  /** Optional: start/end dates for time-limited banners (e.g. sale campaigns) */
  @Prop()
  startsAt?: Date;

  @Prop()
  endsAt?: Date;

  // ─── Dynamic Targeting Fields ───────────────────────────────────────────────

  /** What happens when user taps the banner */
  @Prop({
    enum: ['seller_list', 'category', 'external_link', 'none'],
    default: 'none',
  })
  targetType: string;

  /** Filter criteria for finding sellers (used when targetType='seller_list') */
  @Prop({
    type: raw({
      categories: { type: [String] },
      offerTag: { type: String },
      minDiscount: { type: Number },
      verificationStatus: { type: String },
      sortBy: { type: String },
    }),
    default: null,
  })
  targetFilter: BannerTargetFilter | null;

  /** Category slug for targetType='category' */
  @Prop({ type: String, default: null })
  targetCategorySlug: string | null;

  /** Placement slot: home, shop, or voucher */
  @Prop({ type: String, enum: ['home', 'shop', 'voucher'], default: 'home' })
  slot: string;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);

BannerSchema.index({ isActive: 1, order: 1 });

