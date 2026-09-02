import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsBoolean,
  Matches,
} from "class-validator";
import { Transform } from "class-transformer";

export class OnboardStaffDto {
  @IsNotEmpty({ message: "Staff full name is required" })
  @IsString()
  name: string;

  @IsNotEmpty({ message: "Phone number is required" })
  @IsString()
  @Matches(/^[0-9]{10}$/, { message: "Phone number must be 10 digits" })
  phone: string;

  @IsNotEmpty({ message: "Email is required" })
  @IsEmail({}, { message: "Please provide a valid email address" })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;

  @IsOptional()
  @IsBoolean()
  canViewProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  canAccessProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  canEditProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  canEditStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageShop?: boolean;

  @IsOptional()
  @IsBoolean()
  canAccessDashboard?: boolean;

}

export class VerifyStaffOtpDto {
  @IsNotEmpty({ message: "Email is required" })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty({ message: "Phone number is required" })
  @IsString()
  phone: string;

  @IsNotEmpty({ message: "OTP is required" })
  @IsString()
  otp: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;

  @IsOptional()
  @IsBoolean()
  canViewProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  canAccessProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  canEditProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  canEditStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageShop?: boolean;

  @IsOptional()
  @IsBoolean()
  canAccessDashboard?: boolean;

}

export class ResendStaffOtpDto {
  @IsNotEmpty({ message: "Email is required" })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty({ message: "Phone number is required" })
  @IsString()
  phone: string;
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;

  @IsOptional()
  @IsBoolean()
  canViewProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  canAccessProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  canEditProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  canEditStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageShop?: boolean;

  @IsOptional()
  @IsBoolean()
  canAccessDashboard?: boolean;

}

export class ToggleStaffPermissionDto {
  @IsNotEmpty({ message: "Permission key is required" })
  @IsString()
  permissionKey: string;

  @IsNotEmpty({ message: "Permission value is required" })
  @IsBoolean()
  value: boolean;
}
