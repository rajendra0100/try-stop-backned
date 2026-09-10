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

export class SetCashbackRateDto {
  @IsNotEmpty()
  @IsIn(['global', 'user'])
  scope: 'global' | 'user';

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

export class CreateCouponDto {
  @IsOptional()
  @IsMongoId()
  sellerId?: string;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

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

  @IsOptional()
  @IsIn(['all', 'first_order', 'subsequent_orders'])
  appliesTo?: 'all' | 'first_order' | 'subsequent_orders';

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTill?: string;

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

export class SellerCreateCouponDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

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

  @IsOptional()
  @IsIn(['all', 'first_order', 'subsequent_orders'])
  appliesTo?: 'all' | 'first_order' | 'subsequent_orders';

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTill?: string;

  @IsOptional()
  @IsNumber()
  usageLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  perUserLimit?: number;
}

export class QueryCouponsDto {
  @IsOptional()
  page?: string | number;

  @IsOptional()
  limit?: string | number;

  @IsOptional()
  search?: string;

  @IsOptional()
  sellerId?: string;

  @IsOptional()
  status?: string;

  @IsOptional()
  appliesTo?: string;
}

export class SetWalletCapDto {
  @IsNotEmpty()
  @IsIn(['global', 'user'])
  target: 'global' | 'user';

  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(1)
  walletUsageCap: number;
}
