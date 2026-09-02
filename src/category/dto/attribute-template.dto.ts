import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsIn,
  IsBoolean,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Single field within an attribute template */
export class AttributeFieldDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsIn(['text', 'select', 'number', 'boolean'])
  type: 'text' | 'select' | 'number' | 'boolean';

  /** Required only when type is "select" */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

/** DTO for creating/replacing the entire attribute template for a subcategory */
export class CreateAttributeTemplateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttributeFieldDto)
  fields: AttributeFieldDto[];
}

/** DTO for partially updating fields in an attribute template */
export class UpdateAttributeTemplateDto {
  /** Fields to add (appended if name doesn't already exist) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeFieldDto)
  add?: AttributeFieldDto[];

  /** Field names to remove */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  remove?: string[];

  /** Fields to update (matched by name, replaced entirely) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeFieldDto)
  update?: AttributeFieldDto[];
}
