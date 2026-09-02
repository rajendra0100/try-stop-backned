import {
  IsNotEmpty, IsNumber, IsOptional, IsString, IsIn, IsMongoId, Min,
} from 'class-validator';

/**
 * DTO for creating an ad campaign.
 * Seller creates a shop or product ad; payment via Cashfree PG order.
 */
export class CreateAdDto {
  @IsNotEmpty()
  @IsIn(['shop', 'product'])
  type: 'shop' | 'product';

  /** Required if type = "product" */
  @IsOptional()
  @IsMongoId()
  productId?: string;

  /** Number of days to run the ad */
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  days: number;
}

/**
 * DTO for updating ad pricing (admin-only).
 */
export class UpdateAdPricingDto {
  @IsNotEmpty()
  @IsIn(['shop', 'product'])
  type: 'shop' | 'product';

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  pricePerDay: number;
}

/**
 * DTO for querying active ads for a screen slot.
 * Includes user's current location for proximity-based sorting.
 */
export class QueryActiveAdsDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsIn(['home_banner', 'product_placement', 'shop_listing'])
  slot?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}
