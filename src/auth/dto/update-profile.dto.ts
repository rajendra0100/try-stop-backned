import { IsOptional, IsString, IsEmail, IsArray, IsNumber, IsBoolean, IsObject } from "class-validator";
import { Transform } from "class-transformer";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: "Invalid email address" })
  @Transform(({ value }) =>
    value && typeof value === "string" && value.trim() !== ""
      ? value.toLowerCase().trim()
      : undefined,
  )
  email?: string;

  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;

  @IsOptional()
  @IsString()
  shopName?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

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
  description?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsNumber()
  discountPercent?: number;

  @IsOptional()
  @IsString()
  openingHours?: string;

  @IsOptional()
  @IsObject()
  operatingHoursSchedule?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isOpenNow?: boolean;

  @IsOptional()
  @IsObject()
  shopAddress?: any;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

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

  @IsOptional()
  @IsString()
  shopCoverUrl?: string;

  @IsOptional()
  @IsString()
  shopBannerUrl?: string;

  @IsOptional()
  @IsString()
  shopLogoUrl?: string;

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
  staffMembers?: Array<Record<string, any>>;

  @IsOptional()
  @IsObject()
  bankDetails?: any;
}
