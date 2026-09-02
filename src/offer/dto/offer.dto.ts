import {
  IsNotEmpty, IsNumber, IsOptional, IsString, IsIn, IsMongoId,
  IsBoolean, IsDateString, Min, Max, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CashbackSlabDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  maxAmount: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(1)
  cashbackRate: number;
}

/**
 * DTO for setting cashback rate (global or per-user).
 * Admin-only endpoint.
 */
export class SetCashbackRateDto {
  @IsNotEmpty()
  @IsIn(['global', 'user'])
  scope: 'global' | 'user';

  /** Required when scope = "user" */
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(1)
  cashbackRate: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  firstOrderRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  subsequentRate?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashbackSlabDto)
  slabs?: CashbackSlabDto[];

  @IsNotEmpty()
  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsDateString()
  validTill?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO for creating/editing a coupon.
 * Admin-only endpoint.
 */
export class CreateCouponDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsIn(['flat', 'percent'])
  discountType: 'flat' | 'percent';

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @IsNotEmpty()
  @IsDateString()
  validFrom: string;

  @IsNotEmpty()
  @IsDateString()
  validTill: string;

  /** Total redemptions allowed (null = unlimited) */
  @IsOptional()
  @IsNumber()
  usageLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO for setting wallet cap (global or per-user).
 * Admin-only endpoint.
 */
export class SetWalletCapDto {
  @IsNotEmpty()
  @IsIn(['global', 'user'])
  target: 'global' | 'user';

  /** Required when target = "user" */
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(1)
  walletUsageCap: number;
}
