import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreatePopularSearchDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @IsBoolean()
  @IsOptional()
  isFallback?: boolean;

  @IsNumber()
  @IsOptional()
  priority?: number;
}
