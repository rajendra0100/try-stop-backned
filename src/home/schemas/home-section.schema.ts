import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HomeSectionDocument = HomeSection & Document;

/**
 * HomeSection — server-driven UI config for the homepage.
 *
 * Each document represents one section of the homepage (banner carousel, category grid,
 * product carousel, deal strip). The order field determines display position.
 *
 * The `style` key tells the frontend which registered layout component to render.
 * Adding a new section using an existing style requires NO app build — just insert a DB row.
 * A genuinely new visual layout requires ONE build to add the component, then it's reusable forever.
 *
 * The `filter` field maps directly to ProductService.getProducts() query params,
 * so any product filter combination can power a carousel without custom code.
 */

export interface HomeSectionFilter {
  tag?: string;
  category?: string;
  priceMax?: number;
  sort?: string;
}

@Schema({ timestamps: true })
export class HomeSection {
  /** Section type — determines data source (banners, categories, products, deals) */
  @Prop({
    required: true,
    enum: ['banner_carousel', 'category_grid', 'product_carousel', 'deal_strip'],
  })
  type: 'banner_carousel' | 'category_grid' | 'product_carousel' | 'deal_strip';

  /** Section title shown to users (null for banners, which have no title) */
  @Prop({ type: String, default: null })
  title: string | null;

  /** Product filter config — passed to ProductService.getProducts() */
  @Prop({
    type: raw({
      tag: { type: String },
      category: { type: String },
      priceMax: { type: Number },
      sort: { type: String },
    }),
    default: null,
  })
  filter: HomeSectionFilter | null;

  /**
   * Frontend layout key — maps to a known layout component in the app's style registry.
   * Examples: "strip", "grid_2col", "banner_full", "deal_timer"
   */
  @Prop({ required: true })
  style: string;

  /** Display order on the homepage */
  @Prop({ default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const HomeSectionSchema = SchemaFactory.createForClass(HomeSection);

HomeSectionSchema.index({ isActive: 1, order: 1 });
