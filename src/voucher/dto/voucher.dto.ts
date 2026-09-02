import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SplitConfigDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  trystopSharePercent: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  sellerSharePercent: number;
}

export class CreateVoucherConfigDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(1)
  faceValue: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent: number;

  @IsString()
  @IsOptional()
  sellerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SplitConfigDto)
  splitConfig?: SplitConfigDto;

  @IsNumber()
  @IsOptional()
  @Min(0)
  spendLimitToReactivate?: number;
}

export class PurchaseVoucherDto {
  @IsString()
  voucherConfigId: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  quantity?: number;
}
