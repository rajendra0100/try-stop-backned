import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CategoryDocument = Category & Document;

/**
 * Category Schema — supports unlimited nesting depth.
 * Categories are admin-managed data with custom styling metadata (bgColor, icon, isTrending, order).
 */
@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  /** null = top-level category, else it's a subcategory */
  @Prop({ type: Types.ObjectId, ref: 'Category', default: null })
  parentCategoryId: Types.ObjectId | null;

  @Prop({ type: [Types.ObjectId], ref: 'Category', default: [] })
  parentCategoryIds: Types.ObjectId[];

  /** Image URL for 3D category pop card/grid display */
  @Prop({ default: '' })
  icon: string;

  /** Soft background tint color for 3D card circle disk (e.g. #FEE2E2, #EFF6FF, #FEF3C7) */
  @Prop({ default: '#EFF6FF' })
  bgColor: string;

  /** Whether this category appears in the Trending Collection 3D grid */
  @Prop({ default: true })
  isTrending: boolean;

  /** Priority display order */
  @Prop({ default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.index({ parentCategoryId: 1 });
CategorySchema.index({ parentCategoryIds: 1 });
CategorySchema.index({ isTrending: 1, order: -1 });
