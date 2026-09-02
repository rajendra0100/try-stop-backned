import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomVoucherSlabDocument = CustomVoucherSlab & Document;

@Schema({ timestamps: true })
export class CustomVoucherSlab {
  @Prop({ required: true, unique: true, min: 0 })
  maxAmount: number; // e.g. 500

  @Prop({ required: true, min: 0, max: 100 })
  discountPercent: number; // e.g. 5 for 5%
}

export const CustomVoucherSlabSchema =
  SchemaFactory.createForClass(CustomVoucherSlab);
