import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Optional pre-registration for users — captures name/profile before OTP.
 * If skipped, the user is auto-registered on first OTP verify.
 */
export class RegisterUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;
}
