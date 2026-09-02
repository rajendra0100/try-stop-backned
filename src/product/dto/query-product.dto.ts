import { IsOptional, IsString, IsNumber, IsBoolean, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for querying products — supports the full filter set.
 * All filters combine with AND (never replace each other).
 *
 * Frontend note: debounce search-as-you-type (~300ms after last keystroke).
 */
export class QueryProductDto {
  /** Filter by seller (shop) ID */
  @IsOptional()
  @IsString()
  sellerId?: string;

  /** Filter by category slug or ID */
  @IsOptional()
  @IsString()
  category?: string;

  /** Filter by subcategory slug or ID */
  @IsOptional()
  @IsString()
  subcategory?: string;

  /** Filter by gender */
  @IsOptional()
  @IsString()
  gender?: string;

  /** Filter by tags (comma-separated, e.g. "steal_drops,trending") */
  @IsOptional()
  @IsString()
  tag?: string;

  /** Minimum price filter */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  /** Maximum price filter */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMax?: number;

  /** Filter by color (matches against variant colors) */
  @IsOptional()
  @IsString()
  color?: string;

  /** Filter by size (matches against variant sizes) */
  @IsOptional()
  @IsString()
  size?: string;

  /** Filter by fit (from specifications) */
  @IsOptional()
  @IsString()
  fit?: string;

  /** Minimum discount percent (e.g. 40 for "40% off or more") */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountMin?: number;

  /** Boolean — filter to recently added products */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isNew?: boolean;

  /** Free-text search — matches name, brand, subcategory, color, tags */
  @IsOptional()
  @IsString()
  search?: string;

  /** Sort order */
  @IsOptional()
  @IsString()
  sort?: 'popular' | 'newest' | 'price_low_high' | 'price_high_low';

  /** Only return products deliverable from this hub */
  @IsOptional()
  @IsString()
  hubId?: string;

  /** Cursor for cursor-based pagination (base64-encoded) */
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Page number for offset-based pagination (admin moderation) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  /** Page size — default 20, max 50 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  /**
   * Filter by product approval/moderation status.
   * Used by admin panel for product moderation queue.
   * Public consumers always see only "live" products (enforced in service).
   */
  @IsOptional()
  @IsString()
  @IsIn(['pending_review', 'live', 'rejected', 'deleted'])
  status?: 'pending_review' | 'live' | 'rejected' | 'deleted';
}
