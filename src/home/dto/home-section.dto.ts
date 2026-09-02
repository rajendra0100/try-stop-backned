import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  IsObject,
} from 'class-validator';

export class HomeSectionFilterDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  priceMax?: number;

  @IsOptional()
  @IsString()
  sort?: string;
}

export class CreateHomeSectionDto {
  @IsNotEmpty()
  @IsIn(['banner_carousel', 'category_grid', 'product_carousel', 'deal_strip'])
  type: 'banner_carousel' | 'category_grid' | 'product_carousel' | 'deal_strip';

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsObject()
  filter?: HomeSectionFilterDto;

  @IsNotEmpty()
  @IsString()
  style: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateHomeSectionDto {
  @IsOptional()
  @IsIn(['banner_carousel', 'category_grid', 'product_carousel', 'deal_strip'])
  type?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsObject()
  filter?: HomeSectionFilterDto;

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
