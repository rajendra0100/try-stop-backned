import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PolicyDocument = Policy & Document;

@Schema({ timestamps: true })
export class Policy {
  @Prop({ required: true, unique: true })
  type: string;

  @Prop({ type: [String], default: [] })
  points: string[];

  @Prop({ type: Number, default: 0 })
  numericValue: number;

  @Prop({ default: '' })
  description: string;
}

export const PolicySchema = SchemaFactory.createForClass(Policy);
