import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FilterOptionDocument = FilterOption & Document;

/**
 * FilterOption — admin-managed global filter config.
 *
 * These drive the filter panel UI across all products (Color, Gender, Size, Fit, Discount).
 * Completely separate from category attribute templates, which are category-specific PDP specs.
 *
 * The frontend reads the `widget` key and renders the matching generic component:
 *   swatch → color dots, chips → tappable buttons, range → slider, multiselect → dropdown
 *
 * Adding a new color or size option is purely an admin-panel data change — no app build needed
 * unless a genuinely new widget type is introduced.
 */
export interface FilterOptionValue {
  value: string;
  label: string;
  hex?: string;  // only for "swatch" widget (color)
}

@Schema({ timestamps: true })
export class FilterOption {
  /** Unique key used in query params, e.g. "color", "gender", "size" */
  @Prop({ required: true, unique: true })
  key: string;

  /** Human-readable label shown in the filter panel, e.g. "Color" */
  @Prop({ required: true })
  label: string;

  /** Determines which frontend component renders this filter */
  @Prop({
    required: true,
    enum: ['swatch', 'chips', 'range', 'multiselect'],
  })
  widget: 'swatch' | 'chips' | 'range' | 'multiselect';

  /** Available options — shape depends on widget type */
  @Prop({
    type: [
      raw({
        value: { type: String, required: true },
        label: { type: String, required: true },
        hex: { type: String },
      }),
    ],
    default: [],
  })
  options: FilterOptionValue[];

  /** For range widgets — minimum value */
  @Prop()
  min?: number;

  /** For range widgets — maximum value */
  @Prop()
  max?: number;

  /** Optional: restrict this filter to specific category slugs (empty = show for all) */
  @Prop({ type: [String], default: [] })
  applicableCategories: string[];
}

export const FilterOptionSchema = SchemaFactory.createForClass(FilterOption);
