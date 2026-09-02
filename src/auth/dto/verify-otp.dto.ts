import { IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyOtpDto {
  @IsNotEmpty({ message: 'Email or phone number is required' })
  @IsString()
  @Transform(({ value }) => value?.toLowerCase().trim())
  identifier: string; // email address or phone number

  @IsNotEmpty({ message: 'OTP code is required' })
  @IsString()
  @Length(4, 4, { message: 'OTP must be exactly 4 digits' })
  otp: string;
}
