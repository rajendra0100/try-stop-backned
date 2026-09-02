import { IsArray, IsString, IsOptional } from 'class-validator';

/**
 * DTO for modifying product tags — add/remove specific tags.
 * Tags drive homepage carousels, search, and campaign pages.
 */
export class UpdateTagsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  add?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  remove?: string[];
}
