import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PopularSearchDocument = PopularSearch & Document;

@Schema({ timestamps: true })
export class PopularSearch {
  @Prop({ required: true, trim: true, unique: true })
  keyword: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  normalizedKeyword: string;

  @Prop({ default: 1 })
  searchCount: number;

  @Prop({ default: false })
  isPinned: boolean;

  @Prop({ default: false })
  isFallback: boolean;

  @Prop({ default: false })
  isBlocked: boolean;

  @Prop({ default: 0 })
  priority: number;

  @Prop({ default: Date.now })
  lastSearchedAt: Date;
}

export const PopularSearchSchema = SchemaFactory.createForClass(PopularSearch);

PopularSearchSchema.index({ isBlocked: 1, isPinned: -1, searchCount: -1 });
