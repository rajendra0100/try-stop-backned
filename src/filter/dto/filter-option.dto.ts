import {
  IsNotEmpty,
  IsString,
  IsIn,
  IsArray,
  IsOptional,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Single option value within a filter */
export class FilterOptionValueDto {
  @IsNotEmpty()
  @IsString()
  value: string;

  @IsNotEmpty()
  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  hex?: string;
}

/** DTO for creating a new filter option group */
export class CreateFilterOptionDto {
  @IsNotEmpty()
  @IsString()
  key: string;

  @IsNotEmpty()
  @IsString()
  label: string;

  @IsNotEmpty()
  @IsIn(['swatch', 'chips', 'range', 'multiselect'])
  widget: 'swatch' | 'chips' | 'range' | 'multiselect';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterOptionValueDto)
  options?: FilterOptionValueDto[];

  @IsOptional()
  @IsNumber()
  min?: number;

  @IsOptional()
  @IsNumber()
  max?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCategories?: string[];
}

/** DTO for updating a filter option group */
export class UpdateFilterOptionDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(['swatch', 'chips', 'range', 'multiselect'])
  widget?: 'swatch' | 'chips' | 'range' | 'multiselect';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterOptionValueDto)
  options?: FilterOptionValueDto[];

  @IsOptional()
  @IsNumber()
  min?: number;

  @IsOptional()
  @IsNumber()
  max?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCategories?: string[];
}
