import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for the banner's seller targeting filter.
 * Used when targetType is 'seller_list'.
 */
export class BannerTargetFilterDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsString()
  offerTag?: string;

  @IsOptional()
  @IsNumber()
  minDiscount?: number;

  @IsOptional()
  @IsString()
  verificationStatus?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ranking', 'distance', 'discount'])
  sortBy?: 'ranking' | 'distance' | 'discount';
}

export class CreateBannerDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  imageUrl: string;

  @IsOptional()
  @IsString()
  linkUrl?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  // ─── Dynamic Targeting Fields ───────────────────────────────────────────────

  @IsOptional()
  @IsIn(['seller_list', 'category', 'external_link', 'none'])
  targetType?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BannerTargetFilterDto)
  targetFilter?: BannerTargetFilterDto;

  @IsOptional()
  @IsString()
  targetCategorySlug?: string;

  @IsOptional()
  @IsIn(['home', 'shop', 'voucher'])
  slot?: string;
}

export class UpdateBannerDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  linkUrl?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  // ─── Dynamic Targeting Fields ───────────────────────────────────────────────

  @IsOptional()
  @IsIn(['seller_list', 'category', 'external_link', 'none'])
  targetType?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BannerTargetFilterDto)
  targetFilter?: BannerTargetFilterDto;

  @IsOptional()
  @IsString()
  targetCategorySlug?: string;

  @IsOptional()
  @IsIn(['home', 'shop', 'voucher'])
  slot?: string;
}
