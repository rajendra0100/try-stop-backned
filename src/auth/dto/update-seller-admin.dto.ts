import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  IsArray,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateSellerAdminDto {
  @IsOptional()
  @IsString()
  shopName?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  shopLogoUrl?: string;

  @IsOptional()
  @IsString()
  shopFullAddress?: string;

  @IsOptional()
  @IsNumber()
  shopLat?: number;

  @IsOptional()
  @IsNumber()
  shopLng?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

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

  @IsOptional()
  @IsString()
  gstNumber?: string;

  @IsOptional()
  @IsString()
  gstCertificateUrl?: string;

  @IsOptional()
  @IsString()
  panNumber?: string;

  @IsOptional()
  @IsString()
  panImageUrl?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
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
