import { IsEmail, IsNotEmpty, IsString, IsOptional, MinLength, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSubadminDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password: string;

  /** Fine-grained access permissions for this subadmin */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;
}
