import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsMongoId, IsNumber } from 'class-validator';

/** DTO for creating a new category or subcategory */
export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  /** Pass null or omit for top-level category; pass a valid category ID for subcategory */
  @IsOptional()
  @IsMongoId()
  parentCategoryId?: string;

  @IsOptional()
  @IsMongoId({ each: true })
  parentCategoryIds?: string[];

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  bgColor?: string;

  @IsOptional()
  @IsBoolean()
  isTrending?: boolean;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
