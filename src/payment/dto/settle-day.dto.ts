import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SettleDayDto {
  @IsNotEmpty()
  @IsString()
  sellerId: string;

  @IsNotEmpty()
  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  utrReference?: string;
}
