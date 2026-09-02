import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AttributeTemplateDocument = AttributeTemplate & Document;

/**
 * AttributeField — one field in a subcategory's attribute template.
 *
 * Each leaf-level subcategory (T-Shirts, Dresses, Jeans, Bras, etc.) has its own
 * attribute template — a list of fields that must/can be filled when a product
 * in that subcategory is created.
 */
export interface AttributeField {
  name: string;
  type: 'text' | 'select' | 'number' | 'boolean';
  options: string[];  // only for type: "select"
  required: boolean;
}

@Schema({ timestamps: true })
export class AttributeTemplate {
  /** Reference to the leaf-level subcategory this template belongs to */
  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, unique: true })
  subcategoryId: Types.ObjectId;

  /**
   * Dynamic fields for product creation in this subcategory.
   * The seller app fetches these and renders the upload form dynamically.
   */
  @Prop({
    type: [
      raw({
        name: { type: String, required: true },
        type: { type: String, enum: ['text', 'select', 'number', 'boolean'], required: true },
        options: { type: [String], default: [] },
        required: { type: Boolean, default: false },
      }),
    ],
    default: [],
  })
  fields: AttributeField[];
}

export const AttributeTemplateSchema = SchemaFactory.createForClass(AttributeTemplate);


