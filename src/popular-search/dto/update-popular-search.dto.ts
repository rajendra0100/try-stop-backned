import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class UpdatePopularSearchDto {
  @IsString()
  @IsOptional()
  keyword?: string;

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @IsBoolean()
  @IsOptional()
  isFallback?: boolean;

  @IsBoolean()
  @IsOptional()
  isBlocked?: boolean;

  @IsNumber()
  @IsOptional()
  priority?: number;
}
