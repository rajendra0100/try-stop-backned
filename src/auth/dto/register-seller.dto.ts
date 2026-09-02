import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  MinLength,
  Matches,
  IsArray,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Seller registration DTO.
 * Document images are accepted as already-uploaded URLs (from /upload endpoint).
 */
export class RegisterSellerDto {
  // ── Shop Info ──────────────────────────────────────────────────────────────

  @IsNotEmpty({ message: 'Shop name is required' })
  @IsString()
  shopName: string;

  @IsNotEmpty({ message: 'Owner name is required' })
  @IsString()
  ownerName: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  shopDescription?: string;

  @IsOptional()
  @IsString()
  openingHours?: string;

  @IsOptional()
  operatingHoursSchedule?: Record<string, any>;

  @IsOptional()
  @IsString()
  shopLogoUrl?: string;

  // ── Shop Address ───────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  shopFullAddress?: string;

  @IsOptional()
  shopLat?: number;

  @IsOptional()
  shopLng?: number;

  // ── Categories ────────────────────────────────────────────────────────────

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[]; // e.g. ['men', 'women', 'kids']

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subcategoryNames?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productTypes?: string[];

  @IsOptional()
  @IsNumber()
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  maxPrice?: number;

  // ── Business Documents ────────────────────────────────────────────────────

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{15}$/, { message: 'GST number must be 15 alphanumeric characters' })
  gstNumber?: string;

  @IsOptional()
  @IsString()
  gstCertificateUrl?: string;

  @IsOptional()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, {
    message: 'PAN must be in format: ABCDE1234F',
  })
  panNumber?: string;

  @IsOptional()
  @IsString()
  panImageUrl?: string;

  // ── Bank Details ──────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, {
    message: 'IFSC must be in format: ABCD0123456',
  })
  ifscCode?: string;

  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  upiId?: string;

  // ── Media & Gallery ──────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  shopCoverUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shopImages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shopVideos?: string[];

  @IsOptional()
  @IsArray()
  stories?: { imageUrl: string; title?: string; description?: string; caption?: string; createdAt?: string }[];
}
