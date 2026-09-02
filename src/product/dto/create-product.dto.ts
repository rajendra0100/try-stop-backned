import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsMongoId,
  IsIn,
  IsBoolean,
  ValidateNested,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Stock by hub — for hyperlocal delivery */
class StockByHubDto {
  @IsNotEmpty()
  @IsMongoId()
  hubId: string;

  @IsNumber()
  @Min(0)
  quantity: number;
}

/** Single variant — size/color combination with stock */
class ProductVariantDto {
  @IsNotEmpty()
  @IsString()
  size: string;

  @IsNotEmpty()
  @IsString()
  color: string;

  @IsOptional()
  @IsString()
  colorHex?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockByHubDto)
  stockByHub?: StockByHubDto[];

  @IsNotEmpty()
  @IsString()
  sku: string;
}

/**
 * DTO for creating a new product.
 * Images must be CDN URLs, not raw files — use /upload endpoint first.
 */
export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsNotEmpty()
  @IsMongoId()
  categoryId: string;

  @IsNotEmpty()
  @IsMongoId()
  subcategoryId: string;

  @IsNotEmpty()
  @IsIn(['men', 'women', 'kids', 'unisex'])
  gender: 'men' | 'women' | 'kids' | 'unisex';

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  mrp: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  offerPrice: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  /** Dynamic attributes based on subcategory template */
  @IsOptional()
  specifications?: Record<string, string | number | boolean>;

  /** CDN URLs — never raw file uploads */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  video?: string;

  @IsOptional()
  @IsBoolean()
  isReturnable?: boolean;

  @IsOptional()
  @IsNumber()
  returnWindowDays?: number;

  @IsOptional()
  @IsString()
  returnPolicyNote?: string;

  @IsOptional()
  @IsBoolean()
  codAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  isSecurePayment?: boolean;
}
