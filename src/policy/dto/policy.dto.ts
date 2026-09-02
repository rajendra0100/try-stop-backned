import { IsArray, IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdatePolicyDto {
  @IsArray()
  @IsString({ each: true })
  points: string[];

  @IsNumber()
  @IsOptional()
  numericValue?: number;

  @IsString()
  @IsOptional()
  description?: string;
}
