import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

/**
 * Product Schema — covers everything a Myntra/Amazon/Flipkart PDP needs.
 *
 * Key design decisions:
 * - `gender`, `discountPercent`, `tags` are top-level indexed fields (not buried in specs)
 *   for fast filtering — denormalized for read speed per §10.1
 * - `variants` contain per-hub stock for hyperlocal serviceability
 * - `specifications` are dynamic key-value pairs driven by the subcategory's attribute template
 * - `status` drives visibility: only "live" + isApproved products appear in public queries
 */

/** Variant — one size/color combination with per-hub stock */
export interface ProductVariant {
  size: string;
  color: string;
  colorHex: string;
  stockByHub: Array<{ hubId: Types.ObjectId; quantity: number }>;
  sku: string;
}

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  brand: string;

  /** Top-level category (e.g. "Women") */
  @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  categoryId: Types.ObjectId;

  /** Leaf-level subcategory (e.g. "Dresses") — determines which attributes apply */
  @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  subcategoryId: Types.ObjectId;

  /** Universal filter field, independent of category tree */
  @Prop({ required: true, enum: ['men', 'women', 'kids', 'unisex'] })
  gender: 'men' | 'women' | 'kids' | 'unisex';

  // ─── Pricing ──────────────────────────────────────────────────────────────
  @Prop({ required: true })
  mrp: number;

  @Prop({ required: true })
  offerPrice: number;

  /** Stored for fast reads — can be computed from mrp/offerPrice but indexed for discount filters */
  @Prop({ default: 0 })
  discountPercent: number;

  // ─── Variants ─────────────────────────────────────────────────────────────
  @Prop({
    type: [
      raw({
        size: { type: String, required: true },
        color: { type: String, required: true },
        colorHex: { type: String, default: '#000000' },
        stockByHub: [
          raw({
            hubId: { type: Types.ObjectId, required: true },
            quantity: { type: Number, default: 0 },
          }),
        ],
        sku: { type: String, required: true },
      }),
    ],
    default: [],
  })
  variants: ProductVariant[];

  // ─── Dynamic Attributes (from subcategory template) ───────────────────────
  /** Filled according to the subcategory's attribute template, e.g. { "Sleeve": "Short" } */
  @Prop({ type: Object, default: {} })
  specifications: Record<string, string | number | boolean>;

  // ─── Media ────────────────────────────────────────────────────────────────
  /** Multiple angles, CDN URLs — product API only accepts URLs, not raw files */
  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: String, default: null })
  video: string | null;

  // ─── Policy (trust badges on PDP) ─────────────────────────────────────────
  @Prop({ default: true })
  isReturnable: boolean;

  @Prop({ default: 7 })
  returnWindowDays: number;

  @Prop({ default: 'Return if not liked' })
  returnPolicyNote: string;

  @Prop({ default: true })
  codAvailable: boolean;

  @Prop({ default: true })
  isSecurePayment: boolean;

  // ─── Tags (drive homepage carousels and search) ───────────────────────────
  /** Marketing tags like ["steal_drops", "trending", "new_arrival"] — managed by admin */
  @Prop({ type: [String], default: [] })
  tags: string[];

  // ─── Ownership & Moderation ───────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, required: true })
  uploadedBy: Types.ObjectId;

  @Prop({ required: true, enum: ['seller', 'superadmin', 'subadmin'] })
  uploadedByRole: 'seller' | 'superadmin' | 'subadmin';

  /** Default false for seller uploads when PRODUCT_APPROVAL_REQUIRED=true */
  @Prop({ default: true })
  isApproved: boolean;

  @Prop({ type: Types.ObjectId, default: null })
  approvedBy: Types.ObjectId | null;

  @Prop({
    required: true,
    enum: ['pending_review', 'live', 'rejected', 'deleted'],
    default: 'live',
  })
  status: 'pending_review' | 'live' | 'rejected' | 'deleted';

  @Prop({ type: String, default: null })
  rejectionReason: string | null;

  // ─── Ratings (aggregate — actual reviews are a separate module) ───────────
  @Prop({ default: 0 })
  avgRating: number;

  @Prop({ default: 0 })
  reviewCount: number;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// ─── Compound Indexes for fast filtering/sorting (§10) ──────────────────────
// Primary browsing query: live products by subcategory + gender + tags
ProductSchema.index({ status: 1, isApproved: 1, subcategoryId: 1, gender: 1 });
// Tag-based queries (homepage carousels, campaign pages)
ProductSchema.index({ status: 1, isApproved: 1, tags: 1 });
// Sorting by newest
ProductSchema.index({ status: 1, createdAt: -1 });
// Discount filter ("40% off or more")
ProductSchema.index({ status: 1, isApproved: 1, discountPercent: -1 });
// Price range queries
ProductSchema.index({ status: 1, isApproved: 1, offerPrice: 1 });
// Seller's own products (shop view)
ProductSchema.index({ uploadedBy: 1, status: 1 });
// Category-level browsing
ProductSchema.index({ status: 1, isApproved: 1, categoryId: 1 });
// Free-text search on name and brand
ProductSchema.index({ name: 'text', brand: 'text', description: 'text' });
