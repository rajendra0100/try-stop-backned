import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsMongoId,
  IsIn,
  IsBoolean,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class StockByHubDto {
  @IsMongoId()
  hubId: string;

  @IsNumber()
  @Min(0)
  quantity: number;
}

class ProductVariantDto {
  @IsString()
  size: string;

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

  @IsString()
  sku: string;
}

/** DTO for updating a product — all fields optional */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsMongoId()
  subcategoryId?: string;

  @IsOptional()
  @IsIn(['men', 'women', 'kids', 'unisex'])
  gender?: 'men' | 'women' | 'kids' | 'unisex';

  @IsOptional()
  @IsNumber()
  @Min(0)
  mrp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  offerPrice?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @IsOptional()
  specifications?: Record<string, string | number | boolean>;

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
